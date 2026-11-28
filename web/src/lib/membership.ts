// メンバー（members）と参加申し込み（applications）の読み書き。
// 権限の確認はルール（firebase/firestore.rules）が行う。
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
import { directoryRef, getDirectoryEntry } from './directory';
import { isPermissionDenied } from './errors';
import { cancelRegistration } from './registrations';

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
  /** 管理者が付けるタグ（グループの中での分類）。管理者だけが見る。付けていなければ undefined */
  tags?: string[];
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

/** メンバーを参加日時の古い順に並べて返す（管理者だけ） */
export async function listMembers(db: Firestore): Promise<Member[]> {
  const snap = await getDocs(query(collection(db, 'members'), orderBy('joinedAt', 'asc')));
  return snap.docs.map((d) => d.data() as Member);
}

/** me が target を削除できるか（ルールと同じ条件）。参加者は管理者が、管理者は特権管理者が削除できる */
export function canRemoveMember(me: Member, target: Member): boolean {
  if (target.role === 'owner' || target.uid === me.uid) return false;
  if (me.role === 'owner') return true;
  return me.role === 'admin' && target.role === 'member';
}

/** me が target の役割を変えられるか（ルールと同じ条件）。特権管理者だけが、ほかの人の役割を変えられる */
export function canChangeRole(me: Member, target: Member): boolean {
  return me.role === 'owner' && target.role !== 'owner';
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
 * 申し込みを承認する。members とメンバー一覧（directory）の作成と、申し込みの削除を 1 回の書き込みで行う。
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
  batch.set(directoryRef(db, app.uid), { uid: app.uid, nickname: app.nickname, bio: '', url: '' });
  batch.delete(applicationRef(db, app.uid));
  await batch.commit();
}

export interface ProfileInput {
  realName: string;
  nickname: string;
}

/** 1 回の書き込みで写しをそろえる申込の数（ルールの get の回数の上限に収まるように） */
const PROFILE_SYNC_CHUNK = 10;

/**
 * 本人が自分の本名とニックネームを変える。メンバー一覧（directory）のニックネームも同じ書き込みで変える。
 * そのあと、開始前のイベントの申込に残っている名前の写しをそろえる
 * （eventIds は開始前のイベントの ID。ルールが開始前かと、members と同じ名前かを確かめる）。
 * 写しをそろえる途中で失敗しても、members の変更は残る
 */
export async function updateProfile(db: Firestore, uid: string, input: ProfileInput, eventIds: string[]): Promise<void> {
  const entry = await getDirectoryEntry(db, uid);
  const batch = writeBatch(db);
  batch.update(memberRef(db, uid), { realName: input.realName, nickname: input.nickname });
  batch.set(directoryRef(db, uid), { uid, nickname: input.nickname, bio: entry?.bio ?? '', url: entry?.url ?? '' });
  await batch.commit();
  for (let i = 0; i < eventIds.length; i += PROFILE_SYNC_CHUNK) {
    const batch = writeBatch(db);
    for (const eventId of eventIds.slice(i, i + PROFILE_SYNC_CHUNK)) {
      batch.update(doc(db, 'events', eventId, 'registrations', uid), {
        realName: input.realName,
        nickname: input.nickname,
      });
    }
    await batch.commit();
  }
}

/**
 * 本人が退会する。先に開始前のイベントの申込をキャンセルしてから（定員の枠を空ける）、
 * members とメンバー一覧（directory）を同じ書き込みで消す。
 * cancelEventIds は開始前と分かっているイベントで、キャンセルに失敗したら退会しない。
 * tryCancelEventIds は下書きに戻されて開始日時が分からないイベントで、開始後でキャンセルできなければそのままにする。
 * 開始後のイベントの申込は、参加の記録として残す。特権管理者はルールで退会できない
 */
export async function withdraw(
  db: Firestore,
  uid: string,
  cancelEventIds: string[],
  tryCancelEventIds: string[],
): Promise<void> {
  for (const eventId of cancelEventIds) await cancelRegistration(db, eventId, uid);
  for (const eventId of tryCancelEventIds) {
    try {
      await cancelRegistration(db, eventId, uid);
    } catch (e) {
      if (!isPermissionDenied(e)) throw e;
    }
  }
  await removeMemberAndEntry(db, uid);
}

/** 役割を変える（特権管理者だけ） */
export async function changeRole(db: Firestore, uid: string, role: AssignableRole): Promise<void> {
  await updateDoc(memberRef(db, uid), { role });
}

/** メンバーのタグ。付けていなければ空 */
export function tagsOf(m: Pick<Member, 'tags'>): string[] {
  return m.tags ?? [];
}

const tagCollator = new Intl.Collator('ja');

/** メンバーに付いているタグを、重なりなしで五十音順に返す */
export function allTags(members: Pick<Member, 'tags'>[]): string[] {
  return [...new Set(members.flatMap(tagsOf))].sort(tagCollator.compare);
}

/** 選んだタグのどれかが付いているメンバー */
export function membersWithTags<T extends Pick<Member, 'tags'>>(members: T[], tags: Set<string>): T[] {
  return members.filter((m) => tagsOf(m).some((t) => tags.has(t)));
}

/** 入力されたタグを整える（前後の空白を除き、続く空白を 1 つにする） */
export function normalizeTag(tag: string): string {
  return tag.trim().replace(/\s+/g, ' ');
}

/** メンバーのタグを付け直す（管理者だけ）。並びは五十音順にそろえる */
export async function setMemberTags(db: Firestore, uid: string, tags: string[]): Promise<void> {
  await updateDoc(memberRef(db, uid), { tags: [...new Set(tags)].sort(tagCollator.compare) });
}

/** グループから削除する。参加者は管理者が、管理者は特権管理者が削除できる */
export async function removeMember(db: Firestore, uid: string): Promise<void> {
  await removeMemberAndEntry(db, uid);
}

/** members と、メンバー一覧（directory）を同じ書き込みで消す */
async function removeMemberAndEntry(db: Firestore, uid: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(memberRef(db, uid));
  batch.delete(directoryRef(db, uid));
  await batch.commit();
}
