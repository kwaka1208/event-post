// site/config.yml を読み込んで検証する。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { configSchema, formatSchemaError, type SiteConfig } from './schema';

/** グループが編集する site/ ディレクトリ。astro.config.ts と scripts/ が設定する */
export function siteDir(): string {
  return process.env.EVENTPOST_SITE_DIR ?? resolve(process.cwd(), 'site');
}

let cached: SiteConfig | undefined;

export function loadConfig(): SiteConfig {
  if (cached) return cached;
  const path = resolve(siteDir(), 'config.yml');
  let raw: unknown;
  try {
    raw = parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`site/config.yml を読み込めませんでした: ${(e as Error).message}`);
  }
  const result = configSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(formatSchemaError('site/config.yml', result.error));
  }
  cached = result.data;
  return cached;
}
