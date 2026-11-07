import { describe, expect, it } from 'vitest';
import {
  formatDateTime,
  formatEventDate,
  isReminderDue,
  jstStartOfDay,
  reminderAt,
} from '../../scripts/lib/time';
import { parseReminderHour } from '../../scripts/lib/notify';

/** JST の日時を Date にする */
const jst = (s: string) => new Date(`${s}+09:00`);

describe('日本時間の日付', () => {
  it('JST の 0:00 を返す（UTC では前日でも）', () => {
    expect(jstStartOfDay(jst('2026-12-05T08:00:00'))).toEqual(jst('2026-12-05T00:00:00'));
    expect(jstStartOfDay(jst('2026-12-05T00:30:00'))).toEqual(jst('2026-12-05T00:00:00'));
  });

  it('月や年をまたいでずらせる', () => {
    expect(jstStartOfDay(jst('2027-01-01T10:00:00'), -1)).toEqual(jst('2026-12-31T00:00:00'));
    expect(jstStartOfDay(jst('2026-03-01T10:00:00'), -1)).toEqual(jst('2026-02-28T00:00:00'));
  });
});

describe('リマインドの時刻', () => {
  const start = jst('2026-12-05T10:00:00');

  it('開催前日の指定の時刻から送り始める', () => {
    expect(reminderAt(start, 18)).toEqual(jst('2026-12-04T18:00:00'));
    expect(isReminderDue(start, 18, jst('2026-12-04T17:59:00'))).toBe(false);
    expect(isReminderDue(start, 18, jst('2026-12-04T18:00:00'))).toBe(true);
    expect(isReminderDue(start, 18, jst('2026-12-04T23:59:00'))).toBe(true);
  });

  it('開催日に入ったら送らない', () => {
    expect(isReminderDue(start, 18, jst('2026-12-05T00:00:00'))).toBe(false);
    expect(isReminderDue(start, 18, jst('2026-12-05T09:00:00'))).toBe(false);
  });

  it('0 時を指定すると、前日の 0 時から送る', () => {
    expect(isReminderDue(start, 0, jst('2026-12-04T00:00:00'))).toBe(true);
  });
});

describe('日時の表示（日本時間）', () => {
  it('同じ日なら終了は時刻だけ、日をまたぐなら日付も出す', () => {
    expect(formatEventDate(jst('2026-12-05T10:00:00'), jst('2026-12-05T12:00:00'))).toBe('2026年12月5日(土) 10:00〜12:00');
    expect(formatEventDate(jst('2026-12-05T22:00:00'), jst('2026-12-06T01:00:00'))).toBe(
      '2026年12月5日(土) 22:00〜2026年12月6日(日) 01:00',
    );
    expect(formatDateTime(jst('2026-12-05T09:05:00'))).toBe('2026年12月5日(土) 09:05');
  });
});

describe('REMINDER_HOUR', () => {
  it('空なら 18 時、0〜23 の整数ならその時刻', () => {
    expect(parseReminderHour(undefined)).toBe(18);
    expect(parseReminderHour('')).toBe(18);
    expect(parseReminderHour('0')).toBe(0);
    expect(parseReminderHour('20')).toBe(20);
  });

  it('範囲の外や整数でない値はエラー', () => {
    for (const v of ['24', '-1', '18.5', 'abc']) expect(() => parseReminderHour(v)).toThrow();
  });
});
