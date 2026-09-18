import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth-context';
import { formatDateTime, isClosed } from '../lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface TenderRow {
  id: string;
  title: string;
  deadline: string;
  status: string;
  createdByUsername: string | null;
  quoteCount: number;
}

type StatusFilter = '' | 'open' | 'expired' | 'closed';

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: '', label: '全部' },
  { value: 'open', label: '报价中' },
  { value: 'expired', label: '已截止' },
  { value: 'closed', label: '已关闭' },
];

export default function AdminTendersPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [data, setData] = useState<{ tenders: TenderRow[] } | null>(null);
  const [error, setError] = useState('');

  const fetchTenders = useCallback(async (search: string, st: StatusFilter) => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('q', search.trim());
    if (st) params.set('status', st);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await api<{ tenders: TenderRow[] }>(`/admin/tenders${qs}`);
    setData(res);
  }, []);

  // 防抖搜索
  useEffect(() => {
    const t = setTimeout(() => {
      fetchTenders(q, status).catch((err) => {
        if (err instanceof ApiError) setError(err.message);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [q, status, fetchTenders]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">招标管理</h1>
          <p className="text-xs text-muted-foreground">管理员：{user?.username}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/users')}>
            供应商账号
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            退出登录
          </Button>
        </div>
      </div>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>全部招标</CardTitle>
          <Link
            to="/admin/tenders/new"
            className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            + 发布招标
          </Link>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Input
              placeholder="按标题或创建者搜索…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="max-w-xs"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className="flex h-9 rounded-md border border-input bg-card px-3 text-sm"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {(q || status) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQ('');
                  setStatus('');
                }}
              >
                清除
              </Button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {(data?.tenders ?? []).length} 条
            </span>
          </div>

          {error && <p className="mb-2 text-xs text-destructive">{error}</p>}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>标题</TableHead>
                <TableHead>创建者</TableHead>
                <TableHead>截止时间</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>报价数</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.tenders ?? []).map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.title}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {t.createdByUsername ?? <span className="opacity-50">系统</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(t.deadline)}
                  </TableCell>
                  <TableCell>
                    {t.status === 'closed' ? (
                      <Badge variant="secondary">已关闭</Badge>
                    ) : isClosed(t.status, t.deadline) ? (
                      <Badge variant="secondary">已截止</Badge>
                    ) : (
                      <Badge>报价中</Badge>
                    )}
                  </TableCell>
                  <TableCell>{t.quoteCount}</TableCell>
                  <TableCell className="text-right">
                    <Link
                      to={`/admin/tenders/${t.id}`}
                      className="inline-flex h-8 items-center rounded-md border border-input bg-card px-3 text-xs font-medium hover:bg-muted"
                    >
                      查看
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {data && data.tenders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    {q || status ? '没有匹配的招标' : '暂无招标'}
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