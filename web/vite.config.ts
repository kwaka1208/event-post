import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const outDir = fileURLToPath(new URL('./dist', import.meta.url));

// GitHub Pages で公開する。独自ドメインを使わないときは https://<ユーザー>.github.io/<リポジトリ>/ になるので、
// 環境変数 BASE_PATH（例：/event-post）でサブパスを渡す。省略すると / で配信する。
function basePath(): string {
  const raw = process.env.BASE_PATH ?? '/';
  return `/${raw.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
}

// GitHub Pages には、どのパスにも index.html を返す設定がない。
// 知らないパスには 404.html を返すので、index.html を複製して、/events/abc などを直接開いても画面を出せるようにする。
function spaFallback(): Plugin {
  return {
    name: 'spa-fallback-404',
    apply: 'build',
    closeBundle() {
      copyFileSync(`${outDir}/index.html`, `${outDir}/404.html`);
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: basePath(),
  plugins: [react(), spaFallback()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir,
    emptyOutDir: true,
    // 画面はページごとに分けて読み込む（web/src/main.tsx）。最も大きいのは Firebase の SDK（Auth と Firestore で
    // 約 680KB）で、トップページでも使うため分けられない。それ以外の塊が大きくなったら気づけるよう、上限はその少し上にする
    chunkSizeWarningLimit: 700,
  },
});
