// メンバー一覧（メンバー）。ニックネーム、自己紹介、URL だけを、ひとり一行で並べる。
// 自己紹介と URL は、本人がマイページで書く
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useMember } from '@/components/RequireMember';
import { Loading, LoadError } from '@/components/Status';
import { listDirectory } from '@/lib/directory';
import { directoryKeys } from '@/lib/directoryKeys';
import { db } from '@/lib/firebase';

export function MembersDirectoryPage() {
  const me = useMember();
  const entries = useQuery({ queryKey: directoryKeys.list, queryFn: () => listDirectory(db) });

  if (entries.isPending) return <Loading />;
  if (entries.isError) return <LoadError />;

  return (
    <main className="main">
      <h1>メンバー（{entries.data.length} 人）</h1>
      <p className="help">
        グループのメンバーです。ここに出るのはニックネームと自己紹介と URL だけで、メンバー全員が見られます。
      </p>
      <div className="actions">
        <Link to="/me#my-intro" className="button-secondary">
          自分の自己紹介を書く
        </Link>
      </div>

      {entries.data.length === 0 ? (
        <p>まだメンバーが表示されていません。</p>
      ) : (
        <ul className="directory card">
          {entries.data.map((entry) => (
            <li key={entry.uid}>
              <span className="directory-name">
                {entry.nickname}
                {entry.uid === me.uid && <span className="badge badge-self">あなた</span>}
              </span>
              {entry.bio && <span className="directory-bio">{entry.bio}</span>}
              {entry.url && (
                <a className="directory-url" href={entry.url} target="_blank" rel="noopener noreferrer nofollow ugc">
                  {entry.url}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
