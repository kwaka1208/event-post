// グループの設定（特権管理者）。グループ名、説明、トップページに出す管理者の名前を変える
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useAdminMember } from '@/components/RequireAdmin';
import { LoadError, Loading } from '@/components/Status';
import { TextField } from '@/components/TextField';
import { db } from '@/lib/firebase';
import { updateGroup, type GroupProfile } from '@/lib/group';
import { LIMITS } from '@/lib/limits';
import { useSession } from '@/session/SessionProvider';

export function SettingsPage() {
  const me = useAdminMember();
  const { state } = useSession();
  if (me.role !== 'owner') return <Navigate to="/" replace />;
  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error' || state.session.kind !== 'member') return <LoadError />;
  return <SettingsForm group={state.session.group} />;
}

function SettingsForm({ group }: { group: GroupProfile }) {
  const { refresh } = useSession();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [ownerName, setOwnerName] = useState(group.ownerName);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'done' | 'error'; text: string } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await updateGroup(db, { name: name.trim(), description: description.trim(), ownerName: ownerName.trim() });
      await refresh();
      setMessage({ kind: 'done', text: '保存しました。' });
    } catch {
      setMessage({ kind: 'error', text: '保存できませんでした。通信状況を確認して、もう一度お試しください。' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="main">
      <form className="card" onSubmit={(e) => void handleSubmit(e)}>
        <h1 className="card-title">グループの設定</h1>
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
        {message && (
          <p className={message.kind === 'done' ? 'notice' : 'error'} role={message.kind === 'done' ? 'status' : 'alert'}>
            {message.text}
          </p>
        )}
        <button type="submit" className="button-primary" disabled={busy}>
          保存する
        </button>
      </form>
    </main>
  );
}
