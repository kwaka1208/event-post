import { useEffect } from 'react';
import { Link, Outlet } from 'react-router';
import { useSession } from '@/session/SessionProvider';

const EVENTPOST_URL = 'https://github.com/kwaka1208/event-post';

export function Layout() {
  const { state, logout } = useSession();
  const session = state.status === 'ready' ? state.session : null;
  const groupName = session && session.kind !== 'no-group' ? session.group.name : null;
  const nickname = session?.kind === 'member' ? session.member.nickname : null;
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
      </header>

      <Outlet />

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
