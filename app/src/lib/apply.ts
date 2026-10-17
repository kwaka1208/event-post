// 申込とキャンセル。registration の作成・削除と events の count の ±1 を、1 つのトランザクションで行う。
// ルール（firebase/firestore.rules）は、この 2 つが同時に書かれることを前提に検証している。
// db を引数で受け取るのは、エミュレーターのテスト（tests/rules/）からも同じ関数を使うため。
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  type Firestore,
  type Timestamp,
} from 'firebase/firestore';
import type { AnswerValue } from './answers';

export interface Registration {
  uid: string;
  name: string;
  email: string;
  answers: Record<string, AnswerValue>;
  createdAt: Timestamp | null;
}

/** Firestore の events/{eventId}（sync-firestore.ts が書く写し） */
export interface EventDoc {
  count: number;
  capacity: number | null;
  deadline: Timestamp;
  startAt: Timestamp;
  published: boolean;
  archived: boolean;
}

export interface Applicant {
  uid: string;
  /** auth の email をそのまま使う（ルールで token.email と一致を確認している） */
  email: string;
}

function eventRef(db: Firestore, eventId: string) {
  return doc(db, 'events', eventId);
}

function registrationRef(db: Firestore, eventId: string, uid: string) {
  return doc(db, 'events', eventId, 'registrations', uid);
}

export async function getEvent(db: Firestore, eventId: string): Promise<EventDoc | null> {
  const snap = await getDoc(eventRef(db, eventId));
  return snap.exists() ? (snap.data() as EventDoc) : null;
}

export async function getRegistration(db: Firestore, eventId: string, uid: string): Promise<Registration | null> {
  const snap = await getDoc(registrationRef(db, eventId, uid));
  return snap.exists() ? (snap.data() as Registration) : null;
}

/** 申し込む。定員超過・締切後などはルールで拒否され、permission-denied になる */
export async function applyForEvent(
  db: Firestore,
  eventId: string,
  applicant: Applicant,
  name: string,
  answers: Record<string, AnswerValue>,
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ev = await tx.get(eventRef(db, eventId));
    if (!ev.exists()) throw new Error(`イベント ${eventId} が Firestore にありません`);
    tx.set(registrationRef(db, eventId, applicant.uid), {
      uid: applicant.uid,
      name,
      email: applicant.email,
      answers,
      createdAt: serverTimestamp(),
    });
    tx.update(eventRef(db, eventId), { count: (ev.data().count as number) + 1 });
  });
}

/** 申込をキャンセルする。開始時刻を過ぎるとルールで拒否される */
export async function cancelRegistration(db: Firestore, eventId: string, uid: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ev = await tx.get(eventRef(db, eventId));
    if (!ev.exists()) throw new Error(`イベント ${eventId} が Firestore にありません`);
    tx.delete(registrationRef(db, eventId, uid));
    tx.update(eventRef(db, eventId), { count: (ev.data().count as number) - 1 });
  });
}

export type ApplyFailure = 'full' | 'closed' | 'unknown';

/** 申込が拒否されたあとに events を読み直し、理由を推定する */
export function diagnoseApplyFailure(event: EventDoc | null, now: Date): ApplyFailure {
  if (!event) return 'unknown';
  if (!event.published || event.archived || now.getTime() >= event.deadline.toMillis()) return 'closed';
  if (event.capacity !== null && event.count >= event.capacity) return 'full';
  return 'unknown';
}
