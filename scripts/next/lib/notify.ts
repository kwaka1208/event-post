// 参加申し込みの通知（管理者宛て）と、承認の通知（本人宛て）。毎時の Actions から実行する。
// 送ったかどうかは applications の notifiedAt と members の welcomedAt だけで判定する。
// 送信に成功してから記録するので、失敗した分は次の回に送り直す。
import { FieldValue, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { applicationsMail, welcomeMail, type ApplicantSummary, type Mail } from './messages';

export interface Recipient {
  name: string;
  email: string;
}

export type SendMail = (to: Recipient, mail: Mail) => Promise<void>;

export interface NotifyOptions {
  db: Firestore;
  /** メールに載せるサイトの URL */
  siteUrl: string;
  send: SendMail;
  /** true なら送信も書き込みもせず、予定だけを返す */
  dryRun: boolean;
}

export type DeliveryKind = 'applications' | 'welcome';

export interface Delivery {
  kind: DeliveryKind;
  /** 宛先のメンバーの uid */
  uid: string;
}

export interface NotifyResult {
  /** 送ったメール（dryRun では送る予定のメール） */
  sent: Delivery[];
  failed: (Delivery & { error: string })[];
  /** 失敗が続いたため、途中で送信をやめた */
  stopped: boolean;
  /** 通知済みにした申し込みの件数（dryRun では通知する予定の件数） */
  notifiedApplications: number;
  warnings: string[];
}

/** 連続でこの回数失敗したら、SMTP の設定や上限の問題とみなして送信をやめる */
export const MAX_CONSECUTIVE_FAILURES = 3;

// gRPC の NOT_FOUND
const NOT_FOUND = 5;

export async function runNotify(opts: NotifyOptions): Promise<NotifyResult> {
  const { db, siteUrl, dryRun } = opts;
  const result: NotifyResult = { sent: [], failed: [], stopped: false, notifiedApplications: 0, warnings: [] };
  let consecutiveFailures = 0;

  /** 1 通送る。送れたら true */
  const deliver = async (delivery: Delivery, to: Recipient, mail: Mail): Promise<boolean> => {
    if (dryRun) {
      result.sent.push(delivery);
      return true;
    }
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      result.stopped = true;
      return false;
    }
    try {
      await opts.send(to, mail);
    } catch (e) {
      consecutiveFailures++;
      result.failed.push({ ...delivery, error: (e as Error).message });
      return false;
    }
    consecutiveFailures = 0;
    result.sent.push(delivery);
    return true;
  };

  const group = await db.doc('group/profile').get();
  if (!group.exists) {
    result.warnings.push('グループがまだ作られていないため、何も送りませんでした');
    return result;
  }
  const groupName: string = group.get('name');

  const members = (await db.collection('members').orderBy('joinedAt').get()).docs;
  const admins = members.filter((m) => ['owner', 'admin'].includes(m.get('role')));

  // 申し込みの通知：その回の新しい申し込みをまとめて、管理者 1 人につき 1 通送る
  const pending = (await db.collection('applications').orderBy('createdAt').get()).docs.filter(
    (a) => a.get('notifiedAt') == null,
  );
  if (pending.length > 0) {
    const applicants: ApplicantSummary[] = pending.map((a) => ({
      realName: a.get('realName'),
      nickname: a.get('nickname'),
      reason: a.get('reason'),
    }));
    const mail = applicationsMail(groupName, siteUrl, applicants);
    let delivered = false;
    for (const admin of admins) {
      const to = { name: admin.get('realName'), email: admin.get('email') };
      if (await deliver({ kind: 'applications', uid: admin.id }, to, mail)) delivered = true;
    }
    // 1 人にでも届けば通知済みにする（壊れた宛先が 1 つあるだけで、ほかの管理者に毎時同じメールが届かないように）
    if (delivered) {
      result.notifiedApplications = pending.length;
      if (!dryRun) for (const a of pending) await record(a.ref, 'notifiedAt');
    }
  }

  // 承認の通知：特権管理者は自分でグループを作ったので送らない
  for (const member of members) {
    if (member.get('role') === 'owner' || member.get('welcomedAt') != null) continue;
    const to = { name: member.get('realName'), email: member.get('email') };
    const mail = welcomeMail(groupName, siteUrl, member.get('nickname'));
    if ((await deliver({ kind: 'welcome', uid: member.id }, to, mail)) && !dryRun) await record(member.ref, 'welcomedAt');
  }

  return result;
}

async function record(ref: DocumentReference, field: string) {
  try {
    await ref.update({ [field]: FieldValue.serverTimestamp() });
  } catch (e) {
    // 送信中に削除された申し込みやメンバーは、記録できなくてよい
    if ((e as { code?: unknown }).code !== NOT_FOUND) throw e;
  }
}
