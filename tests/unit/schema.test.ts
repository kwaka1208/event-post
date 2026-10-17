import { describe, expect, it } from 'vitest';
import { configSchema, contrastWithWhite, eventSchema } from '../../app/src/lib/schema';
import { assertEventId, eventTimes } from '../../app/src/lib/event';

const baseEvent = {
  title: '体験会',
  date: '2026-11-20',
  start: '13:00',
  end: '16:00',
  venue: '公民館',
};

const baseConfig = {
  group: { name: 'CoderDojo 奈良', contact_email: 'info@example.org' },
  admins: ['organizer@example.org'],
  firebase: { apiKey: 'k', authDomain: 'x.firebaseapp.com', projectId: 'x', appId: 'a' },
};

describe('イベントの Frontmatter', () => {
  it('最小限の項目で既定値が入る', () => {
    const e = eventSchema.parse(baseEvent);
    expect(e).toMatchObject({ capacity: null, published: true, fields: [] });
  });

  it('YAML が Date にした日付・日時を JST の値として読む', () => {
    const e = eventSchema.parse({
      ...baseEvent,
      date: new Date('2026-11-20T00:00:00Z'),
      deadline: new Date('2026-11-19T23:59:00Z'),
    });
    expect(e.date).toBe('2026-11-20');
    expect(e.deadline).toBe('2026-11-19T23:59');
  });

  it('締切を省略すると開始時刻が締切になる', () => {
    const t = eventTimes(eventSchema.parse(baseEvent));
    expect(t.deadlineAt).toEqual(t.startAt);
    expect(t.startAt.toISOString()).toBe('2026-11-20T04:00:00.000Z');
  });

  it.each([
    ['日付の形式', { date: '2026/11/20' }],
    ['時刻の形式', { start: '1:00' }],
    ['終了が開始より前', { end: '12:00' }],
    ['定員が 0', { capacity: 0 }],
    ['select に options がない', { fields: [{ id: 'grade', label: '学年', type: 'select' }] }],
    ['項目 id に記号', { fields: [{ id: 'a.b', label: 'x', type: 'text' }] }],
    [
      '項目 id の重複',
      {
        fields: [
          { id: 'a', label: 'x', type: 'text' },
          { id: 'a', label: 'y', type: 'text' },
        ],
      },
    ],
  ])('%s はエラーになる', (_, patch) => {
    expect(eventSchema.safeParse({ ...baseEvent, ...patch }).success).toBe(false);
  });

  it('イベント ID は英数字とハイフンのみ', () => {
    expect(() => assertEventId('2026-11-20-hajimete')).not.toThrow();
    expect(() => assertEventId('2026_11_20')).toThrow();
    expect(() => assertEventId('体験会')).toThrow();
  });
});

describe('config.yml', () => {
  it('省略した項目に既定値が入る', () => {
    const c = configSchema.parse(baseConfig);
    expect(c.theme.accent).toBe('#0F6E8C');
    expect(c.mail.reminder_hour).toBe(18);
    expect(c.retention_days).toBe(30);
  });

  it('既定のアクセントカラーは白文字とのコントラスト 4.5 以上', () => {
    expect(contrastWithWhite('#0F6E8C')).toBeGreaterThanOrEqual(4.5);
  });

  it('明るすぎるアクセントカラーはエラー', () => {
    const r = configSchema.safeParse({ ...baseConfig, theme: { accent: '#FFCC00' } });
    expect(r.success).toBe(false);
  });

  it('管理者が空ならエラー', () => {
    expect(configSchema.safeParse({ ...baseConfig, admins: [] }).success).toBe(false);
  });
});
