import { describe, expect, it } from 'vitest';
import {
  formatDateTimeNumeric,
  formatFullDate,
  formatTime,
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

  it('数字だけの日時表記', () => {
    expect(formatDateTimeNumeric(jstDateTime('2026-01-05', '09:07'))).toBe('2026/01/05 09:07');
  });
});
