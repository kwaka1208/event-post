// メンバーの一覧（管理者）。役割ごとに並べ、削除と役割の変更ができる。
// 参加者は管理者が、管理者は特権管理者が削除できる。役割を変えられるのは特権管理者だけ
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { useAdminMember } from '@/components/RequireAdmin';
import { Loading, LoadError } from '@/components/Status';
import { db } from '@/lib/firebase';
import { formatDateTime } from '@/lib/format';
import {
  canChangeRole,
  canRemoveMember,
  changeRole,
  listMembers,
  removeMember,
  type Member,
  type Role,
} from '@/lib/membership';
import { membersKey } from './adminKeys';


const sections: { role: Role; title: string }[] = [
  { role: 'owner', title: '特権管理者' },
  { role: 'admin', title: '管理者' },
  { role: 'member', title: '参加者' },
];

export function MembersPage() {
  const me = useAdminMember();
  const members = useQuery({ queryKey: membersKey, queryFn: () => listMembers(db) });

  if (members.isPending) return <Loading />;
  if (members.isError) return <LoadError />;

  return (
    <main className="main">
      <h1>メンバー（{members.data.length} 人）</h1>
      <Link to="/admin/mails/new" className="button-primary">
        メンバーにメールを送る
      </Link>
      {sections.map(({ role, title }) => {
        const list = members.data.filter((m) => m.role === role);
        if (list.length === 0) return null;
        return (
          <section key={role} className="stack" aria-labelledby={`members-${role}`}>
            <h2 id={`members-${role}`} className="list-heading">
              {title}（{list.length} 人）
            </h2>
            <ul className="list">
              {list.map((member) => (
                <li key={member.uid}>
                  <MemberItem me={me} member={member} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}

function MemberItem({ me, member }: { me: Member; member: Member }) {
  const queryClient = useQueryClient();
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  // 失敗したときも読み直す（ほかの管理者が先に変えていることがあるため）
  const refetch = () => queryClient.invalidateQueries({ queryKey: membersKey });
  const nextRole = member.role === 'admin' ? 'member' : 'admin';
  const roleChange = useMutation({ mutationFn: () => changeRole(db, member.uid, nextRole), onSettled: refetch });
  const remove = useMutation({ mutationFn: () => removeMember(db, member.uid), onSettled: refetch });
  const busy = roleChange.isPending || remove.isPending;
  const removable = canRemoveMember(me, member);
  const roleChangeable = canChangeRole(me, member);

  return (
    <article className="card">
      <h3 className="card-title">
        {member.realName}
        <span className="card-subtitle">（{member.nickname}）</span>
        {member.uid === me.uid && <span className="badge badge-self">あなた</span>}
      </h3>
      <dl className="summary">
        <dt>メールアドレス</dt>
        <dd>{member.email}</dd>
        <dt>参加日時</dt>
        <dd>{member.joinedAt ? formatDateTime(member.joinedAt.toDate()) : '—'}</dd>
      </dl>

      {roleChange.isError && (
        <p className="error" role="alert">
          役割を変えられませんでした。再読み込みしてから、もう一度お試しください。
        </p>
      )}
      {remove.isError && (
        <p className="error" role="alert">
          削除できませんでした。再読み込みしてから、もう一度お試しください。
        </p>
      )}

      {confirmingRemove ? (
        <div className="confirm" role="group" aria-label="削除の確認">
          <p>
            {member.realName} さんをグループから削除します。よろしいですか？
            削除した人は、もう一度参加を申し込めます。申し込んだイベントの申込は残ります。
          </p>
          <div className="actions">
            <button type="button" className="button-danger" disabled={busy} onClick={() => remove.mutate()}>
              削除する
            </button>
            <button type="button" className="button-secondary" disabled={busy} onClick={() => setConfirmingRemove(false)}>
              やめる
            </button>
          </div>
        </div>
      ) : (
        (roleChangeable || removable) && (
          <div className="actions">
            {roleChangeable && (
              <button type="button" className="button-secondary" disabled={busy} onClick={() => roleChange.mutate()}>
                {nextRole === 'admin' ? '管理者にする' : '参加者に戻す'}
              </button>
            )}
            {removable && (
              <button type="button" className="button-secondary" disabled={busy} onClick={() => setConfirmingRemove(true)}>
                グループから削除する
              </button>
            )}
          </div>
        )
      )}
    </article>
  );
}
