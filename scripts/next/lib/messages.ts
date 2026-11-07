// 通知メールの文面。Firestore には触らず、渡された値から件名と本文を組み立てる。
import { formatDateTime, formatEventDate } from './time';
export interface Mail {
  subject: string;
  text: string;
}

/** 申し込みの通知に載せる内容 */
export interface ApplicantSummary {
  realName: string;
  nickname: string;
  reason: string;
}

/** サイトの URL（末尾の / はあってもなくてもよい）にパスをつなぐ */
export function pageUrl(siteUrl: string, path: string): string {
  return `${siteUrl.replace(/\/+$/, '')}${path}`;
}

/** 管理者宛て：その回に見つかった新しい申し込みをまとめて知らせる */
export function applicationsMail(groupName: string, siteUrl: string, applicants: ApplicantSummary[]): Mail {
  const items = applicants.map((a) => `- ${a.realName}（${a.nickname}）\n  理由：${indent(a.reason)}`);
  return {
    subject: `【${groupName}】新しい参加申し込みが ${applicants.length} 件あります`,
    text: [
      `${groupName} に新しい参加申し込みがありました。`,
      '承認するか削除するかを、次のページで選んでください。',
      pageUrl(siteUrl, '/admin/applications'),
      '',
      ...items,
      '',
    ].join('\n'),
  };
}

/** 本人宛て：参加が承認されたことを知らせる */
export function welcomeMail(groupName: string, siteUrl: string, nickname: string): Mail {
  return {
    subject: `【${groupName}】参加が承認されました`,
    text: [
      `${nickname} さん`,
      '',
      `${groupName} への参加が承認されました。`,
      '次のページからイベントを見て、申し込めます。',
      pageUrl(siteUrl, '/events'),
      '',
    ].join('\n'),
  };
}

/** 管理者が画面で書いたメール。件名にグループ名を付け、本文の後ろに送り主を添える */
export function adminMail(groupName: string, siteUrl: string, subject: string, body: string): Mail {
  return {
    subject: `【${groupName}】${subject}`,
    text: [body.trimEnd(), '', '---', `このメールは ${groupName} の管理者が送りました。`, siteUrl, ''].join('\n'),
  };
}

/** 受付メールとリマインドに載せるイベントの内容 */
export interface EventSummary {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date;
  venue: string;
  address: string;
}

function eventLines(siteUrl: string, event: EventSummary): string[] {
  return [
    `■ ${event.title}`,
    `日時：${formatEventDate(event.startAt, event.endAt)}`,
    `会場：${event.venue}`,
    ...(event.address ? [`住所：${event.address}`] : []),
    '',
    'イベントの詳細は、次のページをご覧ください。',
    pageUrl(siteUrl, `/events/${event.id}`),
  ];
}

/** 本人宛て：イベントへの申込を受け付けたことを知らせる */
export function confirmationMail(groupName: string, siteUrl: string, event: EventSummary, nickname: string): Mail {
  return {
    subject: `【${groupName}】お申し込みを受け付けました：${event.title}`,
    text: [
      `${nickname} さん`,
      '',
      `${groupName} です。次のイベントへのお申し込みを受け付けました。`,
      '',
      ...eventLines(siteUrl, event),
      '',
      `都合が悪くなったときは、上のページからキャンセルしてください（${formatDateTime(event.startAt)} まで受け付けます）。`,
      '開催の前日に、あらためてご案内のメールをお送りします。',
      '',
    ].join('\n'),
  };
}

/** 本人宛て：開催の前日に知らせる */
export function reminderMail(groupName: string, siteUrl: string, event: EventSummary, nickname: string): Mail {
  return {
    subject: `【${groupName}】明日開催：${event.title}`,
    text: [
      `${nickname} さん`,
      '',
      `${groupName} です。お申し込みいただいたイベントは、いよいよ明日です。`,
      '',
      ...eventLines(siteUrl, event),
      '',
      '参加できなくなったときは、上のページからキャンセルしてください。',
      '',
    ].join('\n'),
  };
}

/** 理由が複数行のとき、2 行目以降を箇条書きの中にそろえる */
function indent(text: string): string {
  return text.trim().replace(/\r?\n/g, '\n  ');
}
