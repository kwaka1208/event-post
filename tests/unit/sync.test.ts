import { describe, expect, it } from 'vitest';
import { parseEventFile } from '../../scripts/lib/load-site';
import { normalizeAdmins, toEventDoc } from '../../scripts/lib/sync';

const md = (frontmatter: string) => `---\n${frontmatter}\n---\n\n本文\n`;

const base = `title: 体験会
date: 2026-11-20
start: "13:00"
end: "16:00"
venue: 公民館`;

describe('イベントファイルの読み込み', () => {
  it('ファイル名を ID にして Frontmatter を検証する', () => {
    const e = parseEventFile('site/events/2026-11-20-hajimete.md', md(base));
    expect(e.id).toBe('2026-11-20-hajimete');
    expect(e.data).toMatchObject({ title: '体験会', date: '2026-11-20', capacity: null });
  });

  it('使えないファイル名は拒否する', () => {
    expect(() => parseEventFile('site/events/体験会.md', md(base))).toThrow('英数字とハイフン');
  });

  it('Frontmatter がなければ分かるメッセージで失敗する', () => {
    expect(() => parseEventFile('site/events/a.md', '本文だけ')).toThrow('Frontmatter');
  });

  it('検証の誤りにはファイル名を含める', () => {
    expect(() => parseEventFile('site/events/a.md', md('title: x'))).toThrow('site/events/a.md');
  });
});

describe('Firestore のドキュメントへの変換', () => {
  it('日時を JST として Timestamp にし、締切の既定は開始時刻', () => {
    const doc = toEventDoc(parseEventFile('a.md', md(base)));
    expect(doc.startAt.toDate().toISOString()).toBe('2026-11-20T04:00:00.000Z');
    expect(doc.endAt.toDate().toISOString()).toBe('2026-11-20T07:00:00.000Z');
    expect(doc.deadline.isEqual(doc.startAt)).toBe(true);
    expect(doc).toMatchObject({ capacity: null, fieldIds: [], published: true, archived: false });
    expect(doc).not.toHaveProperty('count');
  });

  it('締切・定員・追加項目を反映する', () => {
    const doc = toEventDoc(
      parseEventFile(
        'a.md',
        md(`${base}
capacity: 20
deadline: 2026-11-19T23:59
published: false
fields:
  - { id: grade, label: 学年, type: text }
  - { id: note, label: 連絡, type: textarea }`),
      ),
    );
    expect(doc.deadline.toDate().toISOString()).toBe('2026-11-19T14:59:00.000Z');
    expect(doc).toMatchObject({ capacity: 20, fieldIds: ['grade', 'note'], published: false });
  });
});

describe('管理者のメールアドレス', () => {
  it('小文字にそろえて重複を除く', () => {
    expect(normalizeAdmins(['Organizer@Example.org', 'organizer@example.org ', 'b@example.org'])).toEqual([
      'b@example.org',
      'organizer@example.org',
    ]);
  });
});
