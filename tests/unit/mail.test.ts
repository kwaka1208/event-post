import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { configSchema, eventSchema } from '../../app/src/lib/schema';
import { loadTemplate, mailVars, parseTemplate, renderTemplate } from '../../scripts/lib/mail';

const config = configSchema.parse({
  group: { name: 'CoderDojo テスト', contact_email: 'info@example.org' },
  admins: ['a@example.org'],
  firebase: { apiKey: 'k', authDomain: 'd', projectId: 'p', appId: 'a' },
});

const event = {
  id: '2026-11-21-test',
  data: eventSchema.parse({
    title: 'テストの会',
    date: '2026-11-21',
    start: '13:00',
    end: '16:00',
    venue: '公民館',
    address: '奈良市1-2-3',
    reminder_note: 'ノートパソコンをお持ちください。\n',
  }),
};

const vars = mailVars(config, event, '山田 花子', 'https://example.github.io/repo/events/2026-11-21-test');

describe('メールの差し込み', () => {
  it('件名と本文に値を差し込む', () => {
    const t = parseTemplate(
      'site/templates/x.md',
      '---\nsubject: 【{{group.name}}】{{ event.title }}\n---\n{{name}} さん\n{{event.date}} {{event.start}}〜{{event.end}}\n{{event.url}}\n',
    );
    expect(renderTemplate(t, vars)).toEqual({
      subject: '【CoderDojo テスト】テストの会',
      text:
        '山田 花子 さん\n2026年11月21日（土） 13:00〜16:00\nhttps://example.github.io/repo/events/2026-11-21-test\n',
    });
  });

  it('知らないプレースホルダーはエラーにする', () => {
    const t = parseTemplate('site/templates/x.md', '---\nsubject: s\n---\n{{event.titel}}\n');
    expect(() => renderTemplate(t, vars)).toThrow(/x\.md の \{\{event\.titel\}\} は使えません/);
  });

  it('空の値で空行が続いたら 1 行に詰める', () => {
    const t = parseTemplate('site/templates/x.md', '---\nsubject: s\n---\nA\n\n{{event.address}}\n\nB\n');
    const v = { ...vars, 'event.address': '' };
    expect(renderTemplate(t, v).text).toBe('A\n\nB\n');
  });

  it('subject がないテンプレートはエラーにする', () => {
    expect(() => parseTemplate('site/templates/x.md', '---\ntitle: s\n---\n本文\n')).toThrow(/x\.md に誤りがあります/);
  });

  it('同梱のテンプレートがすべて差し込める', () => {
    const dir = resolve(import.meta.dirname, '../../site/templates');
    for (const name of ['confirmation', 'reminder'] as const) {
      const mail = renderTemplate(loadTemplate(name, dir), vars);
      expect(mail.subject).not.toContain('{{');
      expect(mail.text).not.toContain('{{');
      expect(mail.text).toContain(vars['event.url']);
    }
    const reminder = renderTemplate(loadTemplate('reminder', dir), vars);
    expect(reminder.text).toContain('ノートパソコンをお持ちください。\n');
    const confirmation = renderTemplate(loadTemplate('confirmation', dir), vars);
    expect(confirmation.text).toContain('キャンセル');
  });
});
