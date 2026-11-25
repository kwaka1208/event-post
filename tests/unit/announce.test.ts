import { describe, expect, it } from 'vitest';
import { announcementMail, announcementRecipients, eventPageUrl } from '../../web/src/lib/announce';
import type { EventInput } from '../../web/src/lib/events';

// 日時はテストを動かす環境の時刻で作る（表示も同じ時刻で行うため）
const event: EventInput = {
  title: 'はじめてのセキュリティ',
  body: '本文はメールに入れない',
  startAt: new Date(2026, 11, 5, 10, 0),
  endAt: new Date(2026, 11, 5, 12, 0),
  deadlineAt: new Date(2026, 11, 4, 23, 59),
  venue: '中部公民館',
  address: '奈良県奈良市○○町1-2-3',
  capacity: 20,
  published: true,
};
const url = 'https://example.github.io/asugaku/events/abc';

describe('announcementMail', () => {
  const mail = announcementMail(event, url);

  it('件名にイベントの名前が入る', () => {
    expect(mail.subject).toBe('イベントのお知らせ：はじめてのセキュリティ');
  });

  it('本文に日時・会場・住所・定員・締切・ページの URL が入り、イベントの本文は入らない', () => {
    expect(mail.body).toContain('■ はじめてのセキュリティ');
    expect(mail.body).toContain('日時：2026年12月5日(土) 10:00〜12:00');
    expect(mail.body).toContain('会場：中部公民館');
    expect(mail.body).toContain('住所：奈良県奈良市○○町1-2-3');
    expect(mail.body).toContain('定員：20 人');
    expect(mail.body).toContain('申込の締切：2026年12月4日(金) 23:59');
    expect(mail.body.trimEnd().endsWith(url)).toBe(true);
    expect(mail.body).not.toContain('本文はメールに入れない');
  });

  it('住所と定員がなければその行を出さず、締切がなければ開始日時を締切にする', () => {
    const body = announcementMail({ ...event, address: '', capacity: null, deadlineAt: null }, url).body;
    expect(body).not.toContain('住所：');
    expect(body).not.toContain('定員：');
    expect(body).toContain('申込の締切：2026年12月5日(土) 10:00');
  });

  it('件名は上限の長さに収める', () => {
    expect(announcementMail({ ...event, title: 'あ'.repeat(300) }, url).subject.length).toBe(200);
  });
});

describe('eventPageUrl', () => {
  it('サイトの URL とサブパスから、イベントのページの URL を作る', () => {
    expect(eventPageUrl('https://example.github.io', '/asugaku/', 'abc')).toBe(url);
    expect(eventPageUrl('https://events.example.org', '/', 'abc')).toBe('https://events.example.org/events/abc');
  });
});

describe('announcementRecipients', () => {
  it('宛先は上限（500 人）まで', () => {
    const many = Array.from({ length: 501 }, (_, i) => ({ uid: `u${i}`, name: `n${i}`, email: `u${i}@example.com` }));
    expect(announcementRecipients(many)).toHaveLength(500);
  });
});
