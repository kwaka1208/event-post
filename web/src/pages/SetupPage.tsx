// グループの作成。グループがまだないときだけ使える。作った人が特権管理者になる
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { LoginButton } from '@/components/LoginButton';
import { LoadError, Loading } from '@/components/Status';
import { TextField } from '@/components/TextField';
import { auth, db } from '@/lib/firebase';
import { createGroup } from '@/lib/group';
import { isPermissionDenied } from '@/lib/errors';
import { LIMITS } from '@/lib/limits';
import type { SignedInUser } from '@/lib/membership';
import { useSession } from '@/session/SessionProvider';

export function SetupPage() {
  const { state } = useSession();

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <LoadError />;
  const { session } = state;
  if (session.kind !== 'no-group') return <Navigate to="/" replace />;

  if (!session.user) {
    return (
      <main className="main">
        <section className="card">
          <h1 className="card-title">グループを作成</h1>
          <p>グループを作る人の Google アカウントでログインしてください。その人が特権管理者になります。</p>
          <LoginButton />
        </section>
      </main>
    );
  }
  return <SetupForm user={session.user} />;
}

// ログインした後にマウントするので、Google の表示名を初期値に使える
function SetupForm({ user }: { user: SignedInUser }) {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const displayName = auth.currentUser?.displayName ?? '';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ownerName, setOwnerName] = useState(displayName);
  const [realName, setRealName] = useState(displayName);
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createGroup(
        db,
        user,
        { name: name.trim(), description: description.trim(), ownerName: ownerName.trim() },
        { realName: realName.trim(), nickname: nickname.trim() },
      );
      await refresh();
      navigate('/events');
    } catch (e) {
      setError(
        isPermissionDenied(e)
          ? 'グループを作成できませんでした。ほかの人がすでにグループを作った可能性があります。再読み込みしてください。'
          : 'グループを作成できませんでした。通信状況を確認して、もう一度お試しください。',
      );
      setBusy(false);
    }
  }

  return (
    <main className="main">
      <form className="card" onSubmit={(e) => void handleSubmit(e)}>
        <h1 className="card-title">グループを作成</h1>
        <p>あなた（{user.email}）がこのグループの特権管理者になります。</p>

        <h2 className="section-title">グループ</h2>
        <TextField label="グループ名" value={name} onChange={setName} maxLength={LIMITS.groupName} required />
        <TextField
          label="グループの説明"
          value={description}
          onChange={setDescription}
          maxLength={LIMITS.groupDescription}
          multiline
          help="トップページに表示します。"
        />
        <TextField
          label="管理者の名前"
          value={ownerName}
          onChange={setOwnerName}
          maxLength={LIMITS.personName}
          required
          help="トップページに表示します。"
        />

        <h2 className="section-title">あなたのメンバー情報</h2>
        <TextField label="名前（本名）" value={realName} onChange={setRealName} maxLength={LIMITS.personName} required />
        <TextField label="ニックネーム" value={nickname} onChange={setNickname} maxLength={LIMITS.personName} required />

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button-primary" disabled={busy}>
          グループを作成
        </button>
      </form>
    </main>
  );
}
