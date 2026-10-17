// 日時はすべて JST（Asia/Tokyo）として扱う。
// サーバー（Actions）でもブラウザでも同じ結果になるよう、実行環境のタイムゾーンに依存しない書き方にする。

const JST_OFFSET = '+09:00';
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** "2026-11-20" と "13:00" を JST の時刻として Date にする */
export function jstDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${JST_OFFSET}`);
}

export interface JstParts {
  year: number;
  month: number;
  day: number;
  weekday: (typeof WEEKDAYS)[number];
  hour: number;
  minute: number;
}

/** Date を JST の年月日・曜日・時分に分解する */
export function jstParts(d: Date): JstParts {
  // JST は夏時間がないので、9 時間ずらして UTC として読めばよい
  const shifted = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: WEEKDAYS[shifted.getUTCDay()],
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** JST の日付を "2026-11-20" 形式で返す */
export function jstDateString(d: Date): string {
  const p = jstParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** 11月21日（土） */
export function formatMonthDay(d: Date): string {
  const p = jstParts(d);
  return `${p.month}月${p.day}日（${p.weekday}）`;
}

/** 2026年11月21日（土） */
export function formatFullDate(d: Date): string {
  return `${jstParts(d).year}年${formatMonthDay(d)}`;
}

/** 13:00 */
export function formatTime(d: Date): string {
  const p = jstParts(d);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
