// 参加申し込み。未登録のユーザーが申し込み、承認を待つ
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { LoadError, Loading } from '@/components/Status';
import { TextField } from '@/components/TextField';
import { auth, db } from '@/lib/firebase';
import { isPermissionDenied } from '@/lib/errors';
import { LIMITS } from '@/lib/limits';
import { deleteApplication, submitApplication, type Application, type SignedInUser } from '@/lib/membership';
import { useSession } from '@/session/SessionProvider';

export function JoinPage() {
  const { state } = useSession();

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <LoadError />;
  const { session } = state;

  switch (session.kind) {
    case 'no-group':
    case 'guest':
      return <Navigate to="/" replace />;
    case 'member':
      return <Navigate to="/events" replace />;
    case 'newcomer':
      return <ApplicationForm user={session.user} groupName={session.group.name} />;
    case 'pending':
      return <PendingApplication application={session.application} />;
  }
}

function ApplicationForm({ user, groupName }: { user: SignedInUser; groupName: string }) {
  const { refresh } = useSession();
  const [realName, setRealName] = useState(auth.currentUser?.displayName ?? '');
  const [nickname, setNickname] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await submitApplication(db, user, { realName: realName.trim(), nickname: nickname.trim(), reason: reason.trim() });
      await refresh();
    } catch (e) {
      setError(
        isPermissionDenied(e)
          ? '申し込めませんでした。入力内容を確認して、もう一度お試しください。'
          : '申し込めませんでした。通信状況を確認して、もう一度お試しください。',
      );
      setBusy(false);
    }
  }

  return (
    <main className="main">
      <form className="card" onSubmit={(e) => void handleSubmit(e)}>
        <h1 className="card-title">{groupName} への参加申し込み</h1>
        <p>
          {user.email} で申し込みます。管理者が承認すると、グループのページを見られるようになります。
        </p>
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
        <TextField label="参加申し込みの理由" value={reason} onChange={setReason} maxLength={LIMITS.reason} required multiline />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button-primary" disabled={busy}>
          申し込む
        </button>
      </form>
    </main>
  );
}

function PendingApplication({ application }: { application: Application }) {
  const { refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleWithdraw() {
    setBusy(true);
    setError(null);
    try {
      await deleteApplication(db, application.uid);
      await refresh();
    } catch {
      setError('取り下げられませんでした。通信状況を確認して、もう一度お試しください。');
      setBusy(false);
    }
  }

  return (
    <main className="main">
      <section className="card">
        <h1 className="card-title">承認待ちです</h1>
        <p>参加の申し込みを受け付けました。管理者が承認すると、グループのページを見られるようになります。</p>
        <dl className="summary">
          <dt>名前（本名）</dt>
          <dd>{application.realName}</dd>
          <dt>ニックネーム</dt>
          <dd>{application.nickname}</dd>
          <dt>参加申し込みの理由</dt>
          <dd className="pre-wrap">{application.reason}</dd>
        </dl>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="button-secondary" disabled={busy} onClick={() => void handleWithdraw()}>
          申し込みを取り下げる
        </button>
      </section>
    </main>
  );
}
