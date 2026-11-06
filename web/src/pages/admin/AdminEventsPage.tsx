// イベントの一覧（管理者）。下書きも含めて、開始日時の新しい順に並べる
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Loading, LoadError } from '@/components/Status';
import { listAllEvents, type EventDoc } from '@/lib/events';
import { db } from '@/lib/firebase';
import { formatEventDate } from '@/lib/format';
import { adminEventsKey } from './adminEventsKey';

export function AdminEventsPage() {
  const events = useQuery({ queryKey: adminEventsKey, queryFn: () => listAllEvents(db) });

  if (events.isPending) return <Loading />;
  if (events.isError) return <LoadError />;

  return (
    <main className="main">
      <h1>イベント管理</h1>
      <Link to="/admin/events/new" className="button-primary">
        新しいイベントを作る
      </Link>
      {events.data.length === 0 ? (
        <p>イベントはまだありません。</p>
      ) : (
        <ul className="list">
          {events.data.map((event) => (
            <li key={event.id}>
              <AdminEventItem event={event} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function AdminEventItem({ event }: { event: EventDoc }) {
  return (
    <Link to={`/admin/events/${event.id}`} className="card card-link">
      <div className="badges">
        {event.published ? <span className="badge">公開中</span> : <span className="badge badge-draft">下書き</span>}
      </div>
      <h2 className="card-title">{event.title}</h2>
      <dl className="summary">
        <dt>日時</dt>
        <dd>{formatEventDate(event.startAt.toDate(), event.endAt.toDate())}</dd>
        <dt>会場</dt>
        <dd>{event.venue}</dd>
        <dt>申込</dt>
        <dd>
          {event.registrationCount} 人{event.capacity === null ? '（定員なし）' : ` / 定員 ${event.capacity} 人`}
        </dd>
      </dl>
    </Link>
  );
}
