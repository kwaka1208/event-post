// 掲示板の話題の一覧（メンバー）。返信がついた話題が上に来るよう、最後の投稿が新しい順に並べる
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Loading, LoadError } from '@/components/Status';
import { listTopics, TOPIC_LIST_LIMIT } from '@/lib/board';
import { boardKeys } from '@/lib/boardKeys';
import { db } from '@/lib/firebase';
import { formatDateTime } from '@/lib/format';

export function BoardPage() {
  const topics = useQuery({ queryKey: boardKeys.topics, queryFn: () => listTopics(db) });

  if (topics.isPending) return <Loading />;
  if (topics.isError) return <LoadError />;

  return (
    <main className="main">
      <h1>掲示板</h1>
      <p className="help">
        メンバー同士で自由にやり取りできる場所です。書いた内容は、メンバー全員が読めます（ニックネームで表示します）。新しい書き込みはメールでは届かないので、ときどきのぞいてみてください。
      </p>
      <div className="actions">
        <Link to="/board/new" className="button-primary">
          新しい話題を立てる
        </Link>
      </div>

      {topics.data.length === 0 ? (
        <p>まだ話題はありません。最初の話題を立ててみましょう。</p>
      ) : (
        <ul className="list">
          {topics.data.map((topic) => (
            <li key={topic.id}>
              <Link to={`/board/${topic.id}`} className="card card-link">
                {topic.lastReplyId && (
                  <div className="badges">
                    <span className="badge">返信あり</span>
                  </div>
                )}
                <h2 className="card-title">{topic.title}</h2>
                <p className="post-meta">
                  {topic.nickname}
                  {topic.lastPostedAt && <> ・ 最後の書き込み {formatDateTime(topic.lastPostedAt.toDate())}</>}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {topics.data.length >= TOPIC_LIST_LIMIT && (
        <p className="help">最近の {TOPIC_LIST_LIMIT} 件を表示しています。</p>
      )}
    </main>
  );
}
