// 日本時間（JST、UTC+9。夏時間はない）での日付の計算と表示。メールの文面とリマインドの時刻に使う
const JST_OFFSET = 9 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/** JST での年月日 */
function jstDate(d: Date): { year: number; month: number; day: number } {
  const t = new Date(d.getTime() + JST_OFFSET);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

/** d の JST での日付から days 日ずらした日の 0:00（JST） */
export function jstStartOfDay(d: Date, days = 0): Date {
  const { year, month, day } = jstDate(d);
  // 月末・年末の繰り上がりは Date.UTC に任せる
  return new Date(Date.UTC(year, month - 1, day + days) - JST_OFFSET);
}

/** リマインドを送り始める時刻：開催前日の hour 時（JST） */
export function reminderAt(startAt: Date, hour: number): Date {
  return new Date(jstStartOfDay(startAt, -1).getTime() + hour * HOUR);
}

/**
 * 今リマインドを送ってよいか：開催前日の hour 時（JST）以降で、まだ開催日（JST）になっていない。
 * 開催当日に入ったら送らない（当日の申込や、前日に送りそびれた分も含む）
 */
export function isReminderDue(startAt: Date, hour: number, now: Date): boolean {
  return now >= reminderAt(startAt, hour) && now < jstStartOfDay(startAt);
}

const dateFormat = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
});
const timeFormat = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });

/** 例：2026年12月5日(土) 10:00〜12:00。日をまたぐときは終了の日付も出す（web/src/lib/format.ts と同じ形） */
export function formatEventDate(start: Date, end: Date): string {
  const sameDay = jstStartOfDay(start).getTime() === jstStartOfDay(end).getTime();
  const head = `${dateFormat.format(start)} ${timeFormat.format(start)}`;
  return sameDay ? `${head}〜${timeFormat.format(end)}` : `${head}〜${dateFormat.format(end)} ${timeFormat.format(end)}`;
}

/** 例：2026年12月5日(土) 10:00 */
export function formatDateTime(d: Date): string {
  return `${dateFormat.format(d)} ${timeFormat.format(d)}`;
}
