// メンバーの詳細（管理者）。メンバー管理の一覧で選んだ人について、役割の変更、タグの付け直し、削除をする。
// 参加者は管理者が、管理者は特権管理者が削除できる。役割を変えられるのは特権管理者だけ。
// タグは管理者が付ける、グループの中での分類（例：「2026年度」「運営」）。管理者だけが見る
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAdminMember } from '@/components/RequireAdmin';
import { Loading, LoadError } from '@/components/Status';
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
} from '@/lib/membership';
import { membersKey } from './adminKeys';
import { roleLabels } from './memberLabels';

export function MemberDetailPage() {
  const me = useAdminMember();
  const { uid = '' } = useParams();
  // 一覧と同じキャッシュを使う（一覧から来たときは読み直さずに出せる。タグの候補にも全員の分が要る）
  const members = useQuery({
    queryKey: membersKey,
    queryFn: () => listMembers(db),
  });

  if (members.isPending) return <Loading />;
  if (members.isError) return <LoadError />;

  const member = members.data.find((m) => m.uid === uid);

  return (
    <main className="main">
      {member ? (
        <>
          <p className="back">
            <Link to="/admin/members">← メンバー管理</Link>
          </p>
          <MemberItem me={me} member={member} knownTags={allTags(members.data)} />
        </>
      ) : (
        <section className="card">
          <h1 className="card-title">メンバーが見つかりません</h1>
          <p>グループから削除されたか、退会した可能性があります。</p>
          <Link to="/admin/members" className="button-secondary">
            メンバー管理へ戻る
          </Link>
        </section>
      )}
    </main>
  );
}

function MemberItem({ me, member, knownTags }: { me: Member; member: Member; knownTags: string[] }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  // 失敗したときも読み直す（ほかの管理者が先に変えていることがあるため）
  const refetch = () => queryClient.invalidateQueries({ queryKey: membersKey });
  const nextRole = member.role === 'admin' ? 'member' : 'admin';
  const roleChange = useMutation({
    mutationFn: () => changeRole(db, member.uid, nextRole),
    onSettled: refetch,
  });
  const remove = useMutation({
    mutationFn: () => removeMember(db, member.uid),
    onSuccess: () => navigate('/admin/members', { state: { removed: member.realName } }),
    onSettled: refetch,
  });
  const busy = roleChange.isPending || remove.isPending;
  const removable = canRemoveMember(me, member);
  const roleChangeable = canChangeRole(me, member);

  return (
    <>
      <h1>
        {member.realName}
        <span className="card-subtitle">（{member.nickname}）</span>
        {member.uid === me.uid && <span className="badge badge-self">あなた</span>}
      </h1>
      <article className="card">
        <dl className="summary">
          <dt>役割</dt>
          <dd>{roleLabels[member.role]}</dd>
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
                <button type="button" className="button-secondary is-destructive" disabled={busy} onClick={() => setConfirmingRemove(true)}>
                  グループから削除する
                </button>
              )}
            </div>
          )
        )}
      </article>
    </>
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
        {current.length === 0 ? (
          <span className="help">なし</span>
        ) : (
          current.map((t) => (
            <span key={t} className="badge badge-tag">
              {t}
            </span>
          ))
        )}
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
            <button
              type="button"
              className="tag-remove"
              aria-label={`「${t}」を外す`}
              onClick={() => setDraft(draft.filter((d) => d !== t))}
            >
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
