import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth-context';
import { usePolling } from '../use-polling';
import { formatDateTime } from '../lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface TenderRow {
  id: string;
  title: string;
  deadline: string;
  status: string;
  hasQuote: boolean;
  effectiveClosed: boolean;
  myAmount: string | null;
  myRank: number | null;
  totalParticipants: number;
}

export default function SupplierTendersPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data } = usePolling<{ tenders: TenderRow[] }>(
    useCallback(() => api('/tenders'), []),
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">招标列表</h1>
          <p className="text-xs text-muted-foreground">{user?.companyName ?? user?.username}</p>
        </div>
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
      <Card>
        <CardHeader>
          <CardTitle>全部招标</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>标题</TableHead>
                <TableHead>截止时间</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>我的报价</TableHead>
                <TableHead>我的名次</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.tenders ?? []).map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.title}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(t.deadline)}</TableCell>
                  <TableCell>
                    {t.effectiveClosed ? (
                      <Badge variant="secondary">已截止</Badge>
                    ) : (
                      <Badge>报价中</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {t.myAmount ? (
                      `¥${t.myAmount}`
                    ) : (
                      <span className="text-muted-foreground">未报价</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {t.myRank ? (
                      <Badge variant={t.myRank === 1 ? 'success' : 'outline'}>
                        第 {t.myRank} 名 / 共 {t.totalParticipants} 家
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      to={`/tenders/${t.id}`}
                      className="inline-flex h-8 items-center rounded-md border border-input bg-card px-3 text-xs font-medium hover:bg-muted"
                    >
                      进入
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {data && data.tenders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
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
