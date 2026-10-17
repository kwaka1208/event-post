// 公開サイトの URL。astro.config.ts と、メールにリンクを書く scripts/notify.ts が使う。
import type { SiteConfig } from './schema';

export interface SiteLocation {
  /** オリジン（https://example.github.io など）。分からなければ undefined */
  site: string | undefined;
  /** パス（/repo/ など）。ルートなら / */
  base: string;
}

/**
 * GitHub Pages の URL は、Actions で actions/configure-pages の base_url を PAGES_BASE_URL で渡す。
 * custom_domain と base は config.yml の値を優先する。
 */
export function siteLocation(config: SiteConfig, pagesBaseUrl = process.env.PAGES_BASE_URL): SiteLocation {
  const pagesUrl = pagesBaseUrl ? new URL(pagesBaseUrl) : undefined;
  const site = config.site.custom_domain ? `https://${config.site.custom_domain}` : pagesUrl?.origin;
  const base = config.site.base || (config.site.custom_domain ? '/' : pagesUrl?.pathname) || '/';
  return { site, base };
}

/** イベントページの絶対 URL */
export function eventPageUrl({ site, base }: SiteLocation, eventId: string): string {
  if (!site) {
    throw new Error(
      'サイトの URL が分かりません。site/config.yml の site.custom_domain か、環境変数 PAGES_BASE_URL を設定してください',
    );
  }
  return `${site}${base.replace(/\/$/, '')}/events/${eventId}/`;
}
