import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">标题</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
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
