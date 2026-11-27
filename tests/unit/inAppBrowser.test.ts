import { describe, expect, it } from 'vitest';
import { inAppBrowserName, lineExternalUrl } from '../../web/src/lib/inAppBrowser';

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko)';

describe('inAppBrowserName', () => {
  it('Safari と Chrome はアプリの中のブラウザではない', () => {
    expect(inAppBrowserName(`${IOS} Version/18.1 Mobile/15E148 Safari/604.1`)).toBeNull();
    expect(inAppBrowserName(`${IOS} CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1`)).toBeNull();
    expect(inAppBrowserName(`${ANDROID} Chrome/131.0.6778.81 Mobile Safari/537.36`)).toBeNull();
  });

  it('アプリの中のブラウザを見分ける', () => {
    expect(inAppBrowserName(`${IOS} Mobile/15E148 Safari Line/14.19.0`)).toBe('LINE');
    expect(inAppBrowserName(`${IOS} Mobile/15E148 Instagram 357.0.0.25.101 (iPhone15,3; iOS 18_1; ja_JP)`)).toBe('Instagram');
    expect(inAppBrowserName(`${IOS} Mobile/22B83 [FBAN/FBIOS;FBAV/489.0.0.47.106;FBBV/1]`)).toBe('Facebook');
    expect(inAppBrowserName(`${IOS} GSA/343.0.695551749 Mobile/15E148 Safari/604.1`)).toBe('Google アプリ');
    expect(inAppBrowserName(`${IOS} Mobile/15E148 Twitter for iPhone/10.70`)).toBe('X');
    expect(inAppBrowserName(`${IOS} Mobile/15E148 YJApp-IOS jp.co.yahoo.ipn.appli/4.62.0`)).toBe('Yahoo! JAPAN');
  });

  it('Android の WebView は、アプリが分からなくても見分ける', () => {
    expect(inAppBrowserName(`Mozilla/5.0 (Linux; Android 15; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.81 Mobile Safari/537.36`)).toBe('');
  });
});

describe('lineExternalUrl', () => {
  it('openExternalBrowser=1 を付ける', () => {
    expect(lineExternalUrl('https://example.github.io/events/')).toBe('https://example.github.io/events/?openExternalBrowser=1');
    expect(lineExternalUrl('https://example.github.io/events/?a=1#x')).toBe('https://example.github.io/events/?a=1&openExternalBrowser=1#x');
  });
});
