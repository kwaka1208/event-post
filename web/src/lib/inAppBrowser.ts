// アプリの中のブラウザ（LINE、Instagram、Google アプリなどでリンクを開いたときの画面）かどうかを、User-Agent から調べる。
// こうしたブラウザでは、ログインのポップアップが開いたまま白い画面になったり、Google がログインを断ったりする。
// そのため、Safari や Chrome で開き直すよう案内する。見分けられないアプリもあるので、ログインのボタンは残す

const IN_APP_BROWSERS: { name: string; pattern: RegExp }[] = [
  { name: 'LINE', pattern: /\bLine\//i },
  { name: 'Instagram', pattern: /\bInstagram\b/i },
  { name: 'Threads', pattern: /\bBarcelona\b/ },
  { name: 'Facebook', pattern: /\bFB(AN|AV|_IAB)\b/ },
  { name: 'X', pattern: /\bTwitter\b/i },
  { name: 'Google アプリ', pattern: /\bGSA\// },
  { name: 'Yahoo! JAPAN', pattern: /\bYJApp/ },
  { name: 'Slack', pattern: /\bSlack\b/ },
  { name: 'Discord', pattern: /\bDiscord\b/ },
];

/** アプリの中のブラウザなら、そのアプリの名前を返す（Android の WebView で、アプリが分からないときは空文字）。違えば null */
export function inAppBrowserName(userAgent: string): string | null {
  for (const { name, pattern } of IN_APP_BROWSERS) if (pattern.test(userAgent)) return name;
  // Android の WebView は「; wv)」を含む
  if (/Android/.test(userAgent) && /;\s*wv\)/.test(userAgent)) return '';
  return null;
}

/** LINE では、URL に openExternalBrowser=1 を付けて開くと、端末のブラウザで開き直せる */
export function lineExternalUrl(href: string): string {
  const url = new URL(href);
  url.searchParams.set('openExternalBrowser', '1');
  return url.toString();
}
