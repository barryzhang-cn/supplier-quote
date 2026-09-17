import { useCallback, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { usePolling } from '../use-polling';
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

interface SupplierRow {
  id: string;
  username: string;
  companyName: string | null;
  active: boolean;
}

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

export default function AdminTenderNewPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState(
    toLocalInputValue(new Date(Date.now() + 3 * 86400_000)),
  );
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: usersData } = usePolling<{ users: SupplierRow[] }>(
    useCallback(() => api('/admin/users'), []),
  );
  const suppliers = (usersData?.users ?? []).filter((u) => u.active);

  function toggle(id: string) {
    setInvited((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api<{ tender: { id: string } }>('/admin/tenders', {
        method: 'POST',
        body: {
          title,
          description: description || null,
          deadline: new Date(deadline).toISOString(),
          invitedSupplierIds: Array.from(invited),
        },
      });
      navigate(`/admin/tenders/${d.tender.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <Link to="/admin" className="text-xs text-muted-foreground hover:underline">
          ← 返回
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">发布招标</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>招标信息</CardTitle>
          <CardDescription>
            默认不邀请任何供应商；下方显式勾选才能报价
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">标题</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">招标说明（可选）</Label>
              <Textarea
                id="description"
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deadline">报价截止时间</Label>
              <Input
                id="deadline"
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>邀请供应商（{invited.size} / {suppliers.length}）</Label>
              {suppliers.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  暂无启用的供应商账号，请先在「供应商账号」创建
                </p>
              ) : (
                <div className="space-y-1 rounded-md border border-input p-3 max-h-60 overflow-auto">
                  {suppliers.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={invited.has(s.id)}
                        onChange={() => toggle(s.id)}
                      />
                      <span className="font-medium">{s.companyName ?? s.username}</span>
                      <span className="text-xs text-muted-foreground">@{s.username}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" disabled={busy}>
              {busy ? '创建中…' : '创建招标'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
