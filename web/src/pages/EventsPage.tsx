// イベントの一覧（メンバー）。これからのイベントは開始の早い順、過去のイベントは新しい順に並べる
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { EventBadge } from '@/components/EventBadge';
import { useMember } from '@/components/RequireMember';
import { Loading, LoadError } from '@/components/Status';
import { eventKeys } from '@/lib/eventKeys';
import { listPublishedEvents, type EventDoc } from '@/lib/events';
import { db } from '@/lib/firebase';
import { formatEventDate } from '@/lib/format';
import { listMyRegistrations, registrationStatus } from '@/lib/registrations';

export function EventsPage() {
  const me = useMember();
  const events = useQuery({ queryKey: eventKeys.published, queryFn: () => listPublishedEvents(db) });
  const mine = useQuery({ queryKey: eventKeys.myRegistrations(me.uid), queryFn: () => listMyRegistrations(db, me.uid) });

  if (events.isPending || mine.isPending) return <Loading />;
  if (events.isError || mine.isError) return <LoadError />;

  const now = new Date();
  const registered = new Set(mine.data.map((r) => r.eventId));
  const upcoming = events.data
    .filter((e) => e.endAt.toMillis() > now.getTime())
    .sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis());
  const past = events.data
    .filter((e) => e.endAt.toMillis() <= now.getTime())
    .sort((a, b) => b.startAt.toMillis() - a.startAt.toMillis());

  return (
    <main className="main">
      <h1>イベント</h1>

      <section className="stack" aria-labelledby="upcoming">
        <h2 id="upcoming" className="list-heading">
          これからのイベント
        </h2>
        {upcoming.length === 0 ? (
          <p>予定しているイベントはありません。</p>
        ) : (
          <EventList events={upcoming} registered={registered} now={now} />
        )}
      </section>

      {past.length > 0 && (
        <section className="stack" aria-labelledby="past">
          <h2 id="past" className="list-heading">
            過去のイベント
          </h2>
          <EventList events={past} registered={registered} now={now} />
        </section>
      )}
    </main>
  );
}

function EventList({ events, registered, now }: { events: EventDoc[]; registered: Set<string>; now: Date }) {
  return (
    <ul className="list">
      {events.map((event) => (
        <li key={event.id}>
          <Link to={`/events/${event.id}`} className="card card-link">
            <div className="badges">
              <EventBadge status={registrationStatus(event, registered.has(event.id), now)} />
            </div>
            <h3 className="card-title">{event.title}</h3>
            <dl className="summary">
              <dt>日時</dt>
              <dd>{formatEventDate(event.startAt.toDate(), event.endAt.toDate())}</dd>
              <dt>会場</dt>
              <dd>{event.venue}</dd>
            </dl>
          </Link>
        </li>
      ))}
    </ul>
  );
}
