// 参加申し込みの通知（管理者宛て）、承認の通知（本人宛て）、イベントの受付メールとリマインド（本人宛て）、
// 管理者が書いたメール（mails）。毎時の Actions から実行する。
// 送ったかどうかは applications の notifiedAt、members の welcomedAt、registrations の confirmedAt・remindedAt、
// mails の deliveredUids だけで判定する。
// 送信に成功してから記録するので、失敗した分は次の回に送り直す。
import { FieldValue, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import {
  adminMail,
  applicationsMail,
  confirmationMail,
  reminderMail,
  welcomeMail,
  type ApplicantSummary,
  type EventSummary,
  type Mail,
} from './messages';
import { isReminderDue } from './time';

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
  /** リマインドを送り始める、開催前日の時刻（日本時間の時）。既定は DEFAULT_REMINDER_HOUR */
  reminderHour?: number;
  /** 今の時刻（テスト用）。既定は実行した時刻 */
  now?: Date;
}

export const DEFAULT_REMINDER_HOUR = 18;

/** REMINDER_HOUR を読む。空なら既定の時刻 */
export function parseReminderHour(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return DEFAULT_REMINDER_HOUR;
  const hour = Number(value);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(`環境変数 REMINDER_HOUR は 0〜23 の整数にしてください（今の値：${value}）`);
  }
  return hour;
}


export type DeliveryKind = 'applications' | 'welcome' | 'confirmation' | 'reminder' | 'mail';

export interface Delivery {
  kind: DeliveryKind;
  /** 宛先のメンバーの uid */
  uid: string;
  /** 管理者のメールのとき、その ID */
  mailId?: string;
  /** 受付メールとリマインドのとき、イベントの ID */
  eventId?: string;
}

export interface NotifyResult {
  /** 送ったメール（dryRun では送る予定のメール） */
  sent: Delivery[];
  failed: (Delivery & { error: string })[];
  /** 失敗が続いたため、途中で送信をやめた */
  stopped: boolean;
  /** 通知済みにした申し込みの件数（dryRun では通知する予定の件数） */
  notifiedApplications: number;
  /** 管理者のメールのうち、全員に届けて送信済みにした件数 */
  completedMails: number;
  /** 管理者のメールのうち、送り直しても届かない宛先があり、一部失敗で止めた件数 */
  failedMails: number;
  /** 受付メールとリマインドの対象にしたイベント（dryRun の見本に使う） */
  events: Map<string, EventSummary>;
  warnings: string[];
}

/** 連続でこの回数失敗したら、SMTP の設定や上限の問題とみなして送信をやめる */
export const MAX_CONSECUTIVE_FAILURES = 3;

/** 管理者のメールで、届かない宛先が残ったまま、この回数送り直したら一部失敗として止める */
export const MAX_MAIL_ATTEMPTS = 3;

// gRPC の NOT_FOUND
const NOT_FOUND = 5;

