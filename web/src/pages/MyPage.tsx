// マイページ（メンバー）。自分の情報と、申し込んだイベント（これから・参加した）を表示する。
// キャンセルはイベントの詳細画面で行う
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useMember } from '@/components/RequireMember';
import { Loading, LoadError } from '@/components/Status';
import { isPermissionDenied } from '@/lib/errors';
import { eventKeys } from '@/lib/eventKeys';
import { getEvent, type EventDoc } from '@/lib/events';
import { db } from '@/lib/firebase';
import { formatDateTime, formatEventDate } from '@/lib/format';
import type { Role } from '@/lib/membership';
import { splitMyEvents, type MyEvent } from '@/lib/myPage';
import { listMyRegistrations } from '@/lib/registrations';

const roleLabels: Record<Role, string> = { owner: '特権管理者', admin: '管理者', member: '参加者' };

/** 自分の申込と、そのイベントを読む。下書きに戻されたなどで読めないイベントは null にする */
async function loadMyEvents(uid: string) {
  const registrations = await listMyRegistrations(db, uid);
  const entries = await Promise.all(
    registrations.map(async (r): Promise<[string, EventDoc | null]> => {
      try {
        return [r.eventId, await getEvent(db, r.eventId)];
      } catch (e) {
        if (isPermissionDenied(e)) return [r.eventId, null];
        throw e;
      }
    }),
  );
  return { registrations, events: new Map(entries) };
}

export function MyPage() {
  const me = useMember();
  const data = useQuery({ queryKey: eventKeys.myPage(me.uid), queryFn: () => loadMyEvents(me.uid) });

  if (data.isPending) return <Loading />;
  if (data.isError) return <LoadError />;

  const { upcoming, past, hiddenCount } = splitMyEvents(data.data.registrations, data.data.events, new Date());

  return (
    <main className="main">
      <h1>マイページ</h1>

      <section className="stack" aria-labelledby="my-upcoming">
        <h2 id="my-upcoming" className="list-heading">
          これから参加するイベント
        </h2>
        {upcoming.length === 0 ? (
          <div className="card">
            <p>申し込んでいるイベントはありません。</p>
            <Link to="/events" className="button-secondary">
              イベントの一覧へ
            </Link>
          </div>
        ) : (
          <MyEventList items={upcoming} />
        )}
      </section>

      {past.length > 0 && (
        <section className="stack" aria-labelledby="my-past">
          <h2 id="my-past" className="list-heading">
            参加したイベント
          </h2>
          <MyEventList items={past} />
        </section>
      )}

      {hiddenCount > 0 && <p className="help">非公開になったイベントが {hiddenCount} 件あります。</p>}

      <section className="card" aria-labelledby="my-profile">
        <h2 id="my-profile" className="card-title">
          あなたの情報
        </h2>
        <dl className="summary">
          <dt>名前（本名）</dt>
          <dd>{me.realName}</dd>
          <dt>ニックネーム</dt>
          <dd>{me.nickname}</dd>
          <dt>メールアドレス</dt>
          <dd>{me.email}</dd>
          <dt>役割</dt>
          <dd>{roleLabels[me.role]}</dd>
          <dt>参加日時</dt>
          <dd>{me.joinedAt ? formatDateTime(me.joinedAt.toDate()) : '—'}</dd>
        </dl>
      </section>
    </main>
  );
}

function MyEventList({ items }: { items: MyEvent[] }) {
  return (
    <ul className="list">
      {items.map(({ event }) => (
        <li key={event.id}>
          <Link to={`/events/${event.id}`} className="card card-link">
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
