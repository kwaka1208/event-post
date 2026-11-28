import { Suspense, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { Loading } from '@/components/Status';
import { isAdminRole } from '@/lib/membership';
import { applyAccent } from '@/lib/theme';
import { useSession } from '@/session/SessionProvider';

const FIRESIDE_URL = 'https://github.com/kwaka1208/fireside';

/** この幅より狭いときは、メニューをドロワーにする（styles.css の @media と合わせる） */
const DRAWER_QUERY = '(max-width: 639px)';

function useIsNarrow(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(DRAWER_QUERY);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(DRAWER_QUERY).matches,
  );
}

export function Layout() {
  const { state, logout } = useSession();
  const session = state.status === 'ready' ? state.session : null;
  const groupName = session && session.kind !== 'no-group' ? session.group.name : null;
  const nickname = session?.kind === 'member' ? session.member.nickname : null;
  const isMember = session?.kind === 'member';
  const isAdmin = isMember && isAdminRole(session.member.role);
  const signedIn = session && (session.kind === 'no-group' ? !!session.user : session.kind !== 'guest');
  const email = session && 'user' in session ? session.user?.email : null;

  useEffect(() => {
    document.title = groupName ?? 'Fireside';
  }, [groupName]);

  // 管理者が選んだテーマカラーを、画面全体に当てる（グループを読めたときだけ。読めないあいだは前の色のまま）
  const accentColor = session && session.kind !== 'no-group' ? (session.group.accentColor ?? null) : undefined;
  useEffect(() => {
    if (accentColor !== undefined) applyAccent(accentColor);
  }, [accentColor]);

  // スマホの幅では、メニューを右から開くドロワーにする
  const narrow = useIsNarrow();
  const drawer = isMember && narrow;
  const [open, setOpen] = useState(false);
  const navId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();

  // ページを移ったとき、広い幅になったときは閉じる
  useEffect(() => setOpen(false), [pathname, drawer]);

  // 開いているあいだは、後ろのページをスクロールさせず、Esc で閉じる。閉じたら「メニュー」ボタンに戻る
  useEffect(() => {
    if (!open) return;
    navRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const toggle = toggleRef.current;
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
      toggle?.focus();
    };
  }, [open]);

  return (
    <>
      <header className="site-header">
        <div className="inner">
          <Link to="/" className="brand">
            {groupName ?? 'Fireside'}
          </Link>
          {drawer && (
            <button
              ref={toggleRef}
              type="button"
              className="menu-button"
              aria-expanded={open}
              aria-controls={navId}
              onClick={() => setOpen(true)}
            >
              <span className="menu-icon" aria-hidden="true" />
              メニュー
            </button>
          )}
          {signedIn && !drawer && (
            <span className="account">
              <span className="account-name">{nickname ?? email}</span>
              <button type="button" className="button-text" onClick={() => void logout()}>
                ログアウト
              </button>
            </span>
          )}
        </div>
        {isMember && (
          <nav
            ref={navRef}
            id={navId}
            className={`inner site-nav${drawer ? ' drawer' : ''}${open ? ' is-open' : ''}`}
            aria-label="メニュー"
            inert={drawer && !open}
          >
            {drawer && (
              <div className="drawer-head">
                <span className="account-name">{nickname ?? email}</span>
                <button type="button" className="button-text" onClick={() => setOpen(false)}>
                  閉じる
                </button>
              </div>
            )}
            <NavLink to="/events">イベント</NavLink>
            <NavLink to="/board">掲示板</NavLink>
            <NavLink to="/members">メンバー</NavLink>
            <NavLink to="/me">マイページ</NavLink>
            {!isAdmin && <NavLink to="/contact">問い合わせ</NavLink>}
            {isAdmin && (
              <>
                {drawer ? <span className="drawer-section">管理</span> : <span className="nav-divider" aria-hidden="true" />}
                <NavLink to="/admin/events">イベント管理</NavLink>
                <NavLink to="/admin/applications">参加申し込み</NavLink>
                <NavLink to="/admin/members">メンバー管理</NavLink>
                <NavLink to="/admin/mails">メール</NavLink>
                <NavLink to="/admin/inquiries">問い合わせ</NavLink>
                <NavLink to="/admin/settings">設定</NavLink>
              </>
            )}
            {drawer && (
              <button type="button" className="button-text drawer-logout" onClick={() => void logout()}>
                ログアウト
              </button>
            )}
          </nav>
        )}
        {drawer && open && <div className="drawer-backdrop" onClick={() => setOpen(false)} />}
      </header>

      <Suspense fallback={<Loading />}>
        <Outlet />
      </Suspense>

      <footer className="site-footer">
        <div className="inner">
          {groupName && <div>© {groupName}</div>}
          <div className="powered">
            Powered by <a href={FIRESIDE_URL}>Fireside</a>
          </div>
        </div>
      </footer>
    </>
  );
}
