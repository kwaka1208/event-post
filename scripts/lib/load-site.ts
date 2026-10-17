// site/events/*.md を読み込んで検証する（Actions のスクリプト用）。
// Astro のビルドと同じスキーマ（app/src/lib/schema.ts）で検証する。
import { readdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parse } from 'yaml';
import { siteDir } from '../../app/src/lib/config';
import { assertEventId } from '../../app/src/lib/event';
import { eventSchema, formatSchemaError, type EventData } from '../../app/src/lib/schema';

export interface SiteEvent {
  id: string;
  data: EventData;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** Markdown を Frontmatter（YAML として読んだもの）と本文に分ける */
export function splitFrontmatter(source: string, file: string): { data: unknown; body: string } {
  const m = FRONTMATTER.exec(source);
  if (!m) throw new Error(`${file} の先頭に Frontmatter（--- で囲んだ部分）がありません`);
  try {
    return { data: parse(m[1]) ?? {}, body: source.slice(m[0].length) };
  } catch (e) {
    throw new Error(`${file} の Frontmatter を読み込めませんでした: ${(e as Error).message}`);
  }
}

/** Markdown の Frontmatter 部分を取り出して YAML として読む */
export function parseFrontmatter(source: string, file: string): unknown {
  return splitFrontmatter(source, file).data;
}

/** 1 ファイル分を検証する */
export function parseEventFile(file: string, source: string): SiteEvent {
  const id = basename(file, '.md');
  assertEventId(id);
  const result = eventSchema.safeParse(parseFrontmatter(source, file));
  if (!result.success) throw new Error(formatSchemaError(file, result.error));
  return { id, data: result.data };
}

/** すべてのイベントを読む。誤りはまとめて 1 つのエラーにする */
export function loadEvents(dir = resolve(siteDir(), 'events')): SiteEvent[] {
  const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  const events: SiteEvent[] = [];
  const errors: string[] = [];
  for (const f of files) {
    const label = `site/events/${f}`;
    try {
      events.push(parseEventFile(label, readFileSync(resolve(dir, f), 'utf8')));
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  if (errors.length > 0) throw new Error(errors.join('\n\n'));
  return events;
}
