// 管理ページの読み取り。管理者かどうかの判定はルール（firebase/firestore.rules の isAdmin）に任せる。
import { FirebaseError } from 'firebase/app';
import { collection, doc, getDoc, getDocs, type Firestore, type Timestamp } from 'firebase/firestore';
import type { RegistrationRow } from './csv';

/**
 * ログイン中のユーザーが管理者か。config/admins は管理者だけが読めるので、読めるかどうかで判定する。
 * permission-denied 以外のエラー（通信エラーなど）はそのまま投げる。
 */
export async function canReadAdmin(db: Firestore): Promise<boolean> {
  try {
    await getDoc(doc(db, 'config', 'admins'));
    return true;
  } catch (e) {
    if (e instanceof FirebaseError && e.code === 'permission-denied') return false;
    throw e;
  }
}

/** events の count（申込数）をイベント ID ごとに返す。events は誰でも読める */
export async function getEventCounts(db: Firestore): Promise<Map<string, number>> {
  const snap = await getDocs(collection(db, 'events'));
  return new Map(snap.docs.map((d) => [d.id, d.data().count as number]));
}

function toDate(t: Timestamp | null | undefined): Date | null {
  return t ? t.toDate() : null;
}

/** イベントの申込一覧を、申込日時の新しい順で返す */
export async function listRegistrations(db: Firestore, eventId: string): Promise<RegistrationRow[]> {
  const snap = await getDocs(collection(db, 'events', eventId, 'registrations'));
  const rows = snap.docs.map((d): RegistrationRow => {
    const data = d.data();
    return {
      name: data.name,
      email: data.email,
      answers: data.answers ?? {},
      createdAt: toDate(data.createdAt),
      confirmationSentAt: toDate(data.confirmationSentAt),
      remindedAt: toDate(data.remindedAt),
    };
  });
  return rows.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}
