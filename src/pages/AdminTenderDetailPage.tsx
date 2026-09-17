import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { usePolling } from '../use-polling';
import { formatDateTime, isClosed } from '../lib/utils';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

interface BoardQuote {
  id: string;
  companyName: string | null;
  amount: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  rank: number;
}

interface AdminDetail {
  tender: {
    id: string;
    title: string;
    description: string | null;
    deadline: string;
    status: string;
    invitedSupplierIds: string[];
  };
  quotes: BoardQuote[];
}

interface SupplierRow {
  id: string;
  username: string;
  companyName: string | null;
  active: boolean;
}

export default function AdminTenderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const fetcher = useCallback(() => api<AdminDetail>(`/admin/tenders/${id}`), [id]);
  const { data } = usePolling(fetcher);

  const { data: usersData } = usePolling<{ users: SupplierRow[] }>(
    useCallback(() => api('/admin/users'), []),
  );
  const allSuppliers = (usersData?.users ?? []).filter((u) => u.active);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [invitedInitialized, setInvitedInitialized] = useState(false);

  useEffect(() => {
    if (data && !initialized) {
      setTitle(data.tender.title);
      setDescription(data.tender.description ?? '');
      setDeadline(data.tender.deadline.slice(0, 16));
      setInitialized(true);
    }
    if (data && !invitedInitialized) {
      setInvited(new Set(data.tender.invitedSupplierIds ?? []));
      setInvitedInitialized(true);
    }
  }, [data, initialized, invitedInitialized]);

  function toggleInvited(sid: string) {
    setInvited((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  }

  if (!data) return <div className="p-6 text-muted-foreground">加载中…</div>;
  const t = data.tender;
  const locked = t.status === 'closed' || isClosed(t.status, t.deadline);

  async function saveEdit() {
    setMsg('');
    setError('');
    try {
      await api(`/admin/tenders/${id}`, {
        method: 'PATCH',
        body: {
          title,
          description: description || null,
          ...(deadline ? { deadline: new Date(deadline).toISOString() } : {}),
          invitedSupplierIds: Array.from(invited),
        },
      });
      setMsg('已保存');
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败');
    }
  }

  async function closeTender() {
    setError('');
    if (!confirm('确定提前关闭该招标？关闭后供应商无法再报价。')) return;
    try {
      await api(`/admin/tenders/${id}/close`, { method: 'POST' });
      setMsg('已关闭');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '操作失败');
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <Link to="/admin" className="text-xs text-muted-foreground hover:underline">
          ← 返回
        </Link>
        <div className="mt-1 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{t.title}</h1>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span>截止：{formatDateTime(t.deadline)}</span>
              {t.status === 'closed' ? (
                <Badge variant="secondary">已关闭</Badge>
              ) : locked ? (
                <Badge variant="secondary">已截止</Badge>
              ) : (
                <Badge>报价中</Badge>
              )}
              <span>·</span>
              <span>已邀请 {t.invitedSupplierIds.length} 家供应商</span>
            </div>
          </div>
          <div className="flex gap-2">
            {!locked && !editing && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                编辑
              </Button>
            )}
            {t.status !== 'closed' && (
              <Button variant="destructive" size="sm" onClick={closeTender}>
                提前关闭
              </Button>
            )}
          </div>
        </div>
        {msg && <p className="mt-2 text-xs text-green-700">{msg}</p>}
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>

      {editing && (
        <Card>
          <CardHeader>
            <CardTitle>编辑招标</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>标题</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>招标说明</Label>
              <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>截止时间</Label>
              <Input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>邀请供应商（{invited.size} / {allSuppliers.length}）</Label>
              {allSuppliers.length === 0 ? (
                <p className="text-xs text-muted-foreground">暂无启用的供应商账号</p>
              ) : (
                <div className="space-y-1 rounded-md border border-input p-3 max-h-60 overflow-auto">
                  {allSuppliers.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={invited.has(s.id)}
                        onChange={() => toggleInvited(s.id)}
                      />
                      <span className="font-medium">{s.companyName ?? s.username}</span>
                      <span className="text-xs text-muted-foreground">@{s.username}</span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                保存时将整体替换邀请名单（已勾选=邀请；未勾选=取消）
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEdit}>
                保存
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!editing && t.description && (
        <Card>
          <CardHeader>
            <CardTitle>招标说明</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{t.description}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>报价榜</CardTitle>
          <CardDescription>
            共 {data.quotes.length} 家参与 · 含历史报价 · 同价先提交者优先
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">名次</TableHead>
                <TableHead>公司</TableHead>
                <TableHead>报价金额（元）</TableHead>
                <TableHead>首次提交</TableHead>
                <TableHead>最近更新</TableHead>
                <TableHead>备注</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.quotes.map((q) => (
                <TableRow key={q.id}>
                  <TableCell>
                    <Badge variant={q.rank === 1 ? 'success' : 'outline'}>{q.rank}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">{q.companyName ?? '-'}</TableCell>
                  <TableCell className="font-medium">¥{q.amount}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(q.createdAt)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(q.updatedAt)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{q.note ?? '-'}</TableCell>
                </TableRow>
              ))}
              {data.quotes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    暂无报价
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
