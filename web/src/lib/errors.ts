import { FirebaseError } from 'firebase/app';

/** ログインのポップアップを利用者が閉じただけのときは、エラーとして扱わない */
export function isPopupClosed(e: unknown): boolean {
  return (
    e instanceof FirebaseError &&
    (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request')
  );
}

export function loginErrorMessage(e: unknown): string {
  if (e instanceof FirebaseError && e.code === 'auth/popup-blocked') {
    return 'ログインの画面がブロックされました。ブラウザでポップアップを許可してから、もう一度お試しください。';
  }
  return 'ログインできませんでした。時間をおいて、もう一度お試しください。';
}

export function isPermissionDenied(e: unknown): boolean {
  return e instanceof FirebaseError && e.code === 'permission-denied';
}

/**
 * Firestore のインデックスがまだ使えない（初めてのデプロイの直後に、構築が終わっていない）。
 * 数分待てば読めるようになるので、通信や権限のエラーとは分けて案内する
 */
export function isIndexNotReady(e: unknown): boolean {
  return e instanceof FirebaseError && e.code === 'failed-precondition';
}
