// メンバー管理の一覧（管理者）。役割ごと、またはタグごとに、ひとり一行で並べる。
// 役割の変更、タグの付け直し、削除は、行を押して開く詳細（MemberDetailPage）でする。
// 開いたときに、メンバー一覧（directory）をメンバーにそろえる（この機能より前からいるメンバーを足すため）
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useAdminMember } from '@/components/RequireAdmin';
import { Loading, LoadError } from '@/components/Status';
import { syncDirectory } from '@/lib/directory';
import { directoryKeys } from '@/lib/directoryKeys';
import { db } from '@/lib/firebase';
import { allTags, listMembers, tagsOf, type Member, type Role } from '@/lib/membership';
import { membersKey } from './adminKeys';
import { roleLabels } from './memberLabels';

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
  // 詳細で削除して戻ってきたときに、知らせを出す
  const removed = (useLocation().state as { removed?: string } | null)?.removed;

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
      {removed && (
        <p className="notice" role="status">
          {removed} さんをグループから削除しました。
        </p>
      )}
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
          タグは、グループの中での分類です（例：「運営」「2026年度」）。メンバーを選んだ画面の「タグを付ける」から付けられます。メンバー本人には見えません。複数のタグがある人は、それぞれのタグに出ます。
        </p>
      )}
      {groups.map(({ key, title, list }, i) => {
        if (list.length === 0) return null;
        return (
          <section key={key} className="stack" aria-labelledby={`members-${i}`}>
            <h2 id={`members-${i}`} className="list-heading">
              {title}（{list.length} 人）
            </h2>
            <ul className="member-rows card">
              {list.map((member) => (
                <li key={member.uid}>
                  <MemberRow me={me} member={member} showRole={view === 'tag'} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}

/** 一覧の 1 行。押すと、その人の詳細を開く */
function MemberRow({ me, member, showRole }: { me: Member; member: Member; showRole: boolean }) {
  const tags = tagsOf(member);
  return (
    <Link to={`/admin/members/${member.uid}`} className="member-row">
      <span className="member-row-name">
        {member.realName}
        <span className="card-subtitle">（{member.nickname}）</span>
        {member.uid === me.uid && <span className="badge badge-self">あなた</span>}
      </span>
      {showRole && <span className="member-row-role">{roleLabels[member.role]}</span>}
      {tags.length > 0 && (
        <span className="member-row-tags">
          {tags.map((t) => (
            <span key={t} className="badge badge-tag">
              {t}
            </span>
          ))}
        </span>
      )}
      <span className="member-row-arrow" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}
