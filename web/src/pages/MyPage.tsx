// マイページ（メンバー）。自分の情報と、申し込んだイベント（これから・参加した）を表示する。
// 自分の本名とニックネームはここで変えられる。キャンセルはイベントの詳細画面で行う
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMember } from '@/components/RequireMember';
import { Loading, LoadError } from '@/components/Status';
import { TextField } from '@/components/TextField';
import { isPermissionDenied } from '@/lib/errors';
import { eventKeys } from '@/lib/eventKeys';
import { getEvent, type EventDoc } from '@/lib/events';
import { db } from '@/lib/firebase';
import { formatDateTime, formatEventDate } from '@/lib/format';
import { LIMITS } from '@/lib/limits';
import { isAdminRole, updateProfile, type Member, type Role } from '@/lib/membership';
import { profileSyncEventIds, splitMyEvents, type MyEvent } from '@/lib/myPage';
import { listMyRegistrations } from '@/lib/registrations';
import { useSession } from '@/session/SessionProvider';

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

  const now = new Date();
  const { upcoming, past, hiddenCount } = splitMyEvents(data.data.registrations, data.data.events, now);
  const syncEventIds = profileSyncEventIds(data.data.registrations, data.data.events, now);

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

      <Profile me={me} syncEventIds={syncEventIds} />

      {!isAdminRole(me.role) && (
        <section className="card" aria-labelledby="my-contact">
          <h2 id="my-contact" className="card-title">
            管理者への連絡
          </h2>
          <p>イベントやグループについて、管理者にメールで問い合わせられます。</p>
          <Link to="/contact" className="button-secondary">
            管理者に問い合わせる
          </Link>
        </section>
      )}
    </main>
  );
}

/** あなたの情報。「変更する」で本名とニックネームを編集する */
function Profile({ me, syncEventIds }: { me: Member; syncEventIds: string[] }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <section className="card" aria-labelledby="my-profile">
      <h2 id="my-profile" className="card-title">
        あなたの情報
      </h2>
      {editing ? (
        <ProfileForm
          me={me}
          syncEventIds={syncEventIds}
          onDone={(changed) => {
            setEditing(false);
            setSaved(changed);
          }}
        />
      ) : (
        <>
          {saved && (
            <p className="notice" role="status">
              変更しました。
            </p>
          )}
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
          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              setSaved(false);
              setEditing(true);
            }}
          >
            名前を変更する
          </button>
        </>
      )}
    </section>
  );
}

function ProfileForm({
  me,
  syncEventIds,
  onDone,
}: {
  me: Member;
  syncEventIds: string[];
  onDone: (changed: boolean) => void;
}) {
  const { refresh } = useSession();
  const queryClient = useQueryClient();
  const [realName, setRealName] = useState(me.realName);
  const [nickname, setNickname] = useState(me.nickname);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const input = { realName: realName.trim(), nickname: nickname.trim() };
    if (input.realName === me.realName && input.nickname === me.nickname) {
      onDone(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateProfile(db, me.uid, input, syncEventIds);
      await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: eventKeys.all })]);
      onDone(true);
    } catch (e) {
      // 名前の変更が済んでから申込の写しで失敗したときも、読み直して今の状態を見せる
      await refresh().catch(() => {});
      setError(
        isPermissionDenied(e)
          ? '変更できませんでした。入力内容を確認して、もう一度お試しください。'
          : '変更できませんでした。通信状況を確認して、もう一度お試しください。',
      );
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={(e) => void handleSubmit(e)}>
      <TextField
        label="名前（本名）"
        value={realName}
        onChange={setRealName}
        maxLength={LIMITS.personName}
        required
        help="管理者だけが見られます。"
      />
      <TextField
        label="ニックネーム"
        value={nickname}
        onChange={setNickname}
        maxLength={LIMITS.personName}
        required
        help="グループの中で表示する名前です。"
      />
      <p className="help">
        メールアドレスはログインに使っている Google アカウントのものです。ここでは変えられません。
        {syncEventIds.length > 0 && `申し込んでいる開催前のイベント ${syncEventIds.length} 件にも、新しい名前を反映します。`}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="button-primary" disabled={busy}>
          保存する
        </button>
        <button type="button" className="button-secondary" disabled={busy} onClick={() => onDone(false)}>
          やめる
        </button>
      </div>
    </form>
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
