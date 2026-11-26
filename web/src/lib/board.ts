// 掲示板（topics と、その下の replies）の読み書き。メンバーだけが読み書きできる（ルールで確かめる）。
// 書いた人のニックネームは、書いた時点の members の写し。メールでの通知はしない
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Firestore,
  type Timestamp,
} from 'firebase/firestore';
import type { Member } from './membership';

/** 一覧に出す話題の数（返信が新しい順） */
export const TOPIC_LIST_LIMIT = 100;

export interface TopicInput {
  title: string;
  body: string;
}

export interface TopicDoc {
  id: string;
  uid: string;
  nickname: string;
  title: string;
  body: string;
  createdAt: Timestamp | null;
  /** 最後に話題か返信が書かれた日時。一覧はこの新しい順に並べる */
  lastPostedAt: Timestamp | null;
  /** 最後の返信の ID。返信がまだなければ null */
  lastReplyId: string | null;
}

export interface ReplyDoc {
  id: string;
  uid: string;
  nickname: string;
  body: string;
  createdAt: Timestamp | null;
}

function topicRef(db: Firestore, id: string) {
  return doc(db, 'topics', id);
}

function repliesOf(db: Firestore, topicId: string) {
  return collection(db, 'topics', topicId, 'replies');
}

/** 話題を立てる。作った話題の ID を返す */
export async function createTopic(db: Firestore, me: Member, input: TopicInput): Promise<string> {
  const ref = doc(collection(db, 'topics'));
  await setDoc(ref, {
    uid: me.uid,
    nickname: me.nickname,
    title: input.title,
    body: input.body,
    createdAt: serverTimestamp(),
    lastPostedAt: serverTimestamp(),
    lastReplyId: null,
  });
  return ref.id;
}

/** 話題を、最後の投稿が新しい順に返す */
export async function listTopics(db: Firestore): Promise<TopicDoc[]> {
  const snap = await getDocs(query(collection(db, 'topics'), orderBy('lastPostedAt', 'desc'), limit(TOPIC_LIST_LIMIT)));
  return snap.docs.map((d) => ({ ...(d.data() as Omit<TopicDoc, 'id'>), id: d.id }));
}

/** 話題を 1 件返す。ないときは null */
export async function getTopic(db: Firestore, id: string): Promise<TopicDoc | null> {
  const snap = await getDoc(topicRef(db, id));
  return snap.exists() ? { ...(snap.data() as Omit<TopicDoc, 'id'>), id: snap.id } : null;
}

/** 話題への返信を、古い順に返す */
export async function listReplies(db: Firestore, topicId: string): Promise<ReplyDoc[]> {
  const snap = await getDocs(query(repliesOf(db, topicId), orderBy('createdAt', 'asc')));
  return snap.docs.map((d) => ({ ...(d.data() as Omit<ReplyDoc, 'id'>), id: d.id }));
}

/** 返信する。同じ書き込みで、話題の最後の投稿日時を進める（一覧の上に来るように） */
export async function reply(db: Firestore, me: Member, topicId: string, body: string): Promise<void> {
  const ref = doc(repliesOf(db, topicId));
  const batch = writeBatch(db);
  batch.set(ref, { uid: me.uid, nickname: me.nickname, body, createdAt: serverTimestamp() });
  batch.update(topicRef(db, topicId), { lastPostedAt: serverTimestamp(), lastReplyId: ref.id });
  await batch.commit();
}

/** 返信を消す（書いた人、管理者、話題を立てた人） */
export async function deleteReply(db: Firestore, topicId: string, replyId: string): Promise<void> {
  await deleteDoc(doc(repliesOf(db, topicId), replyId));
}

/**
 * 話題を消す（立てた人、管理者）。返信を 1 件ずつ消してから、話題を消す。
 * 途中で失敗したときは、もう一度消せば残りを消す
 */
export async function deleteTopic(db: Firestore, topicId: string): Promise<void> {
  const replies = await getDocs(repliesOf(db, topicId));
  for (const r of replies.docs) await deleteDoc(r.ref);
  await deleteDoc(topicRef(db, topicId));
}

/** me がこの投稿を消せるか（ルールと同じ条件）。topicUid は返信のときだけ渡す */
export function canDeletePost(me: Member, postUid: string, topicUid?: string): boolean {
  return postUid === me.uid || me.role === 'owner' || me.role === 'admin' || topicUid === me.uid;
}