export async function runNotify(opts: NotifyOptions): Promise<NotifyResult> {
  const { db, siteUrl, dryRun } = opts;
  const result: NotifyResult = {
    sent: [],
    failed: [],
    stopped: false,
    notifiedApplications: 0,
    completedMails: 0,
    failedMails: 0,
    events: new Map(),
    warnings: [],
  };
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

  // 受付メールとリマインド：開始前の公開中のイベントの申込者に送る。キャンセルした人は申込が消えているので送らない
  const now = opts.now ?? new Date();
  const reminderHour = opts.reminderHour ?? DEFAULT_REMINDER_HOUR;
  const events = (await db.collection('events').where('published', '==', true).get()).docs
    .filter((e) => e.get('startAt').toMillis() > now.getTime())
    .sort((a, b) => a.get('startAt').toMillis() - b.get('startAt').toMillis());
  for (const doc of events) {
    const event: EventSummary = {
      id: doc.id,
      title: doc.get('title'),
      startAt: doc.get('startAt').toDate(),
      endAt: doc.get('endAt').toDate(),
      venue: doc.get('venue'),
      address: doc.get('address') ?? '',
    };
    result.events.set(doc.id, event);
    const remind = isReminderDue(event.startAt, reminderHour, now);
    const regs = await doc.ref.collection('registrations').orderBy('createdAt').get();
    for (const reg of regs.docs) {
      const to = { name: reg.get('realName'), email: reg.get('email') };
      const delivery = { uid: reg.id, eventId: doc.id };
      if (reg.get('confirmedAt') == null) {
        const mail = confirmationMail(groupName, siteUrl, event, reg.get('nickname'));
        if ((await deliver({ kind: 'confirmation', ...delivery }, to, mail)) && !dryRun) await record(reg.ref, 'confirmedAt');
      }
      if (remind && reg.get('remindedAt') == null) {
        const mail = reminderMail(groupName, siteUrl, event, reg.get('nickname'));
        if ((await deliver({ kind: 'reminder', ...delivery }, to, mail)) && !dryRun) await record(reg.ref, 'remindedAt');
      }
    }
  }

  // 管理者のメール：送信待ちのものを、書いた順に宛先へ 1 人ずつ送る（ほかの人のアドレスが見えないように）。
  // 届けた人は 1 人ごとに deliveredUids に記録するので、途中で止まっても、次の回に同じ人へは送らない
  const mails = (await db.collection('mails').where('status', '==', 'pending').get()).docs.sort(
    (a, b) => (a.get('createdAt')?.toMillis() ?? 0) - (b.get('createdAt')?.toMillis() ?? 0),
  );
  for (const doc of mails) {
    if (result.stopped) break;
    const delivered = new Set<string>(doc.get('deliveredUids') ?? []);
    const mail = adminMail(groupName, siteUrl, doc.get('subject'), doc.get('body'));
    const failedUids: string[] = [];
    let removed = false;
    for (const r of doc.get('recipients') as (Recipient & { uid: string })[]) {
      if (delivered.has(r.uid)) continue;
      if (await deliver({ kind: 'mail', uid: r.uid, mailId: doc.id }, { name: r.name, email: r.email }, mail)) {
        delivered.add(r.uid);
        // 送信中に管理者が削除したら、残りは送らない
        if (!dryRun && !(await update(doc.ref, { deliveredUids: FieldValue.arrayUnion(r.uid) }))) {
          removed = true;
          break;
        }
      } else {
        failedUids.push(r.uid);
      }
    }
    // 送信をやめたときは、SMTP の問題とみなして、送り直しの回数に数えない
    if (dryRun || removed || result.stopped) continue;
    if (failedUids.length === 0) {
      if (await update(doc.ref, { status: 'sent', failedUids: [], sentAt: FieldValue.serverTimestamp() })) {
        result.completedMails++;
      }
    } else {
      const attempts = (doc.get('attempts') ?? 0) + 1;
      const giveUp = attempts >= MAX_MAIL_ATTEMPTS;
      const saved = await update(doc.ref, {
        attempts,
        failedUids,
        ...(giveUp ? { status: 'failed', sentAt: FieldValue.serverTimestamp() } : {}),
      });
      if (saved && giveUp) result.failedMails++;
    }
  }

  return result;
}

/** 書き込む。送信中に削除されていたら false を返す */
async function update(ref: DocumentReference, data: Record<string, unknown>): Promise<boolean> {
  try {
    await ref.update(data);
    return true;
  } catch (e) {
    if ((e as { code?: unknown }).code === NOT_FOUND) return false;
    throw e;
  }
}

async function record(ref: DocumentReference, field: string) {
  try {
    await ref.update({ [field]: FieldValue.serverTimestamp() });
  } catch (e) {
    // 送信中に削除された申し込みやメンバーは、記録できなくてよい
    if ((e as { code?: unknown }).code !== NOT_FOUND) throw e;
  }
}
