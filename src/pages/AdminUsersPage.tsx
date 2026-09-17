import { useCallback, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface SupplierRow {
  id: string;
  username: string;
  companyName: string | null;
  active: boolean;
  createdAt: string;
}

export default function AdminUsersPage() {
  const { data, reload } = usePolling<{ users: SupplierRow[] }>(
    useCallback(() => api('/admin/users'), []),
  );
  const [username, setUsername] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [password, setPassword] = useState('');
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/admin/users', { method: 'POST', body: { username, password, companyName } });
      setCreated({ username, password });
      setUsername('');
      setCompanyName('');
      setPassword('');
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '创建失败');
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(u: SupplierRow) {
    const pwd = prompt(`为「${u.companyName ?? u.username}」设置新密码（至少 8 位）：`);
    if (!pwd) return;
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { password: pwd } });
      alert('密码已重置');
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '操作失败');
    }
  }

  async function toggleActive(u: SupplierRow) {
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } });
      await reload();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '操作失败');
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <Link to="/admin" className="text-xs text-muted-foreground hover:underline">
          ← 返回
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">供应商账号</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>新建供应商账号</CardTitle>
          <CardDescription>创建后请将用户名和初始密码告知供应商</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createUser} className="grid gap-4 md:grid-cols-4 md:items-end">
            <div className="space-y-1.5">
              <Label>用户名</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>公司名称</Label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>初始密码（≥8 位）</Label>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <Button type="submit" disabled={busy}>
              创建
            </Button>
          </form>
          {created && (
            <p className="mt-3 rounded-md bg-muted p-3 text-xs">
              已创建 <b>{created.username}</b>，初始密码 <b>{created.password}</b> —— 请立即告知供应商并妥善保存。
            </p>
          )}
          {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>账号列表</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>公司名称</TableHead>
                <TableHead>用户名</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.users ?? []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.companyName}</TableCell>
                  <TableCell>{u.username}</TableCell>
                  <TableCell>
                    {u.active ? (
                      <Badge variant="success">启用</Badge>
                    ) : (
                      <Badge variant="secondary">停用</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(u.createdAt)}
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button variant="outline" size="sm" onClick={() => resetPassword(u)}>
                      重置密码
                    </Button>
                    <Button
                      variant={u.active ? 'destructive' : 'outline'}
                      size="sm"
                      onClick={() => toggleActive(u)}
                    >
                      {u.active ? '停用' : '启用'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
