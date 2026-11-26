// 掲示板の話題と返信（メンバー）。返信を書けるほか、自分の書き込みを消せる。
// 管理者はどの書き込みも消せる。話題を立てた人は、話題ごと（返信も含めて）消せる
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { PostBody } from '@/components/PostBody';
import { useMember } from '@/components/RequireMember';
import { Loading, LoadError } from '@/components/Status';
import { TextField } from '@/components/TextField';
import { canDeletePost, deleteReply, deleteTopic, getTopic, listReplies, reply, type ReplyDoc, type TopicDoc } from '@/lib/board';
import { boardKeys } from '@/lib/boardKeys';
import { isPermissionDenied } from '@/lib/errors';
import { db } from '@/lib/firebase';
import { formatDateTime } from '@/lib/format';
import { LIMITS } from '@/lib/limits';
import type { Member } from '@/lib/membership';

export function TopicPage() {
  const { id = '' } = useParams();
  const topic = useQuery({ queryKey: boardKeys.topic(id), queryFn: () => getTopic(db, id) });
  const replies = useQuery({ queryKey: boardKeys.replies(id), queryFn: () => listReplies(db, id), enabled: !!topic.data });

  if (topic.isPending) return <Loading />;
  if (topic.isError) return <LoadError />;
  if (!topic.data) {
    return (
      <main className="main">
        <section className="card">
          <h1 className="card-title">話題が見つかりません</h1>
          <p>URL が間違っているか、話題が削除された可能性があります。</p>
          <Link to="/board" className="button-secondary">
            掲示板へ
          </Link>
        </section>
      </main>
    );
  }
  if (replies.isPending) return <Loading />;
  if (replies.isError) return <LoadError />;

  return <Topic topic={topic.data} replies={replies.data} />;
}

function Topic({ topic, replies }: { topic: TopicDoc; replies: ReplyDoc[] }) {
  const me = useMember();

  return (
    <main className="main">
      <p className="back">
        <Link to="/board">← 掲示板</Link>
      </p>
      <article className="stack-lg">
        <h1>{topic.title}</h1>
        <section className="card">
          <PostMeta nickname={topic.nickname} at={topic.createdAt} />
          <PostBody text={topic.body} />
          {canDeletePost(me, topic.uid) && <DeleteTopic topic={topic} replyCount={replies.length} />}
        </section>

        <section className="stack" aria-labelledby="replies">
          <h2 id="replies" className="list-heading">
            返信（{replies.length} 件）
          </h2>
          {replies.length > 0 && (
            <ul className="list">
              {replies.map((r) => (
                <li key={r.id}>
                  <Reply topic={topic} reply={r} me={me} />
                </li>
              ))}
            </ul>
          )}
          <ReplyForm topicId={topic.id} me={me} />
        </section>
      </article>
    </main>
  );
}

function PostMeta({ nickname, at }: { nickname: string; at: TopicDoc['createdAt'] }) {
  return (
    <p className="post-meta">
      {nickname}
      {at && <> ・ {formatDateTime(at.toDate())}</>}
    </p>
  );
}

function Reply({ topic, reply, me }: { topic: TopicDoc; reply: ReplyDoc; me: Member }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => deleteReply(db, topic.id, reply.id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: boardKeys.replies(topic.id) }),
  });

  return (
    <article className="card">
      <PostMeta nickname={reply.nickname} at={reply.createdAt} />
      <PostBody text={reply.body} />
      {remove.isError && (
        <p className="error" role="alert">
          消せませんでした。通信状況を確認して、もう一度お試しください。
        </p>
      )}
      {canDeletePost(me, reply.uid, topic.uid) &&
        (confirming ? (
          <div className="confirm" role="group" aria-label="削除の確認">
            <p>この返信を消します。元に戻せません。よろしいですか？</p>
            <div className="actions">
              <button type="button" className="button-danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
                消す
              </button>
              <button type="button" className="button-secondary" disabled={remove.isPending} onClick={() => setConfirming(false)}>
                やめる
              </button>
            </div>
          </div>
        ) : (
          <div className="actions">
            <button type="button" className="button-text" onClick={() => setConfirming(true)}>
              消す
            </button>
          </div>
        ))}
    </article>
  );
}

function DeleteTopic({ topic, replyCount }: { topic: TopicDoc; replyCount: number }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => deleteTopic(db, topic.id),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: boardKeys.topic(topic.id) });
      await queryClient.invalidateQueries({ queryKey: boardKeys.topics });
      void navigate('/board');
    },
    onError: () => queryClient.invalidateQueries({ queryKey: boardKeys.replies(topic.id) }),
  });

  return (
    <>
      {remove.isError && (
        <p className="error" role="alert">
          消せませんでした。通信状況を確認して、もう一度お試しください。
        </p>
      )}
      {confirming ? (
        <div className="confirm" role="group" aria-label="削除の確認">
          <p>
            この話題を消します。
            {replyCount > 0 && `ついている返信（${replyCount} 件）もすべて消えます。`}
            元に戻せません。よろしいですか？
          </p>
          <div className="actions">
            <button type="button" className="button-danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
              話題を消す
            </button>
            <button type="button" className="button-secondary" disabled={remove.isPending} onClick={() => setConfirming(false)}>
              やめる
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button type="button" className="button-text" onClick={() => setConfirming(true)}>
            話題を消す
          </button>
        </div>
      )}
    </>
  );
}

function ReplyForm({ topicId, me }: { topicId: string; me: Member }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const send = useMutation({
    mutationFn: () => reply(db, me, topicId, body.trim()),
    onSuccess: () => setBody(''),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: boardKeys.replies(topicId) });
      await queryClient.invalidateQueries({ queryKey: boardKeys.topics });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    send.mutate();
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h3 className="card-title">返信する</h3>
      <TextField
        label="本文"
        value={body}
        onChange={setBody}
        maxLength={LIMITS.postBody}
        required
        multiline
        rows={5}
        help={`名前は「${me.nickname}」と表示します。`}
      />
      {send.isError && (
        <p className="error" role="alert">
          {isPermissionDenied(send.error)
            ? '書き込めませんでした。話題が削除された可能性があります。再読み込みしてください。'
            : '書き込めませんでした。通信状況を確認して、もう一度お試しください。'}
        </p>
      )}
      <button type="submit" className="button-primary" disabled={send.isPending || !body.trim()}>
        返信する
      </button>
    </form>
  );
}
