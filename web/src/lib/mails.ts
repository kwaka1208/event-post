// 管理者が書いたメール（mails）の読み書き。送信は毎時の Actions（scripts/）が行う。
// 権限と入力の確認はルール（firebase/firestore.rules）が行う。
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Firestore,
  type Timestamp,
} from 'firebase/firestore';
import type { Member } from './membership';

/** 宛先。書いた時点の名前とメールアドレスを写す */
export interface MailRecipient {
  uid: string;
  name: string;
  email: string;
}

export type MailStatus =
  /** 送信待ち。次の毎時の送信で送る（失敗した宛先があれば、送り直す） */
  | 'pending'
  | 'sent'
  /** 送り直しても届かない宛先があった */
  | 'failed';

export interface MailDoc {
  id: string;
  subject: string;
  body: string;
  recipients: MailRecipient[];
  createdByUid: string;
  createdByName: string;
  createdAt: Timestamp | null;
  status: MailStatus;
  /** 以下は Actions が書く */
  deliveredUids?: string[];
  failedUids?: string[];
  attempts?: number;
  sentAt?: Timestamp | null;
}

export interface MailInput {
  subject: string;
  body: string;
  recipients: MailRecipient[];
}

/** メンバーを宛先にする */
export function recipientOf(m: { uid: string; realName: string; email: string }): MailRecipient {
  return { uid: m.uid, name: m.realName, email: m.email };
}

/** メールを送信待ちで保存する（管理者だけ） */
export async function createMail(db: Firestore, me: Member, input: MailInput): Promise<string> {
  const ref = doc(collection(db, 'mails'));
  await setDoc(ref, {
    subject: input.subject,
    body: input.body,
    recipients: input.recipients,
    createdByUid: me.uid,
    createdByName: me.realName,
    createdAt: serverTimestamp(),
    status: 'pending',
  });
  return ref.id;
}

/** 書いたメールを新しい順に返す（管理者だけ） */
export async function listMails(db: Firestore): Promise<MailDoc[]> {
  const snap = await getDocs(query(collection(db, 'mails'), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ ...(d.data() as Omit<MailDoc, 'id'>), id: d.id }));
}

/** 送信前のメールを削除する（管理者だけ。送り始めたメールはルールで拒否される） */
export async function deleteMail(db: Firestore, id: string): Promise<void> {
  await deleteDoc(doc(db, 'mails', id));
}

/** 送信前で、削除できるか（ルールと同じ条件） */
export function isMailDeletable(mail: MailDoc): boolean {
  return mail.status === 'pending' && (mail.deliveredUids?.length ?? 0) === 0;
}
