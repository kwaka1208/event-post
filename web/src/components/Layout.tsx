import { Suspense, useEffect } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { Loading } from '@/components/Status';
import { isAdminRole } from '@/lib/membership';
import { useSession } from '@/session/SessionProvider';

const EVENTPOST_URL = 'https://github.com/kwaka1208/event-post';

export function Layout() {
  const { state, logout } = useSession();
  const session = state.status === 'ready' ? state.session : null;
  const groupName = session && session.kind !== 'no-group' ? session.group.name : null;
  const nickname = session?.kind === 'member' ? session.member.nickname : null;
  const isMember = session?.kind === 'member';
  const isAdmin = isMember && isAdminRole(session.member.role);
  const isOwner = isMember && session.member.role === 'owner';
  const signedIn = session && (session.kind === 'no-group' ? !!session.user : session.kind !== 'guest');
  const email = session && 'user' in session ? session.user?.email : null;

  useEffect(() => {
    document.title = groupName ?? 'EventPost';
  }, [groupName]);

  return (
    <>
      <header className="site-header">
        <div className="inner">
          <Link to="/" className="brand">
            {groupName ?? 'EventPost'}
          </Link>
          {signedIn && (
            <span className="account">
              <span className="account-name">{nickname ?? email}</span>
              <button type="button" className="button-text" onClick={() => void logout()}>
                ログアウト
              </button>
            </span>
          )}
        </div>
        {isMember && (
          <nav className="inner site-nav" aria-label="メニュー">
            <NavLink to="/events">イベント</NavLink>
            <NavLink to="/me">マイページ</NavLink>
            {isAdmin && (
              <>
                <NavLink to="/admin/events">イベント管理</NavLink>
                <NavLink to="/admin/applications">参加申し込み</NavLink>
                <NavLink to="/admin/members">メンバー</NavLink>
                <NavLink to="/admin/mails">メール</NavLink>
                {isOwner && <NavLink to="/admin/settings">設定</NavLink>}
              </>
            )}
          </nav>
        )}
      </header>

      <Suspense fallback={<Loading />}>
        <Outlet />
      </Suspense>

      <footer className="site-footer">
        <div className="inner">
          {groupName && <div>© {groupName}</div>}
          <div className="powered">
            Powered by <a href={EVENTPOST_URL}>EventPost</a>
          </div>
        </div>
      </footer>
    </>
  );
}
