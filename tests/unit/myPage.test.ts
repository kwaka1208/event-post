import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import type { EventDoc } from '../../web/src/lib/events';
import { splitMyEvents } from '../../web/src/lib/myPage';
import type { MyRegistration } from '../../web/src/lib/registrations';

const now = new Date('2026-12-01T12:00');

function eventAt(id: string, start: string, overrides: Partial<EventDoc> = {}): EventDoc {
  const s = new Date(start);
  return {
    id,
    title: id,
    body: '',
    startAt: Timestamp.fromDate(s),
    endAt: Timestamp.fromMillis(s.getTime() + 2 * 60 * 60 * 1000),
    deadlineAt: Timestamp.fromDate(s),
    venue: '会場',
    address: '',
    capacity: null,
    published: true,
    registrationCount: 1,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function reg(eventId: string): MyRegistration {
  return { eventId, uid: 'alice', realName: '山田', nickname: 'はなこ', email: 'a@example.com', createdAt: null };
}

describe('マイページのイベントの分け方', () => {
  it('終了前はこれから（早い順）、終了後は参加した（新しい順）に分ける', () => {
    const events = new Map<string, EventDoc | null>([
      ['later', eventAt('later', '2026-12-20T10:00')],
      ['soon', eventAt('soon', '2026-12-05T10:00')],
      ['old', eventAt('old', '2026-10-01T10:00')],
      ['recent', eventAt('recent', '2026-11-20T10:00')],
      // 開催中（開始後、終了前）はこれから
      ['now', eventAt('now', '2026-12-01T11:00')],
    ]);
    const result = splitMyEvents([...events.keys()].map(reg), events, now);
    expect(result.upcoming.map((e) => e.event.id)).toEqual(['now', 'soon', 'later']);
    expect(result.past.map((e) => e.event.id)).toEqual(['recent', 'old']);
    expect(result.hiddenCount).toBe(0);
  });

  it('読めないイベントと下書きは、数だけを数える', () => {
    const events = new Map<string, EventDoc | null>([
      ['gone', null],
      ['draft', eventAt('draft', '2026-12-05T10:00', { published: false })],
      ['ok', eventAt('ok', '2026-12-05T10:00')],
    ]);
    const result = splitMyEvents([reg('gone'), reg('draft'), reg('ok'), reg('missing')], events, now);
    expect(result.upcoming.map((e) => e.event.id)).toEqual(['ok']);
    expect(result.hiddenCount).toBe(3);
  });

  it('申込がなければ、どれも空', () => {
    expect(splitMyEvents([], new Map(), now)).toEqual({ upcoming: [], past: [], hiddenCount: 0 });
  });
});
