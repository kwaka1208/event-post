// 管理者用の画面をまとめるルート。管理者（owner・admin）以外は / に戻す。
// 見せ方の振り分けで、読み書きできる範囲はルール（firebase/firestore.next.rules）が決める。
import { Navigate, Outlet, useOutletContext } from 'react-router';
import { LoadError, Loading } from '@/components/Status';
import { isAdminRole, type Member } from '@/lib/membership';
import { useSession } from '@/session/SessionProvider';

export function RequireAdmin() {
  const { state } = useSession();
  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <LoadError />;
  const { session } = state;
  if (session.kind !== 'member' || !isAdminRole(session.member.role)) return <Navigate to="/" replace />;

  return <Outlet context={session.member} />;
}

/** RequireAdmin の中の画面で、ログイン中の管理者を取り出す */
export function useAdminMember(): Member {
  return useOutletContext<Member>();
}
