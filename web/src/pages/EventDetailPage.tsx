// イベントの詳細（メンバー）。本文（Markdown）を表示し、申込とキャンセルができる。
// 下書きは管理者だけが読める（ほかの人には「見つかりません」と出る）
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { EventBadge } from '@/components/EventBadge';
import { Markdown } from '@/components/Markdown';
import { useMember } from '@/components/RequireMember';
import { Loading, LoadError } from '@/components/Status';
import { isPermissionDenied } from '@/lib/errors';
import { eventKeys } from '@/lib/eventKeys';
import { getEvent, type EventDoc } from '@/lib/events';
import { db } from '@/lib/firebase';
import { formatDateTime, formatEventDate } from '@/lib/format';
import { isAdminRole, type Member } from '@/lib/membership';
import { cancelRegistration, getMyRegistration, register, registrationStatus } from '@/lib/registrations';
import { adminEventsKey } from '@/pages/admin/adminEventsKey';

export function EventDetailPage() {
  const { id = '' } = useParams();
  const me = useMember();
  const event = useQuery({
    queryKey: eventKeys.detail(id),
    // 下書きを参加者が開いたときは権限のエラーになるので、「見つかりません」と同じに扱う
    queryFn: async () => {
      try {
        return await getEvent(db, id);
      } catch (e) {
        if (isPermissionDenied(e)) return null;
        throw e;
      }
    },
  });
  const registration = useQuery({
    queryKey: eventKeys.myRegistration(id, me.uid),
    queryFn: () => getMyRegistration(db, id, me.uid),
    enabled: !!event.data,
  });

  if (event.isPending) return <Loading />;
  if (event.isError) return <LoadError />;
  if (!event.data) {
    return (
      <main className="main">
        <section className="card">
          <h1 className="card-title">イベントが見つかりません</h1>
          <p>URL が間違っているか、イベントが削除された可能性があります。</p>
          <Link to="/events" className="button-secondary">
            イベントの一覧へ
          </Link>
        </section>
      </main>
    );
  }
  if (registration.isPending) return <Loading />;
  if (registration.isError) return <LoadError />;

  return <EventDetail event={event.data} registered={!!registration.data} me={me} />;
}

function EventDetail({ event, registered, me }: { event: EventDoc; registered: boolean; me: Member }) {
  const status = registrationStatus(event, registered, new Date());
  const start = event.startAt.toDate();
  const deadline = event.deadlineAt.toDate();
  const remaining = event.capacity === null ? null : Math.max(event.capacity - event.registrationCount, 0);

  return (
    <main className="main">
      <p className="back">
        <Link to="/events">← イベントの一覧</Link>
      </p>
      <article className="stack-lg">
        <div className="badges">
          <EventBadge status={status} />
        </div>
        <h1>{event.title}</h1>
        <dl className="summary card">
          <dt>日時</dt>
          <dd>{formatEventDate(start, event.endAt.toDate())}</dd>
          <dt>会場</dt>
          <dd>
            {event.venue}
            {event.address && <span className="address">{event.address}</span>}
          </dd>
          <dt>定員</dt>
          <dd>
            {event.capacity === null ? '定員なし' : `${event.capacity} 人（残り ${remaining} 人）`}
          </dd>
          <dt>申込の締切</dt>
          <dd>{deadline.getTime() === start.getTime() ? '開始日時まで' : formatDateTime(deadline)}</dd>
        </dl>

        <RegistrationPanel event={event} status={status} me={me} />

        {event.body && <Markdown text={event.body} />}

        {isAdminRole(me.role) && (
          <Link to={`/admin/events/${event.id}`} className="button-secondary">
            このイベントを編集する（申込者を見る）
          </Link>
        )}
      </article>
    </main>
  );
}

function RegistrationPanel({ event, status, me }: { event: EventDoc; status: ReturnType<typeof registrationStatus>; me: Member }) {
  const queryClient = useQueryClient();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  // 成功しても失敗しても読み直す（ほかの人の申込で、定員や申込数が変わっていることがあるため）
  const refetch = async () => {
    await queryClient.invalidateQueries({ queryKey: eventKeys.all });
    await queryClient.invalidateQueries({ queryKey: adminEventsKey });
  };
  const apply = useMutation({ mutationFn: () => register(db, event.id, me), onSettled: refetch });
  const cancel = useMutation({
    mutationFn: () => cancelRegistration(db, event.id, me.uid),
    onSettled: async () => {
      setConfirmingCancel(false);
      await refetch();
    },
  });
  const busy = apply.isPending || cancel.isPending;
  const startText = formatDateTime(event.startAt.toDate());

  const errorMessage = apply.isError
    ? isPermissionDenied(apply.error)
      ? '申し込めませんでした。定員に達したか、締切を過ぎた可能性があります。'
      : '申し込めませんでした。通信状況を確認して、もう一度お試しください。'
    : cancel.isError
      ? isPermissionDenied(cancel.error)
        ? 'キャンセルできませんでした。開始日時を過ぎた可能性があります。'
        : 'キャンセルできませんでした。通信状況を確認して、もう一度お試しください。'
      : null;

  return (
    <section className="card" aria-label="申込">
      {errorMessage && (
        <p className="error" role="alert">
          {errorMessage}
        </p>
      )}
      {status === 'open' && (
        <button type="button" className="button-primary" disabled={busy} onClick={() => apply.mutate()}>
          申し込む
        </button>
      )}
      {status === 'registered' &&
        (confirmingCancel ? (
          <div className="confirm" role="group" aria-label="キャンセルの確認">
            <p>このイベントへの申し込みをキャンセルします。よろしいですか？</p>
            <div className="actions">
              <button type="button" className="button-danger" disabled={busy} onClick={() => cancel.mutate()}>
                キャンセルする
              </button>
              <button type="button" className="button-secondary" disabled={busy} onClick={() => setConfirmingCancel(false)}>
                やめる
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="done">申し込み済みです。</p>
            <p className="help">キャンセルできるのは、開始日時（{startText}）までです。</p>
            <button type="button" className="button-secondary" disabled={busy} onClick={() => setConfirmingCancel(true)}>
              申し込みをキャンセルする
            </button>
          </>
        ))}
      {status === 'registered-started' && <p className="done">申し込み済みです。</p>}
      {status === 'full' && <p>定員に達したため、申し込みを締め切りました。</p>}
      {status === 'closed' && <p>申し込みは締め切りました。</p>}
      {status === 'ended' && <p>このイベントは終了しました。</p>}
      {status === 'draft' && <p>下書きのため、申し込めません。管理者だけが見られます。</p>}
    </section>
  );
}
