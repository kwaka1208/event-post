// 掲示板に新しい話題を立てる（メンバー）
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMember } from '@/components/RequireMember';
import { TextField } from '@/components/TextField';
import { createTopic } from '@/lib/board';
import { boardKeys } from '@/lib/boardKeys';
import { isPermissionDenied } from '@/lib/errors';
import { db } from '@/lib/firebase';
import { LIMITS } from '@/lib/limits';

export function TopicNewPage() {
  const me = useMember();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const id = await createTopic(db, me, { title: title.trim(), body: body.trim() });
      await queryClient.invalidateQueries({ queryKey: boardKeys.topics });
      void navigate(`/board/${id}`);
    } catch (e) {
      setError(
        isPermissionDenied(e)
          ? '書き込めませんでした。入力内容を確認して、もう一度お試しください。'
          : '書き込めませんでした。通信状況を確認して、もう一度お試しください。',
      );
      setBusy(false);
    }
  }

  return (
    <main className="main">
      <p className="back">
        <Link to="/board">← 掲示板</Link>
      </p>
      <form className="card" onSubmit={(e) => void handleSubmit(e)}>
        <h1 className="card-title">新しい話題を立てる</h1>
        <p>メンバー全員が読めます。名前は「{me.nickname}」と表示します。</p>
        <TextField label="タイトル" value={title} onChange={setTitle} maxLength={LIMITS.topicTitle} required />
        <TextField label="本文" value={body} onChange={setBody} maxLength={LIMITS.postBody} required multiline rows={8} />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button-primary" disabled={busy || !title.trim() || !body.trim()}>
          書き込む
        </button>
      </form>
    </main>
  );
}
