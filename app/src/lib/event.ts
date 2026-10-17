// イベントの日時など、Frontmatter から導出する値。scripts/ からも使う。
import { EVENT_ID_PATTERN, type EventData } from './schema';
import { jstDateTime } from './time';

export interface EventTimes {
  startAt: Date;
  endAt: Date;
  /** 申込締切。未指定なら開始時刻 */
  deadlineAt: Date;
}

export function eventTimes(data: EventData): EventTimes {
  const startAt = jstDateTime(data.date, data.start);
  const endAt = jstDateTime(data.date, data.end);
  const deadlineAt = data.deadline
    ? jstDateTime(data.deadline.slice(0, 10), data.deadline.slice(11, 16))
    : startAt;
  return { startAt, endAt, deadlineAt };
}

/** ファイル名から作ったイベント ID を検証する */
export function assertEventId(id: string): void {
  if (!EVENT_ID_PATTERN.test(id)) {
    throw new Error(
      `イベントのファイル名「${id}.md」は使えません。ファイル名は英数字とハイフンだけにしてください（例: 2026-11-20-hajimete.md）`,
    );
  }
}
