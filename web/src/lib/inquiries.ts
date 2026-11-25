// メンバーから管理者への問い合わせ（inquiries）の読み書き。
// 送るのは毎時の Actions（scripts/lib/notify.ts）で、管理者全員に届け、通知した日時（notifiedAt）を書く。
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  type Firestore,
  type Timestamp,
} from 'firebase/firestore';
import type { Member } from './membership';

export interface InquiryInput {
  subject: string;
  body: string;
}

export interface InquiryDoc {
  id: string;
  uid: string;
  realName: string;
  nickname: string;
  email: string;
  subject: string;
  body: string;
  createdAt: Timestamp | null;
  /** Actions が管理者に通知した日時。まだなら undefined */
  notifiedAt?: Timestamp;
}

/** 問い合わせを送る。名前とメールアドレスは members の内容を写す（ルールで一致を確かめる） */
export async function sendInquiry(db: Firestore, member: Member, input: InquiryInput): Promise<void> {
  await addDoc(collection(db, 'inquiries'), {
    uid: member.uid,
    realName: member.realName,
    nickname: member.nickname,
    email: member.email,
    subject: input.subject,
    body: input.body,
    createdAt: serverTimestamp(),
  });
}

/** 問い合わせを新しい順に返す（管理者だけ） */
export async function listInquiries(db: Firestore): Promise<InquiryDoc[]> {
  const snap = await getDocs(query(collection(db, 'inquiries'), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ ...(d.data() as Omit<InquiryDoc, 'id'>), id: d.id }));
}

/** 問い合わせを削除する（管理者だけ） */
export async function deleteInquiry(db: Firestore, id: string): Promise<void> {
  await deleteDoc(doc(db, 'inquiries', id));
}
