// イベントのお知らせ。イベントを公開して保存するときに、管理者が選べば、メンバー全員への管理者のメール（mails）を作る。
// 送るのは毎時の Actions で、ほかの管理者のメールと同じく、送信前ならメールの画面から取りやめられる。
import type { EventInput } from './events';
import { formatDateTime, formatEventDate } from './format';
import { LIMITS } from './limits';
import type { MailRecipient } from './mails';

/** お知らせの件名と本文。件名の【グループ名】と、本文の後ろの送り主の行は、送るときに付く（scripts/lib/messages.ts） */
export function announcementMail(event: EventInput, eventUrl: string): { subject: string; body: string } {
  const lines = [
    '新しいイベントのお知らせです。',
    '',
    `■ ${event.title}`,
    `日時：${formatEventDate(event.startAt, event.endAt)}`,
    `会場：${event.venue}`,
    ...(event.address ? [`住所：${event.address}`] : []),
    ...(event.capacity != null ? [`定員：${event.capacity} 人`] : []),
    `申込の締切：${formatDateTime(event.deadlineAt ?? event.startAt)}`,
    '',
    '詳しい内容と申し込みは、次のページからどうぞ。',
    eventUrl,
  ];
  return { subject: `イベントのお知らせ：${event.title}`.slice(0, LIMITS.mailSubject), body: lines.join('\n') };
}

/** イベントのページの URL。今開いているサイトの URL から作る（GitHub Pages のサブパスも含む） */
export function eventPageUrl(origin: string, baseUrl: string, eventId: string): string {
  return `${origin}${baseUrl.replace(/\/*$/, '/')}events/${eventId}`;
}

/** お知らせの宛先。メンバー全員（1 通のメールの宛先の上限まで） */
export function announcementRecipients(recipients: MailRecipient[]): MailRecipient[] {
  return recipients.slice(0, LIMITS.mailRecipients);
}
