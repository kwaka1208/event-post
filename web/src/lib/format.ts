// 日時の表示（日本語）
const dateFormat = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
const timeFormat = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' });

/** 例：2026年12月5日(土) 10:00〜12:00。日をまたぐときは終了の日付も出す */
export function formatEventDate(start: Date, end: Date): string {
  const sameDay = start.toDateString() === end.toDateString();
  const head = `${dateFormat.format(start)} ${timeFormat.format(start)}`;
  return sameDay ? `${head}〜${timeFormat.format(end)}` : `${head}〜${dateFormat.format(end)} ${timeFormat.format(end)}`;
}

/** 例：2026年12月4日(金) 23:59 */
export function formatDateTime(date: Date): string {
  return `${dateFormat.format(date)} ${timeFormat.format(date)}`;
}
