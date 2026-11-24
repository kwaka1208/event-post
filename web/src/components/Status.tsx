// 読み込み中・エラーの共通表示
import { useQueryClient, type Query } from '@tanstack/react-query';
import { useEffect } from 'react';
import { isIndexNotReady } from '@/lib/errors';

/** インデックスの準備を待つあいだ、失敗した読み込みをやり直す間隔 */
const INDEX_RETRY_MS = 30_000;

const failed = (q: Query) => q.state.status === 'error';

export function Loading() {
  return (
    <main className="main" aria-busy="true">
      <div className="skeleton" style={{ width: '40%', height: 24 }} />
      <div className="skeleton" style={{ height: 80 }} />
    </main>
  );
}

/**
 * 読み込みに失敗したときの表示。どの読み込みが失敗したかは、React Query のキャッシュから調べる。
 * インデックスの準備中なら、その旨を伝え、失敗した読み込みを一定の間隔でやり直す（成功すれば元の画面に戻る）
 */
export function LoadError() {
  const queryClient = useQueryClient();
  const preparing = queryClient
    .getQueryCache()
    .findAll({ predicate: failed })
    .some((q) => isIndexNotReady(q.state.error));

  useEffect(() => {
    if (!preparing) return;
    const timer = setInterval(() => void queryClient.refetchQueries({ predicate: failed }), INDEX_RETRY_MS);
    return () => clearInterval(timer);
  }, [preparing, queryClient]);

  return (
    <main className="main">
      <section className="card">
        {preparing ? (
          <>
            <h1 className="card-title">サイトの準備をしています</h1>
            <p role="status">
              公開した直後は、データベースの準備に数分かかります。準備ができると自動で表示しますので、このままお待ちください。
            </p>
          </>
        ) : (
          <>
            <h1 className="card-title">読み込めませんでした</h1>
            <p role="alert">通信状況を確認して、再読み込みしてください。</p>
          </>
        )}
        <button type="button" className="button-secondary" onClick={() => location.reload()}>
          再読み込み
        </button>
      </section>
    </main>
  );
}
