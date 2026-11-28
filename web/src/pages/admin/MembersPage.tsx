// メンバーの一覧（管理者）。役割ごと、またはタグごとに並べ、削除と役割の変更、タグの付け直しができる。
// 参加者は管理者が、管理者は特権管理者が削除できる。役割を変えられるのは特権管理者だけ。
// タグは管理者が付ける、グループの中での分類（例：「2026年度」「運営」）。管理者だけが見る。
// 開いたときに、メンバー一覧（directory）をメンバーにそろえる（この機能より前からいるメンバーを足すため）
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useAdminMember } from '@/components/RequireAdmin';
import { Loading, LoadError } from '@/components/Status';
import { syncDirectory } from '@/lib/directory';
import { directoryKeys } from '@/lib/directoryKeys';
import { db } from '@/lib/firebase';
import { formatDateTime } from '@/lib/format';
import { LIMITS } from '@/lib/limits';
import {
  allTags,
  canChangeRole,
  canRemoveMember,
  changeRole,
  listMembers,
  normalizeTag,
  removeMember,
  setMemberTags,
  tagsOf,
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
  const queryClient = useQueryClient();

  // メンバー一覧のそろえ直し。失敗しても、この画面の操作には関わらないので何も出さない
  useEffect(() => {
    if (!members.data) return;
    syncDirectory(db, members.data)
      .then(() => queryClient.invalidateQueries({ queryKey: directoryKeys.all }))
      .catch(() => {});
  }, [members.data, queryClient]);

  const [view, setView] = useState<'role' | 'tag'>('role');

  if (members.isPending) return <Loading />;
  if (members.isError) return <LoadError />;

  const tags = allTags(members.data);
  // タグごとのときは、タグを付けていない人を最後にまとめる。複数のタグがある人は、それぞれに出る
  const groups =
    view === 'role'
      ? sections.map(({ role, title }) => ({ key: role, title, list: members.data.filter((m) => m.role === role) }))
      : [
          ...tags.map((tag) => ({ key: `tag-${tag}`, title: tag, list: members.data.filter((m) => tagsOf(m).includes(tag)) })),
          { key: 'no-tag', title: 'タグなし', list: members.data.filter((m) => tagsOf(m).length === 0) },
        ];

  return (
    <main className="main">
      <h1>メンバー管理（{members.data.length} 人）</h1>
      <Link to="/admin/mails/new" className="button-primary">
        メンバーにメールを送る
      </Link>
      <div className="segmented" role="group" aria-label="並べ方">
        <button type="button" aria-pressed={view === 'role'} onClick={() => setView('role')}>
          役割ごと
        </button>
        <button type="button" aria-pressed={view === 'tag'} onClick={() => setView('tag')}>
          タグごと
        </button>
      </div>
      {view === 'tag' && (
        <p className="help">
          タグは、グループの中での分類です（例：「運営」「2026年度」）。各メンバーの「タグを付ける」から付けられます。メンバー本人には見えません。複数のタグがある人は、それぞれのタグに出ます。
        </p>
      )}
      {groups.map(({ key, title, list }, i) => {
        if (list.length === 0) return null;
        return (
          <section key={key} className="stack" aria-labelledby={`members-${i}`}>
            <h2 id={`members-${i}`} className="list-heading">
              {title}（{list.length} 人）
            </h2>
            <ul className="list list-grid">
              {list.map((member) => (
                <li key={member.uid}>
                  <MemberItem me={me} member={member} knownTags={tags} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}

function MemberItem({ me, member, knownTags }: { me: Member; member: Member; knownTags: string[] }) {
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
        <dt>タグ</dt>
        <dd>
          <MemberTags member={member} knownTags={knownTags} />
        </dd>
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

/** メンバーのタグの表示と付け直し。保存するまでは、画面の中だけで変える */
function MemberTags({ member, knownTags }: { member: Member; knownTags: string[] }) {
  const queryClient = useQueryClient();
  const listId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (tags: string[]) => setMemberTags(db, member.uid, tags),
    onSuccess: () => setEditing(false),
    onSettled: () => queryClient.invalidateQueries({ queryKey: membersKey }),
  });
  const current = tagsOf(member);

  if (!editing) {
    return (
      <div className="tag-row">
        {current.length === 0 ? <span className="help">なし</span> : current.map((t) => <span key={t} className="badge badge-tag">{t}</span>)}
        <button
          type="button"
          className="button-text"
          onClick={() => {
            setDraft(current);
            setInput('');
            setError(null);
            save.reset();
            setEditing(true);
          }}
        >
          {current.length === 0 ? 'タグを付ける' : 'タグを直す'}
        </button>
      </div>
    );
  }

  function add(e?: FormEvent) {
    e?.preventDefault();
    const tag = normalizeTag(input);
    if (!tag) return;
    if (tag.length > LIMITS.memberTag) return setError(`タグは ${LIMITS.memberTag} 文字までにしてください。`);
    if (draft.includes(tag)) return setInput('');
    if (draft.length >= LIMITS.memberTags) return setError(`タグは 1 人 ${LIMITS.memberTags} 個までです。`);
    setDraft([...draft, tag]);
    setInput('');
    setError(null);
  }

  const suggestions = knownTags.filter((t) => !draft.includes(t));

  return (
    <div className="tag-editor">
      <div className="tag-row">
        {draft.length === 0 && <span className="help">タグはありません</span>}
        {draft.map((t) => (
          <span key={t} className="badge badge-tag">
            {t}
            <button type="button" className="tag-remove" aria-label={`「${t}」を外す`} onClick={() => setDraft(draft.filter((d) => d !== t))}>
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="tag-input">
        <input
          className="input"
          type="text"
          value={input}
          maxLength={LIMITS.memberTag}
          list={listId}
          aria-label="追加するタグ"
          placeholder="タグの名前（例：運営）"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // 日本語の変換を確定する Enter では追加しない
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) add(e);
          }}
        />
        <button type="button" className="button-secondary" onClick={() => add()}>
          追加
        </button>
        <datalist id={listId}>
          {suggestions.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>
      {suggestions.length > 0 && (
        <div className="tag-row">
          <span className="help">これまでのタグ：</span>
          {suggestions.map((t) => (
            <button
              key={t}
              type="button"
              className="badge badge-tag tag-suggest"
              disabled={draft.length >= LIMITS.memberTags}
              onClick={() => setDraft([...draft, t])}
            >
              ＋ {t}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {save.isError && (
        <p className="error" role="alert">
          タグを保存できませんでした。再読み込みしてから、もう一度お試しください。
        </p>
      )}
      <div className="actions">
        <button type="button" className="button-primary" disabled={save.isPending} onClick={() => save.mutate(draft)}>
          保存する
        </button>
        <button type="button" className="button-secondary" disabled={save.isPending} onClick={() => setEditing(false)}>
          やめる
        </button>
      </div>
    </div>
  );
}
