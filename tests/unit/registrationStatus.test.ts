import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import type { EventDoc } from '../../web/src/lib/events';
import { registrationStatus } from '../../web/src/lib/registrations';

const at = (s: string) => new Date(s);
const event: EventDoc = {
  id: 'ev',
  title: 'タイトル',
  body: '',
  startAt: Timestamp.fromDate(at('2026-12-05T10:00')),
  endAt: Timestamp.fromDate(at('2026-12-05T12:00')),
  deadlineAt: Timestamp.fromDate(at('2026-12-04T23:59')),
  venue: '会場',
  address: '',
  capacity: 2,
  published: true,
  registrationCount: 0,
  createdAt: null,
  updatedAt: null,
};

describe('申込の状態', () => {
  it('締切前で定員に空きがあれば、申し込める', () => {
    expect(registrationStatus(event, false, at('2026-12-01T00:00'))).toBe('open');
    expect(registrationStatus({ ...event, capacity: null, registrationCount: 99 }, false, at('2026-12-01T00:00'))).toBe('open');
  });

  it('定員に達していれば満員', () => {
    expect(registrationStatus({ ...event, registrationCount: 2 }, false, at('2026-12-01T00:00'))).toBe('full');
  });

  it('締切を過ぎれば締切、終了日時を過ぎれば終了', () => {
    expect(registrationStatus(event, false, at('2026-12-04T23:59'))).toBe('closed');
    expect(registrationStatus(event, false, at('2026-12-05T11:00'))).toBe('closed');
    expect(registrationStatus(event, false, at('2026-12-05T12:00'))).toBe('ended');
  });

  it('申し込み済みなら、開始日時まではキャンセルできる状態', () => {
    expect(registrationStatus(event, true, at('2026-12-05T09:59'))).toBe('registered');
    expect(registrationStatus(event, true, at('2026-12-05T10:00'))).toBe('registered-started');
  });

  it('下書きは申し込めない', () => {
    expect(registrationStatus({ ...event, published: false }, false, at('2026-12-01T00:00'))).toBe('draft');
  });
});
