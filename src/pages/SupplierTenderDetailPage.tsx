import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { usePolling } from '../use-polling';
import { formatDateTime } from '../lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface Detail {
  tender: {
    id: string;
    title: string;
    description: string | null;
    deadline: string;
    status: string;
  };
  myQuote: {
    amount: string;
    note: string | null;
    createdAt: string;
    updatedAt: string;
    rank: number | null;
  } | null;
  totalParticipants: number;
  effectiveClosed: boolean;
}

export default function SupplierTenderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const fetcher = useCallback(() => api<Detail>(`/tenders/${id}`), [id]);
  const { data } = usePolling(fetcher);
  useEffect(() => {
    if (data) {
      setDetail(data);
      if (!amount) setAmount(data.myQuote?.amount ?? '');
      if (!note) setNote(data.myQuote?.note ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const locked = detail?.effectiveClosed ?? false;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    setError('');
    try {
      await api(`/tenders/${id}/quote`, { method: 'PUT', body: { amount, note: note || null } });
      setMsg('报价已保存');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }

  if (!detail) return <div className="p-6 text-muted-foreground">加载中…</div>;

  return (
    <div className="space-y-6 p-6">
      <div>
        <Link to="/" className="text-xs text-muted-foreground hover:underline">
          ← 返回列表
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{detail.tender.title}</h1>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span>截止：{formatDateTime(detail.tender.deadline)}</span>
          {locked ? <Badge variant="secondary">已截止</Badge> : <Badge>报价中</Badge>}
        </div>
      </div>

      {detail.tender.description && (
        <Card>
          <CardHeader>
            <CardTitle>招标说明</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{detail.tender.description}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>我的报价</CardTitle>
            <CardDescription>
              {locked
                ? '报价已截止，以下为最终报价，不可修改'
                : '截止时间前可多次修改报价，以最新一次保存为准'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="amount">报价金额（元）</Label>
                <Input
                  id="amount"
                  inputMode="decimal"
                  placeholder="例如 12800.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={locked || busy}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="note">备注（可选）</Label>
                <Textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={locked || busy}
                />
              </div>
              {msg && <p className="text-xs text-green-700">{msg}</p>}
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button type="submit" disabled={locked || busy}>
                {detail.myQuote ? '修改报价' : '提交报价'}
              </Button>
            </form>
            {detail.myQuote && (
              <div className="mt-4 space-y-0.5 text-xs text-muted-foreground">
                <p>首次提交：{formatDateTime(detail.myQuote.createdAt)}</p>
                <p>最近更新：{formatDateTime(detail.myQuote.updatedAt)}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>我的名次</CardTitle>
            <CardDescription>实时刷新（每 5 秒）· 名次按金额从低到高，同价先提交者优先</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center gap-1 py-8">
            {detail.myQuote?.rank != null ? (
              <>
                <span className="text-4xl font-semibold text-primary">第 {detail.myQuote.rank} 名</span>
                <span className="text-xs text-muted-foreground">
                  共 {detail.totalParticipants} 家参与
                </span>
              </>
            ) : detail.myQuote ? (
              <span className="text-sm text-muted-foreground">名次计算中…</span>
            ) : (
              <span className="text-sm text-muted-foreground">提交报价后显示名次</span>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
