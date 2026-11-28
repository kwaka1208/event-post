// メンバー一覧（directory）の読み書き。ドキュメント ID は uid。
// members には本名やメールアドレスが入っていて本人と管理者しか読めないので、
// メンバー全員に見せる内容（ニックネームの写し、自己紹介、URL）だけを別に持つ。
// 権限の確認はルール（firebase/firestore.rules）が行う。
import { collection, doc, getDoc, getDocs, setDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { LIMITS } from './limits';

export interface DirectoryEntry {
  uid: string;
  /** members の nickname の写し */
  nickname: string;
  /** 自己紹介。書いていなければ空 */
  bio: string;
  /** http:// か https:// で始まる URL。書いていなければ空 */
  url: string;
  /** プロフィール画像（data: URL の JPEG。avatar.ts で小さくしたもの）。設定していなければ undefined */
  photo?: string;
}

export interface IntroductionInput {
  bio: string;
  url: string;
  /** 空か undefined なら画像なし */
  photo?: string;
}

/** 書き込む内容。画像がないときは photo の項目自体を書かない */
export function entryData(uid: string, nickname: string, input: IntroductionInput): DirectoryEntry {
  const data: DirectoryEntry = { uid, nickname, bio: input.bio, url: input.url };
  if (input.photo) data.photo = input.photo;
  return data;
}

export function directoryRef(db: Firestore, uid: string) {
  return doc(db, 'directory', uid);
}

const collator = new Intl.Collator('ja');

/** メンバー一覧をニックネームの五十音順で返す（メンバー） */
export async function listDirectory(db: Firestore): Promise<DirectoryEntry[]> {
  const snap = await getDocs(collection(db, 'directory'));
  return snap.docs.map((d) => d.data() as DirectoryEntry).sort((a, b) => collator.compare(a.nickname, b.nickname));
}

export async function getDirectoryEntry(db: Firestore, uid: string): Promise<DirectoryEntry | null> {
  const snap = await getDoc(directoryRef(db, uid));
  return snap.exists() ? (snap.data() as DirectoryEntry) : null;
}

/** 入力された URL を整える（前後の空白を除く） */
export function normalizeUrl(url: string): string {
  return url.trim();
}

/** URL として受け付けるか（空か、http:// か https:// で始まって空白を含まない。ルールと同じ条件） */
export function isValidUrl(url: string): boolean {
  return url === '' || (url.length <= LIMITS.introUrl && /^https?:\/\/\S+$/.test(url));
}

/** 本人が自己紹介、URL、画像を書く。ニックネームは members と同じものを写す */
export async function saveIntroduction(
  db: Firestore,
  uid: string,
  nickname: string,
  input: IntroductionInput,
): Promise<void> {
  await setDoc(directoryRef(db, uid), entryData(uid, nickname, input));
}

/** 1 回の書き込みでそろえる人数（ルールの get の回数の上限に収まるように） */
const SYNC_CHUNK = 5;

/**
 * 管理者が、メンバー一覧をメンバーにそろえる。一覧にまだいないメンバーを空の自己紹介で足し、
 * もうメンバーでない人を一覧から消す（この機能より前からいるメンバーや、途中で失敗した書き込みのため）
 */
export async function syncDirectory(db: Firestore, members: { uid: string; nickname: string }[]): Promise<void> {
  const entries = await getDocs(collection(db, 'directory'));
  const listed = new Set(entries.docs.map((d) => d.id));
  const memberUids = new Set(members.map((m) => m.uid));
  const missing = members.filter((m) => !listed.has(m.uid));
  const orphans = [...listed].filter((uid) => !memberUids.has(uid));

  const ops = [
    ...missing.map((m) => (batch: ReturnType<typeof writeBatch>) =>
      batch.set(directoryRef(db, m.uid), { uid: m.uid, nickname: m.nickname, bio: '', url: '' }),
    ),
    ...orphans.map((uid) => (batch: ReturnType<typeof writeBatch>) => batch.delete(directoryRef(db, uid))),
  ];
  for (let i = 0; i < ops.length; i += SYNC_CHUNK) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + SYNC_CHUNK)) op(batch);
    await batch.commit();
  }
}
