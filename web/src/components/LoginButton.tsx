import { useState } from 'react';
import { isPopupClosed, loginErrorMessage } from '@/lib/errors';
import { inAppBrowserName, lineExternalUrl } from '@/lib/inAppBrowser';
import { useSession } from '@/session/SessionProvider';

export function LoginButton({ onLoggedIn }: { onLoggedIn?: () => void }) {
  const { login } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inApp = inAppBrowserName(navigator.userAgent);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      await login();
      onLoggedIn?.();
    } catch (e) {
      if (!isPopupClosed(e)) setError(loginErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {inApp !== null && <InAppBrowserNotice name={inApp} />}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className={inApp !== null ? 'button-secondary' : 'button-primary'}
        disabled={busy}
        onClick={() => void handleClick()}
      >
        {inApp !== null ? 'このままログインを試す' : 'Googleでログイン'}
      </button>
    </div>
  );
}

/** アプリの中のブラウザで開いているときの案内。Safari や Chrome で開き直してもらう */
function InAppBrowserNotice({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);
  const url = location.href;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="notice-warning" role="note">
      <p>
        <strong>Safari や Chrome で開いてください。</strong>
        {name ? `${name}${/[A-Za-z!]$/.test(name) ? ' ' : ''}の中` : 'アプリの中'}のブラウザでは、Google のログインがうまくいかず、白い画面のまま進まないことがあります。
      </p>
      {name === 'LINE' ? (
        <a className="button-primary" href={lineExternalUrl(url)}>
          ブラウザで開き直す
        </a>
      ) : (
        <>
          <p>画面の「…」や共有のメニューから「ブラウザで開く」（「Safari で開く」「Chrome で開く」）を選ぶか、URL をコピーしてブラウザに貼り付けてください。</p>
          <button type="button" className="button-primary" onClick={() => void copy()}>
            {copied ? 'コピーしました' : 'URL をコピーする'}
          </button>
        </>
      )}
    </div>
  );
}
