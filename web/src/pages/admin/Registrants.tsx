// イベントの申込者の一覧（管理者）。申込日時の古い順に並べる
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { LoadError } from '@/components/Status';
import { db } from '@/lib/firebase';
import { formatDateTime } from '@/lib/format';
import { listRegistrations } from '@/lib/registrations';
import { adminEventsKey } from './adminEventsKey';

export function Registrants({ eventId }: { eventId: string }) {
  const regs = useQuery({ queryKey: [...adminEventsKey, eventId, 'registrations'], queryFn: () => listRegistrations(db, eventId) });

  if (regs.isPending) return <section className="card" aria-busy="true"><div className="skeleton" style={{ height: 60 }} /></section>;
  if (regs.isError) return <LoadError />;

  return (
    <section className="card">
      <h2 className="card-title">申込者（{regs.data.length} 人）</h2>
      {regs.data.length === 0 ? (
        <p>まだ申込はありません。</p>
      ) : (
        <ol className="registrants">
          {regs.data.map((r) => (
            <li key={r.uid}>
              <div>
                {r.realName}
                <span className="card-subtitle">（{r.nickname}）</span>
              </div>
              <div className="help">
                {r.email}
                {r.createdAt && ` ・ ${formatDateTime(r.createdAt.toDate())}`}
              </div>
            </li>
          ))}
        </ol>
      )}
      {regs.data.length > 0 && (
        <Link to={`/admin/mails/new?event=${eventId}`} className="button-secondary">
          申込者にメールを送る
        </Link>
      )}
    </section>
  );
}
