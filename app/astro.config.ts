import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
process.env.EVENTPOST_SITE_DIR ??= fileURLToPath(new URL('../site', import.meta.url));

// 環境変数を設定してから読み込む
const { loadConfig } = await import('./src/lib/config');
const { siteLocation } = await import('./src/lib/site-url');
const config = loadConfig();

// GitHub Pages の URL。deploy.yml が actions/configure-pages の base_url を PAGES_BASE_URL で渡す
const { site, base } = siteLocation(config);

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  vite: {
    // Firebase の Web 設定（公開してよい値）をクライアントのコードに埋め込む。src/lib/firebase.ts で使う
    define: { __FIREBASE_CONFIG__: JSON.stringify(config.firebase) },
    // site/ はプロジェクトルート（app/）の外にあるため、開発サーバーからの参照を許可する
    server: { fs: { allow: [repoRoot] } },
  },
});
