import { describe, expect, it } from 'vitest';
import { configSchema } from '../../app/src/lib/schema';
import { eventPageUrl, siteLocation } from '../../app/src/lib/site-url';

function config(site: Record<string, string> = {}) {
  return configSchema.parse({
    group: { name: 'g', contact_email: 'info@example.org' },
    admins: ['a@example.org'],
    firebase: { apiKey: 'k', authDomain: 'd', projectId: 'p', appId: 'a' },
    site,
  });
}

describe('サイトの URL', () => {
  it('GitHub Pages の URL からオリジンとパスを取る', () => {
    const loc = siteLocation(config(), 'https://example.github.io/repo');
    expect(loc).toEqual({ site: 'https://example.github.io', base: '/repo' });
    expect(eventPageUrl(loc, '2026-11-20-a')).toBe('https://example.github.io/repo/events/2026-11-20-a/');
  });

  it('custom_domain があればルートに置く', () => {
    const loc = siteLocation(config({ custom_domain: 'events.example.org' }), 'https://example.github.io/repo');
    expect(loc).toEqual({ site: 'https://events.example.org', base: '/' });
    expect(eventPageUrl(loc, 'x')).toBe('https://events.example.org/events/x/');
  });

  it('base の指定を優先する', () => {
    expect(siteLocation(config({ base: '/sub/' }), 'https://example.github.io/repo').base).toBe('/sub/');
  });

  it('URL が分からなければ、イベントページの URL は作れない', () => {
    const loc = siteLocation(config(), undefined);
    expect(loc).toEqual({ site: undefined, base: '/' });
    expect(() => eventPageUrl(loc, 'x')).toThrow(/PAGES_BASE_URL/);
  });
});
