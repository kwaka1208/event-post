import { describe, expect, it } from 'vitest';
import {
  adminMail,
  applicationsMail,
  confirmationMail,
  pageUrl,
  reminderMail,
  welcomeMail,
} from '../../scripts/lib/messages';

const siteUrl = 'https://example.github.io/event-post';

describe('pageUrl', () => {
  it('URL の末尾に / があってもなくても同じになる', () => {
    expect(pageUrl(siteUrl, '/events')).toBe('https://example.github.io/event-post/events');
    expect(pageUrl(`${siteUrl}/`, '/events')).toBe('https://example.github.io/event-post/events');
  });
});

describe('applicationsMail', () => {
  const mail = applicationsMail('テストの会', siteUrl, [
    { realName: '山田 花子', nickname: 'はなこ', reason: '子どもと参加したいです。' },
    { realName: '佐藤 次郎', nickname: 'じろう', reason: '1 行目\n2 行目' },
  ]);

  it('件名にグループ名と件数が入る', () => {
    expect(mail.subject).toBe('【テストの会】新しい参加申し込みが 2 件あります');
  });

  it('本文に申し込み一覧の URL と、申し込んだ人ごとの名前と理由が入る', () => {
    expect(mail.text).toContain('https://example.github.io/event-post/admin/applications');
    expect(mail.text).toContain('- 山田 花子（はなこ）\n  理由：子どもと参加したいです。');
    expect(mail.text).toContain('- 佐藤 次郎（じろう）\n  理由：1 行目\n  2 行目');
  });
});

describe('welcomeMail', () => {
  const mail = welcomeMail('テストの会', `${siteUrl}/`, 'はなこ');

  it('件名にグループ名が入る', () => {
    expect(mail.subject).toBe('【テストの会】参加が承認されました');
  });

  it('本文にニックネームとイベント一覧の URL が入る', () => {
    expect(mail.text.startsWith('はなこ さん\n')).toBe(true);
    expect(mail.text).toContain('https://example.github.io/event-post/events');
  });
});

describe('adminMail', () => {
  it('件名にグループ名を付け、本文の後ろに送り主とサイトの URL を添える', () => {
    const mail = adminMail('テストの会', siteUrl, '次回のお知らせ', '来週集まります。\n持ち物はありません。\n\n');
    expect(mail.subject).toBe('【テストの会】次回のお知らせ');
    expect(mail.text).toBe(
      ['来週集まります。', '持ち物はありません。', '', '---', 'このメールは テストの会 の管理者が送りました。', siteUrl, ''].join('\n'),
    );
  });
});

describe('受付メールとリマインド', () => {
  const event = {
    id: 'ev1',
    title: 'はじめてのプログラミング',
    startAt: new Date('2026-12-05T10:00:00+09:00'),
    endAt: new Date('2026-12-05T12:00:00+09:00'),
    venue: '中部公民館',
    address: '奈良市三条本町',
  };

  it('受付メールに、イベントの内容、詳細ページ、キャンセルの期限を載せる', () => {
    const mail = confirmationMail('テストの会', siteUrl, event, 'はなこ');
    expect(mail.subject).toBe('【テストの会】お申し込みを受け付けました：はじめてのプログラミング');
    expect(mail.text).toContain('はなこ さん');
    expect(mail.text).toContain('日時：2026年12月5日(土) 10:00〜12:00');
    expect(mail.text).toContain('会場：中部公民館');
    expect(mail.text).toContain('住所：奈良市三条本町');
    expect(mail.text).toContain(`${siteUrl}/events/ev1`);
    expect(mail.text).toContain('2026年12月5日(土) 10:00 まで受け付けます');
  });

  it('住所がなければ、住所の行を出さない', () => {
    expect(confirmationMail('テストの会', siteUrl, { ...event, address: '' }, 'はなこ').text).not.toContain('住所：');
  });

  it('リマインドの件名は「明日開催」', () => {
    const mail = reminderMail('テストの会', siteUrl, event, 'はなこ');
    expect(mail.subject).toBe('【テストの会】明日開催：はじめてのプログラミング');
    expect(mail.text).toContain('いよいよ明日です');
  });
});
