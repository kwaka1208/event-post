// イベントへの申込（events/{eventId}/registrations/{uid}）の読み書き。
// 申込とキャンセルは、申込のドキュメントと申込数（registrationCount）の ±1 を 1 回の書き込みで行う。
// 申込数は increment で変えるので、同時に申し込んでも片方が誤って失敗しない。定員はルールが確かめる。
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Firestore,
  type Timestamp,
} from 'firebase/firestore';
import type { EventDoc } from './events';
import type { Member } from './membership';

export interface Registration {
  uid: string;
  realName: string;
  nickname: string;
  email: string;
  createdAt: Timestamp | null;
}

/** 自分の申込（マイページ用）。どのイベントへの申込かを eventId で持つ */
export interface MyRegistration extends Registration {
  eventId: string;
}

function eventRef(db: Firestore, eventId: string) {
  return doc(db, 'events', eventId);
}

function registrationRef(db: Firestore, eventId: string, uid: string) {
  return doc(db, 'events', eventId, 'registrations', uid);
}

/** 自分の申込を返す。申し込んでいなければ null */
export async function getMyRegistration(db: Firestore, eventId: string, uid: string): Promise<Registration | null> {
  const snap = await getDoc(registrationRef(db, eventId, uid));
  return snap.exists() ? (snap.data() as Registration) : null;
}

/** 申し込む。名前とメールアドレスは members の内容を写す（ルールで一致を確かめる） */
export async function register(db: Firestore, eventId: string, member: Member): Promise<void> {
  const batch = writeBatch(db);
  batch.set(registrationRef(db, eventId, member.uid), {
    uid: member.uid,
    realName: member.realName,
    nickname: member.nickname,
    email: member.email,
    createdAt: serverTimestamp(),
  });
  batch.update(eventRef(db, eventId), { registrationCount: increment(1) });
  await batch.commit();
}

/** キャンセルする（開始日時まで） */
export async function cancelRegistration(db: Firestore, eventId: string, uid: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(registrationRef(db, eventId, uid));
  batch.update(eventRef(db, eventId), { registrationCount: increment(-1) });
  await batch.commit();
}

/** イベントの申込者を、申込日時の古い順に返す（管理者だけ） */
export async function listRegistrations(db: Firestore, eventId: string): Promise<Registration[]> {
  const snap = await getDocs(query(collection(db, 'events', eventId, 'registrations'), orderBy('createdAt', 'asc')));
  return snap.docs.map((d) => d.data() as Registration);
}

/** 自分の申込をすべて返す（collectionGroup で検索する。ルールが通るよう uid で絞り込む） */
export async function listMyRegistrations(db: Firestore, uid: string): Promise<MyRegistration[]> {
  const snap = await getDocs(query(collectionGroup(db, 'registrations'), where('uid', '==', uid)));
  return snap.docs.map((d) => ({ ...(d.data() as Registration), eventId: d.ref.parent.parent!.id }));
}

export type RegistrationStatus =
  /** 申し込める */
  | 'open'
  /** 申し込み済みで、まだキャンセルできる */
  | 'registered'
  /** 申し込み済みで、開始日時を過ぎた */
  | 'registered-started'
  | 'full'
  | 'closed'
  | 'ended'
  | 'draft';

/** 画面に出す申込の状態。ルールと同じ条件で判断する（決めるのはルール） */
export function registrationStatus(event: EventDoc, registered: boolean, now: Date): RegistrationStatus {
  const t = now.getTime();
  if (registered) return t < event.startAt.toMillis() ? 'registered' : 'registered-started';
  if (!event.published) return 'draft';
  if (t >= event.endAt.toMillis()) return 'ended';
  if (t >= event.deadlineAt.toMillis()) return 'closed';
  if (event.capacity !== null && event.registrationCount >= event.capacity) return 'full';
  return 'open';
}
