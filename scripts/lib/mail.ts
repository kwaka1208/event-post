// メールの文面（site/templates/*.md）を読み込んで、プレースホルダーを差し込む。
// Frontmatter に subject、本文はプレーンテキスト。{{name}} のような書き方で値を差し込む。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { siteDir } from '../../app/src/lib/config';
import { eventTimes } from '../../app/src/lib/event';
import { formatSchemaError, type SiteConfig } from '../../app/src/lib/schema';
import { formatFullDate, formatTime } from '../../app/src/lib/time';
import { splitFrontmatter, type SiteEvent } from './load-site';

export type TemplateName = 'confirmation' | 'reminder';

export interface MailTemplate {
  file: string;
  subject: string;
  body: string;
}

export interface Mail {
  subject: string;
  text: string;
}

/** テンプレートで使える値 */
export type MailVars = Record<string, string>;

const templateSchema = z.object({ subject: z.string().min(1) });

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;

export function parseTemplate(file: string, source: string): MailTemplate {
  const { data, body } = splitFrontmatter(source, file);
  const result = templateSchema.safeParse(data);
  if (!result.success) throw new Error(formatSchemaError(file, result.error));
  return { file, subject: result.data.subject, body: body.replace(/^\s*\n/, '') };
}

export function loadTemplate(name: TemplateName, dir = resolve(siteDir(), 'templates')): MailTemplate {
  const file = `site/templates/${name}.md`;
  let source: string;
  try {
    source = readFileSync(resolve(dir, `${name}.md`), 'utf8');
  } catch (e) {
    throw new Error(`${file} を読み込めませんでした: ${(e as Error).message}`);
  }
  return parseTemplate(file, source);
}

/** 文面に値を差し込む。知らないプレースホルダーは書き間違いとしてエラーにする */
export function renderTemplate(template: MailTemplate, vars: MailVars): Mail {
  const fill = (s: string) =>
    s.replace(PLACEHOLDER, (_, key: string) => {
      if (!(key in vars)) {
        throw new Error(
          `${template.file} の {{${key}}} は使えません。使えるのは ${Object.keys(vars)
            .map((k) => `{{${k}}}`)
            .join(' ')} です`,
        );
      }
      return vars[key];
    });
  return {
    subject: fill(template.subject).replace(/\s*\n\s*/g, ' ').trim(),
    // 空のプレースホルダー（reminder_note など）で 3 行以上空いたら詰める
    text: fill(template.body).replace(/\n{3,}/g, '\n\n').trimEnd() + '\n',
  };
}

/** 申込 1 件分の差し込み値 */
export function mailVars(config: SiteConfig, event: SiteEvent, name: string, eventUrl: string): MailVars {
  const { startAt, endAt } = eventTimes(event.data);
  return {
    name,
    'event.title': event.data.title,
    'event.date': formatFullDate(startAt),
    'event.start': formatTime(startAt),
    'event.end': formatTime(endAt),
    'event.venue': event.data.venue,
    'event.address': event.data.address ?? '',
    'event.url': eventUrl,
    reminder_note: (event.data.reminder_note ?? '').trimEnd(),
    'group.name': config.group.name,
    'group.contact_email': config.group.contact_email,
  };
}
