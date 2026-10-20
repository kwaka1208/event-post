// トップページ。グループ名・管理者の名前・説明と、ログインのボタンを出す。誰でも見られる
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { LoginButton } from '@/components/LoginButton';
import { LoadError, Loading } from '@/components/Status';
import { homePathFor } from '@/lib/session';
import { useSession } from '@/session/SessionProvider';

export function TopPage() {
  const { state } = useSession();
  const navigate = useNavigate();
  // このページでログインしたときだけ、ログイン後の画面へ移す（戻ってきた人は移さない）
  const [justLoggedIn, setJustLoggedIn] = useState(false);

  useEffect(() => {
    if (!justLoggedIn || state.status !== 'ready') return;
    const path = homePathFor(state.session);
    if (path !== '/') navigate(path);
  }, [justLoggedIn, state, navigate]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <LoadError />;
  const { session } = state;

  if (session.kind === 'no-group') {
    return (
      <main className="main">
        <section className="card">
          <h1 className="card-title">グループはまだありません</h1>
          <p>このサイトには、まだグループが作られていません。グループを作った人が特権管理者になります。</p>
          <Link to="/setup" className="button-primary">
            グループを作成
          </Link>
        </section>
      </main>
    );
  }

  const { group } = session;
  return (
    <main className="main">
      <section className="intro">
        <h1>{group.name}</h1>
        <p className="owner">管理者：{group.ownerName}</p>
        {group.description && <p className="description">{group.description}</p>}
      </section>

      <section className="card">
        {session.kind === 'guest' && (
          <>
            <p>このグループのページは、参加しているメンバーだけが見られます。Google アカウントでログインしてください。</p>
            <LoginButton onLoggedIn={() => setJustLoggedIn(true)} />
          </>
        )}
        {session.kind === 'newcomer' && (
          <>
            <p>このグループに参加するには、申し込みが必要です。</p>
            <Link to="/join" className="button-primary">
              参加を申し込む
            </Link>
          </>
        )}
        {session.kind === 'pending' && (
          <>
            <p>参加の申し込みを受け付けました。管理者の承認をお待ちください。</p>
            <Link to="/join" className="button-secondary">
              申し込みの内容を見る
            </Link>
          </>
        )}
        {session.kind === 'member' && (
          <Link to="/events" className="button-primary">
            イベントを見る
          </Link>
        )}
      </section>
    </main>
  );
}
