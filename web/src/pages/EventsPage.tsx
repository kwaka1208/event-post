// イベント一覧（仮）。段階 5 で作る
import { Navigate } from 'react-router';
import { LoadError, Loading } from '@/components/Status';
import { useSession } from '@/session/SessionProvider';

export function EventsPage() {
  const { state } = useSession();
  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <LoadError />;
  if (state.session.kind !== 'member') return <Navigate to="/" replace />;

  return (
    <main className="main">
      <h1>イベント</h1>
      <p>準備中です。</p>
    </main>
  );
}
