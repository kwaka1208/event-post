// 申込者へのメール送信と、申込データの後始末。notify.yml から毎時実行する。
// 送ったかどうかは registrations の confirmationSentAt / remindedAt だけで判定する（送信成功後に記録するので、
// 失敗した分は次の回で再試行される）。
import { FieldValue, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';
import type { SiteConfig } from '../../app/src/lib/schema';
import { isPastRetention, isReminderDue } from '../../app/src/lib/time';
import type { SiteEvent } from './load-site';
import { mailVars, renderTemplate, type Mail, type MailTemplate, type TemplateName } from './mail';

export interface Recipient {
  name: string;
  email: string;
}

export type SendMail = (to: Recipient, mail: Mail) => Promise<void>;

export interface NotifyOptions {
  db: Firestore;
  config: SiteConfig;
  /** Markdown のイベント（メールの文面に使う） */
  events: SiteEvent[];
  templates: Record<TemplateName, MailTemplate>;
  eventUrl: (eventId: string) => string;
  send: SendMail;
  now: Date;
  /** true なら送信も書き込みもせず、予定だけを返す */
  dryRun: boolean;
}

export interface Delivery {
  eventId: string;
  uid: string;
  kind: TemplateName;
}

export interface NotifyResult {
  /** 送ったメール（dryRun では送る予定のメール） */
  sent: Delivery[];
  failed: (Delivery & { error: string })[];
  /** 失敗が続いたため、途中で送信をやめた */
  stopped: boolean;
  /** count を補正したイベント（dryRun では補正が必要なイベント） */
  corrected: { eventId: string; from: number; to: number }[];
  /** 申込データを削除したイベント（dryRun では削除する予定のイベント） */
  purged: { eventId: string; count: number }[];
  warnings: string[];
}

/** 連続でこの回数失敗したら、SMTP の設定や上限の問題とみなして送信をやめる */
export const MAX_CONSECUTIVE_FAILURES = 3;

// 1 バッチの書き込みは 500 件まで
const BATCH_LIMIT = 400;

const RECORD_FIELD: Record<TemplateName, string> = {
  confirmation: 'confirmationSentAt',
  reminder: 'remindedAt',
};

// gRPC の NOT_FOUND
const NOT_FOUND = 5;

export async function runNotify(opts: NotifyOptions): Promise<NotifyResult> {
  const { db, config, now, dryRun } = opts;
  const result: NotifyResult = { sent: [], failed: [], stopped: false, corrected: [], purged: [], warnings: [] };
  const markdown = new Map(opts.events.map((e) => [e.id, e]));
  let consecutiveFailures = 0;

  const deliver = async (event: SiteEvent, reg: DocumentSnapshot, kind: TemplateName) => {
    const delivery: Delivery = { eventId: event.id, uid: reg.id, kind };
    if (dryRun) {
      result.sent.push(delivery);
      return;
    }
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      result.stopped = true;
      return;
    }
    const to: Recipient = { name: reg.get('name'), email: reg.get('email') };
    const mail = renderTemplate(opts.templates[kind], mailVars(config, event, to.name, opts.eventUrl(event.id)));
    try {
      await opts.send(to, mail);
    } catch (e) {
      consecutiveFailures++;
      result.failed.push({ ...delivery, error: (e as Error).message });
      return;
    }
    consecutiveFailures = 0;
    result.sent.push(delivery);
    try {
      await reg.ref.update({ [RECORD_FIELD[kind]]: FieldValue.serverTimestamp() });
    } catch (e) {
      // 送信中にキャンセルされた申込は、記録できなくてよい
      if ((e as { code?: unknown }).code !== NOT_FOUND) throw e;
    }
  };

  const eventDocs = await db.collection('events').orderBy('__name__').get();
  for (const eventDoc of eventDocs.docs) {
    const eventId = eventDoc.id;
    const startAt: Date = eventDoc.get('startAt').toDate();
    const regsRef = eventDoc.ref.collection('registrations');

    // 削除：開催日から retention_days を過ぎたら、アーカイブ済みのイベントも含めて消す。count は実績として残す
    if (isPastRetention(startAt, config.retention_days, now)) {
      const regs = await regsRef.get();
      if (regs.empty) continue;
      if (!dryRun) {
        for (let i = 0; i < regs.docs.length; i += BATCH_LIMIT) {
          const batch = db.batch();
          regs.docs.slice(i, i + BATCH_LIMIT).forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
      result.purged.push({ eventId, count: regs.size });
      continue;
    }

    // 開始後は申込もキャンセルもできず、送るメールもない
    if (now >= startAt) continue;

    // 件数補正：ルールが正しくてもずれた場合に備えて、registrations の実数に合わせる
    const fix = await db.runTransaction(async (t) => {
      const [snap, agg] = await Promise.all([t.get(eventDoc.ref), t.get(regsRef.count())]);
      const from = snap.get('count');
      const to = agg.data().count;
      if (from === to) return undefined;
      if (!dryRun) t.update(eventDoc.ref, { count: to });
      return { eventId, from, to };
    });
    if (fix) result.corrected.push(fix);

    // メール：Markdown から消えた（アーカイブされた）イベントには送らない
    if (eventDoc.get('archived') === true) continue;
    const event = markdown.get(eventId);
    if (!event) {
      result.warnings.push(`${eventId}: Firestore にありますが site/events/ にないため、メールを送りませんでした`);
      continue;
    }

    const regs = await regsRef.orderBy('createdAt').get();
    const sendConfirmation = config.mail.confirmation;
    const sendReminder = isReminderDue(startAt, config.mail.reminder_hour, now);
    for (const reg of regs.docs) {
      if (sendConfirmation && reg.get('confirmationSentAt') == null) await deliver(event, reg, 'confirmation');
      if (sendReminder && reg.get('remindedAt') == null) await deliver(event, reg, 'reminder');
    }
  }
  return result;
}
