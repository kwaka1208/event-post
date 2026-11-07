// メンバー用の画面をまとめるルート。メンバー（owner・admin・member）以外は / に戻す。
// 見せ方の振り分けで、読み書きできる範囲はルール（firebase/firestore.rules）が決める。
import { Navigate, Outlet, useOutletContext } from 'react-router';
import { LoadError, Loading } from '@/components/Status';
import type { Member } from '@/lib/membership';
import { useSession } from '@/session/SessionProvider';

export function RequireMember() {
  const { state } = useSession();
  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <LoadError />;
  const { session } = state;
  if (session.kind !== 'member') return <Navigate to="/" replace />;

  return <Outlet context={session.member} />;
}

/** RequireMember の中の画面で、ログイン中のメンバーを取り出す */
export function useMember(): Member {
  return useOutletContext<Member>();
}
