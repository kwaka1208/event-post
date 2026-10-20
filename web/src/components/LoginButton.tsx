import { useState } from 'react';
import { isPopupClosed, loginErrorMessage } from '@/lib/errors';
import { useSession } from '@/session/SessionProvider';

export function LoginButton({ onLoggedIn }: { onLoggedIn?: () => void }) {
  const { login } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="button-primary" disabled={busy} onClick={() => void handleClick()}>
        Googleでログイン
      </button>
    </div>
  );
}
