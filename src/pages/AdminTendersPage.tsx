import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth-context';
import { usePolling } from '../use-polling';
import { formatDateTime, isClosed } from '../lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface TenderRow {
  id: string;
  title: string;
  deadline: string;
  status: string;
  quoteCount: number;
}

export default function AdminTendersPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data } = usePolling<{ tenders: TenderRow[] }>(
    useCallback(() => api('/admin/tenders'), []),
  );

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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>标题</TableHead>
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
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    暂无招标
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
