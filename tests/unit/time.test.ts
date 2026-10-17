import { describe, expect, it } from 'vitest';
import {
  formatDateTimeNumeric,
  formatFullDate,
  formatTime,
  isPastRetention,
  isReminderDue,
  jstDateString,
  jstDateTime,
  jstParts,
  reminderAt,
  retentionDate,
} from '../../app/src/lib/time';

describe('JST の日時', () => {
  it('JST の日付と時刻を正しい瞬間に変換する', () => {
    expect(jstDateTime('2026-11-20', '13:00').toISOString()).toBe('2026-11-20T04:00:00.000Z');
  });

  it('UTC では前日でも JST の日付で分解する', () => {
    const d = new Date('2026-11-19T15:30:00Z'); // JST 11/20 0:30
    expect(jstParts(d)).toMatchObject({ year: 2026, month: 11, day: 20, weekday: '金', hour: 0, minute: 30 });
    expect(jstDateString(d)).toBe('2026-11-20');
  });

  it('日本語の表記に整形する', () => {
    const d = jstDateTime('2026-11-21', '09:05');
    expect(formatFullDate(d)).toBe('2026年11月21日（土）');
    expect(formatTime(d)).toBe('09:05');
  });
});

describe('リマインドと削除の日時', () => {
  it('リマインドは開催前日の指定時刻（JST）', () => {
    expect(reminderAt(jstDateTime('2026-11-21', '13:00'), 18).toISOString()).toBe(
      jstDateTime('2026-11-20', '18:00').toISOString(),
    );
  });

  it('月初の開催なら前月末日になる', () => {
    expect(reminderAt(jstDateTime('2026-12-01', '00:30'), 18).toISOString()).toBe(
      jstDateTime('2026-11-30', '18:00').toISOString(),
    );
  });

  it('削除日は開催日の N 日後の 0:00（年をまたぐ場合も）', () => {
    expect(retentionDate(jstDateTime('2026-11-21', '13:00'), 30).toISOString()).toBe(
      jstDateTime('2026-12-21', '00:00').toISOString(),
    );
    expect(retentionDate(jstDateTime('2026-12-20', '23:30'), 30).toISOString()).toBe(
      jstDateTime('2027-01-19', '00:00').toISOString(),
    );
  });

  it('リマインドは前日の指定時刻から、開催日の 0:00（JST）の手前まで', () => {
    const start = jstDateTime('2026-11-21', '13:00');
    expect(isReminderDue(start, 18, jstDateTime('2026-11-20', '17:59'))).toBe(false);
    expect(isReminderDue(start, 18, jstDateTime('2026-11-20', '18:00'))).toBe(true);
    expect(isReminderDue(start, 18, jstDateTime('2026-11-20', '23:59'))).toBe(true);
    // 開催当日（当日の申込や、前日に送り損ねた分）は送らない
    expect(isReminderDue(start, 18, jstDateTime('2026-11-21', '00:00'))).toBe(false);
    expect(isReminderDue(start, 18, jstDateTime('2026-11-21', '09:00'))).toBe(false);
    // 2 日前は早すぎる
    expect(isReminderDue(start, 18, jstDateTime('2026-11-19', '18:00'))).toBe(false);
  });

  it('リマインドの判定は UTC の日付の境目に左右されない', () => {
    // JST 11/20 18:00 = UTC 11/20 09:00、JST 11/21 08:00 = UTC 11/20 23:00
    const start = jstDateTime('2026-11-21', '10:00');
    expect(isReminderDue(start, 18, new Date('2026-11-20T09:00:00Z'))).toBe(true);
    expect(isReminderDue(start, 18, new Date('2026-11-20T23:00:00Z'))).toBe(false);
  });

  it('月初の開催なら前月末日の指定時刻から', () => {
    const start = jstDateTime('2026-12-01', '10:00');
    expect(isReminderDue(start, 0, jstDateTime('2026-11-30', '00:00'))).toBe(true);
    expect(isReminderDue(start, 0, jstDateTime('2026-11-29', '23:59'))).toBe(false);
  });

  it('削除日を過ぎたかの判定', () => {
    const start = jstDateTime('2026-11-21', '13:00');
    expect(isPastRetention(start, 30, jstDateTime('2026-12-20', '23:59'))).toBe(false);
    expect(isPastRetention(start, 30, jstDateTime('2026-12-21', '00:00'))).toBe(true);
  });

  it('数字だけの日時表記', () => {
    expect(formatDateTimeNumeric(jstDateTime('2026-01-05', '09:07'))).toBe('2026/01/05 09:07');
  });
});
