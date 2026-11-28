// マイページ（メンバー）。自分の情報と、申し込んだイベント（これから・参加した）を表示する。
// 自分の本名とニックネームの変更、メンバー一覧に出す自己紹介と URL の編集、退会もここで行う。キャンセルはイベントの詳細画面で行う
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Avatar } from '@/components/Avatar';
import { useMember } from '@/components/RequireMember';
import { Loading, LoadError } from '@/components/Status';
import { TextField } from '@/components/TextField';
import { AvatarError, makeAvatar } from '@/lib/avatar';
import { getDirectoryEntry, isValidUrl, normalizeUrl, saveIntroduction } from '@/lib/directory';
import { directoryKeys } from '@/lib/directoryKeys';
import { isPermissionDenied } from '@/lib/errors';
import { eventKeys } from '@/lib/eventKeys';
import { getEvent, type EventDoc } from '@/lib/events';
import { db } from '@/lib/firebase';
import { formatDateTime, formatEventDate } from '@/lib/format';
import { LIMITS } from '@/lib/limits';
import { updateProfile, withdraw, type Member, type Role } from '@/lib/membership';
import { profileSyncEventIds, splitMyEvents, withdrawCancelTargets, type MyEvent } from '@/lib/myPage';
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
  const cancelTargets = withdrawCancelTargets(data.data.registrations, data.data.events, now);
  // 退会の確認で、キャンセルされるイベントの名前を見せる（開始前のもの）
  const cancelTitles = upcoming.filter(({ event }) => cancelTargets.cancel.includes(event.id)).map(({ event }) => event.title);

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

      <Introduction me={me} />

      <Withdraw me={me} targets={cancelTargets} cancelTitles={cancelTitles} />
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
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: eventKeys.all }),
        queryClient.invalidateQueries({ queryKey: directoryKeys.all }),
      ]);
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

/** メンバー一覧に出す自己紹介と URL。「書く」で編集する */
function Introduction({ me }: { me: Member }) {
  const entry = useQuery({ queryKey: directoryKeys.entry(me.uid), queryFn: () => getDirectoryEntry(db, me.uid) });
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const { hash } = useLocation();

  // メンバー一覧の「自分の自己紹介を書く」から来たときは、この欄までスクロールする
  useEffect(() => {
    if (hash === '#my-intro') sectionRef.current?.scrollIntoView();
  }, [hash]);

  const bio = entry.data?.bio ?? '';
  const url = entry.data?.url ?? '';
  const photo = entry.data?.photo ?? '';

  return (
    <section className="card" id="my-intro" ref={sectionRef} aria-labelledby="my-intro-title">
      <h2 id="my-intro-title" className="card-title">
        自己紹介
      </h2>
      {entry.isPending ? (
        <Loading />
      ) : entry.isError ? (
        <LoadError />
      ) : editing ? (
        <IntroductionForm
          me={me}
          bio={bio}
          url={url}
          photo={photo}
          onDone={(changed) => {
            setEditing(false);
            setSaved(changed);
          }}
        />
      ) : (
        <>
          {saved && (
            <p className="notice" role="status">
              保存しました。
            </p>
          )}
          <p className="help">
            <Link to="/members">メンバー</Link>の一覧に、ニックネームと一緒に出ます。メンバー全員が見られます。
          </p>
          <Avatar nickname={me.nickname} photo={photo || undefined} size={96} />
          <dl className="summary">
            <dt>自己紹介</dt>
            <dd>{bio || '（まだ書いていません）'}</dd>
            <dt>URL</dt>
            <dd className="directory-url">{url || '（なし）'}</dd>
          </dl>
          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              setSaved(false);
              setEditing(true);
            }}
          >
            {bio || url || photo ? '自己紹介を直す' : '自己紹介を書く'}
          </button>
        </>
      )}
    </section>
  );
}

