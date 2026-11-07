// グループ（group/profile）の読み書き。
// db を引数で受け取るのは、エミュレーターのテスト（tests/rules/）からも同じ関数を使うため。
import { doc, getDoc, serverTimestamp, updateDoc, writeBatch, type Firestore, type Timestamp } from 'firebase/firestore';
import type { SignedInUser } from './membership';

export interface GroupProfile {
  name: string;
  description: string;
  /** トップページに出す管理者の名前 */
  ownerName: string;
  ownerUid: string;
  createdAt: Timestamp | null;
}

export interface GroupInput {
  name: string;
  description: string;
  ownerName: string;
}

export interface PersonInput {
  realName: string;
  nickname: string;
}

function groupRef(db: Firestore) {
  return doc(db, 'group', 'profile');
}

export async function getGroup(db: Firestore): Promise<GroupProfile | null> {
  const snap = await getDoc(groupRef(db));
  return snap.exists() ? (snap.data() as GroupProfile) : null;
}

/**
 * グループを作り、作成者を特権管理者（owner）として登録する。
 * すでにグループがある場合はルールで拒否され、permission-denied になる
 */
export async function createGroup(
  db: Firestore,
  user: SignedInUser,
  group: GroupInput,
  owner: PersonInput,
): Promise<void> {
  const batch = writeBatch(db);
  batch.set(groupRef(db), { ...group, ownerUid: user.uid, createdAt: serverTimestamp() });
  batch.set(doc(db, 'members', user.uid), {
    uid: user.uid,
    role: 'owner',
    realName: owner.realName,
    nickname: owner.nickname,
    email: user.email,
    joinedAt: serverTimestamp(),
  });
  await batch.commit();
}

/** グループの情報を変える（特権管理者だけ） */
export async function updateGroup(db: Firestore, group: GroupInput): Promise<void> {
  await updateDoc(groupRef(db), { ...group });
}
