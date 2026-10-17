import { describe, expect, it } from 'vitest';
import { formatFullDate, formatTime, jstDateString, jstDateTime, jstParts } from '../../app/src/lib/time';

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