function IntroductionForm({
  me,
  bio: initialBio,
  url: initialUrl,
  photo: initialPhoto,
  onDone,
}: {
  me: Member;
  bio: string;
  url: string;
  photo: string;
  onDone: (changed: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [bio, setBio] = useState(initialBio);
  const [url, setUrl] = useState(initialUrl);
  const [photo, setPhoto] = useState(initialPhoto);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileId = useId();

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true);
    setError(null);
    try {
      setPhoto(await makeAvatar(file));
    } catch (e) {
      setError(e instanceof AvatarError ? e.message : 'この画像は読み込めませんでした。別の画像をお試しください。');
    } finally {
      setPhotoBusy(false);
      // 同じファイルを選び直しても、もう一度読み込めるようにする
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const input = { bio: bio.trim(), url: normalizeUrl(url), photo };
    if (!isValidUrl(input.url)) {
      setError('URL は http:// か https:// で始めてください。');
      return;
    }
    if (input.bio === initialBio && input.url === initialUrl && photo === initialPhoto) {
      onDone(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveIntroduction(db, me.uid, me.nickname, input);
      await queryClient.invalidateQueries({ queryKey: directoryKeys.all });
      onDone(true);
    } catch (e) {
      setError(
        isPermissionDenied(e)
          ? '保存できませんでした。入力内容を確認して、もう一度お試しください。'
          : '保存できませんでした。通信状況を確認して、もう一度お試しください。',
      );
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={(e) => void handleSubmit(e)}>
      <div className="field">
        <span className="label" id={`${fileId}-label`}>
          画像
        </span>
        <div className="photo-field">
          <Avatar nickname={me.nickname} photo={photo || undefined} size={96} />
          <div className="actions">
            <input
              ref={fileRef}
              id={fileId}
              className="visually-hidden"
              type="file"
              accept="image/*"
              aria-labelledby={`${fileId}-label`}
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            <button type="button" className="button-secondary" disabled={busy || photoBusy} onClick={() => fileRef.current?.click()}>
              {photoBusy ? '読み込んでいます…' : photo ? '画像を変える' : '画像を選ぶ'}
            </button>
            {photo && (
              <button type="button" className="button-text" disabled={busy || photoBusy} onClick={() => setPhoto('')}>
                画像を外す
              </button>
            )}
          </div>
        </div>
        <span className="help">真ん中を正方形に切り取って、小さくしてから保存します。メンバー全員が見られます。</span>
      </div>
      <TextField
        label="自己紹介"
        value={bio}
        onChange={setBio}
        maxLength={LIMITS.introBio}
        help={`${LIMITS.introBio} 文字までです（今 ${bio.trim().length} 文字）。`}
      />
      <TextField
        label="URL"
        value={url}
        onChange={setUrl}
        maxLength={LIMITS.introUrl}
        help="ひとつだけ書けます。ブログや SNS のページなど。http:// か https:// で始めてください。"
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="button-primary" disabled={busy || photoBusy}>
          保存する
        </button>
        <button type="button" className="button-secondary" disabled={busy} onClick={() => onDone(false)}>
          やめる
        </button>
      </div>
    </form>
  );
}

/** 退会。特権管理者は退会できないので、その旨だけを出す */
function Withdraw({
  me,
  targets,
  cancelTitles,
}: {
  me: Member;
  targets: { cancel: string[]; tryCancel: string[] };
  cancelTitles: string[];
}) {
  const { logout } = useSession();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleWithdraw() {
    setBusy(true);
    setError(null);
    try {
      await withdraw(db, me.uid, targets.cancel, targets.tryCancel);
    } catch {
      setError('退会できませんでした。通信状況を確認して、もう一度お試しください。');
      setBusy(false);
      return;
    }
    navigate('/', { state: { withdrawn: true } });
    await logout();
  }

  return (
    <section className="card" aria-labelledby="my-withdraw">
      <h2 id="my-withdraw" className="card-title">
        退会
      </h2>
      {me.role === 'owner' ? (
        <p className="help">特権管理者はグループを作った人なので、退会できません。</p>
      ) : confirming ? (
        <div className="confirm" role="group" aria-label="退会の確認">
          <p>このグループから退会します。よろしいですか？</p>
          {cancelTitles.length > 0 && (
            <>
              <p>申し込んでいる次のイベントは、キャンセルされます。</p>
              <ul>
                {cancelTitles.map((title, i) => (
                  <li key={i}>{title}</li>
                ))}
              </ul>
            </>
          )}
          <p className="help">
            退会すると、イベントの一覧やマイページは見られなくなります。参加したイベントの記録は残ります。もう一度参加したいときは、参加を申し込み直してください。
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <button type="button" className="button-danger" disabled={busy} onClick={() => void handleWithdraw()}>
              退会する
            </button>
            <button type="button" className="button-secondary" disabled={busy} onClick={() => setConfirming(false)}>
              やめる
            </button>
          </div>
        </div>
      ) : (
        <>
          <p>グループから抜けたいときは、ここから退会できます。</p>
          <button type="button" className="button-secondary" onClick={() => setConfirming(true)}>
            退会する
          </button>
        </>
      )}
    </section>
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
