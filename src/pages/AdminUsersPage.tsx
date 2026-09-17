import { useCallback, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth-context';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface UserRow {
  id: string;
  username: string;
  role: 'admin' | 'procurement' | 'supplier';
  companyName: string | null;
  active: boolean;
  createdBy: string | null;
  createdAt: string;
}

function roleBadge(role: 'admin' | 'procurement' | 'supplier') {
  switch (role) {
    case 'admin':
      return <Badge variant="destructive">超级管理员</Badge>;
    case 'procurement':
      return <Badge>招标管理员</Badge>;
    case 'supplier':
      return <Badge variant="secondary">供应商</Badge>;
  }
}

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const isAdmin = me?.role === 'admin';
  const isProcurement = me?.role === 'procurement';
  const { data, reload } = usePolling<{ users: UserRow[] }>(
    useCallback(() => api('/admin/users'), []),
  );
  const [username, setUsername] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'procurement' | 'supplier'>('supplier');
  const [created, setCreated] = useState<{ username: string; password: string; role: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/admin/users', {
        method: 'POST',
        body: { username, password, companyName, role },
      });
      setCreated({ username, password, role });
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

  async function resetPassword(u: UserRow) {
    const pwd = prompt(`为「${u.companyName ?? u.username}」设置新密码（至少 8 位）：`);
    if (!pwd) return;
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { password: pwd } });
      alert('密码已重置');
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '操作失败');
    }
  }

  async function toggleActive(u: UserRow) {
    const verb = u.active ? '停用' : '启用';
    if (!confirm(`确认${verb}账号「${u.companyName ?? u.username}」？`)) return;
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } });
      await reload();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '操作失败');
    }
  }

  async function deleteUser(u: UserRow) {
    if (!confirm(`确认永久删除账号「${u.companyName ?? u.username}」？该操作不可撤销。`)) return;
    try {
      await api(`/admin/users/${u.id}`, { method: 'DELETE' });
      await reload();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '操作失败');
    }
  }

  // procurement 看到的可创建角色：supplier + procurement（不能选 admin）
  const availableRoles: Array<'procurement' | 'supplier' | 'admin'> = isAdmin
    ? ['supplier', 'procurement', 'admin']
    : ['supplier', 'procurement'];

  // 仅超级管理员拥有：重置密码 / 停用 / 删除任何非系统账号
  const canManageInternal = isAdmin;

  return (
    <div className="space-y-6 p-6">
      <div>
        <Link to="/admin" className="text-xs text-muted-foreground hover:underline">
          ← 返回
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">账号管理</h1>
        <p className="text-xs text-muted-foreground">
          {isAdmin
            ? '可创建管理员、招标管理员、供应商账号；系统管理员账号受保护，不会出现在此列表'
            : '可创建供应商与招标管理员账号；只能看到自己创建的相关账号'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>新建账号</CardTitle>
          <CardDescription>创建后请将用户名与初始密码告知对应人员</CardDescription>
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
              <Label>公司 / 显示名</Label>
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
            <div className="space-y-1.5">
              <Label>角色</Label>
              <select
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as 'admin' | 'procurement' | 'supplier')
                }
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm"
              >
                {availableRoles.map((r) => (
                  <option key={r} value={r}>
                    {r === 'supplier'
                      ? '供应商'
                      : r === 'procurement'
                      ? '招标管理员'
                      : '超级管理员'}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-4">
              <Button type="submit" disabled={busy}>
                创建
              </Button>
            </div>
          </form>
          {created && (
            <p className="mt-3 rounded-md bg-muted p-3 text-xs">
              已创建 <b>{created.username}</b>（{created.role}），初始密码 <b>{created.password}</b> —— 请立即告知本人并妥善保存。
            </p>
          )}
          {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>账号列表</CardTitle>
          <CardDescription>
            {isProcurement ? '所有供应商账号 + 你创建的其他账号' : '除系统管理员外的全部账号'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>角色</TableHead>
                <TableHead>公司 / 显示名</TableHead>
                <TableHead>用户名</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.users ?? []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{roleBadge(u.role)}</TableCell>
                  <TableCell className="font-medium">{u.companyName ?? '-'}</TableCell>
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
                    {/* 超级管理员可以管理所有非系统账号；procurement 只能重置自己创建的 supplier 密码 */}
                    {canManageInternal || (isProcurement && u.role === 'supplier' && u.createdBy === me?.id) ? (
                      <>
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
                      </>
                    ) : null}
                    {canManageInternal && u.id !== me?.id && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteUser(u)}
                      >
                        删除
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {data && data.users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    暂无账号
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