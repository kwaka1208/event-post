// メンバー（members）と参加申し込み（applications）の読み書き。
// 権限の確認はルール（firebase/firestore.next.rules）が行う。
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
  type Timestamp,
} from 'firebase/firestore';

export type Role = 'owner' | 'admin' | 'member';
/** 承認や役割の変更で選べる役割（owner はグループの作成者だけ） */
export type AssignableRole = Exclude<Role, 'owner'>;

export interface SignedInUser {
  uid: string;
  /** auth の email をそのまま使う（ルールで token.email と一致を確認している） */
  email: string;
}

export interface Member {
  uid: string;
  role: Role;
  realName: string;
  nickname: string;
  email: string;
  joinedAt: Timestamp | null;
}

export interface Application {
  uid: string;
  realName: string;
  nickname: string;
  reason: string;
  email: string;
  createdAt: Timestamp | null;
}

export interface ApplicationInput {
  realName: string;
  nickname: string;
  reason: string;
}

function memberRef(db: Firestore, uid: string) {
  return doc(db, 'members', uid);
}

function applicationRef(db: Firestore, uid: string) {
  return doc(db, 'applications', uid);
}

export function isAdminRole(role: Role): boolean {
  return role === 'owner' || role === 'admin';
}

export async function getMember(db: Firestore, uid: string): Promise<Member | null> {
  const snap = await getDoc(memberRef(db, uid));
  return snap.exists() ? (snap.data() as Member) : null;
}

export async function getApplication(db: Firestore, uid: string): Promise<Application | null> {
  const snap = await getDoc(applicationRef(db, uid));
  return snap.exists() ? (snap.data() as Application) : null;
}

/** 申し込みを申込日時の古い順に並べて返す（管理者だけ） */
export async function listApplications(db: Firestore): Promise<Application[]> {
  const snap = await getDocs(query(collection(db, 'applications'), orderBy('createdAt', 'asc')));
  return snap.docs.map((d) => d.data() as Application);
}

/** 参加を申し込む。すでにメンバーの場合や、グループがまだない場合はルールで拒否される */
export async function submitApplication(db: Firestore, user: SignedInUser, input: ApplicationInput): Promise<void> {
  await setDoc(applicationRef(db, user.uid), {
    uid: user.uid,
    realName: input.realName,
    nickname: input.nickname,
    reason: input.reason,
    email: user.email,
    createdAt: serverTimestamp(),
  });
}

/** 申し込みを取り下げる（本人）、または削除する（管理者） */
export async function deleteApplication(db: Firestore, uid: string): Promise<void> {
  await deleteDoc(applicationRef(db, uid));
}

/**
 * 申し込みを承認する。members の作成と申し込みの削除を 1 回の書き込みで行う。
 * 管理者として承認できるのは特権管理者だけ（ほかはルールで拒否される）
 */
export async function approveApplication(db: Firestore, app: Application, role: AssignableRole): Promise<void> {
  const batch = writeBatch(db);
  batch.set(memberRef(db, app.uid), {
    uid: app.uid,
    role,
    realName: app.realName,
    nickname: app.nickname,
    email: app.email,
    joinedAt: serverTimestamp(),
  });
  batch.delete(applicationRef(db, app.uid));
  await batch.commit();
}

/** 役割を変える（特権管理者だけ） */
export async function changeRole(db: Firestore, uid: string, role: AssignableRole): Promise<void> {
  await updateDoc(memberRef(db, uid), { role });
}

/** グループから削除する。参加者は管理者が、管理者は特権管理者が削除できる */
export async function removeMember(db: Firestore, uid: string): Promise<void> {
  await deleteDoc(memberRef(db, uid));
}
