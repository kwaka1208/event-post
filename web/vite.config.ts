import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { ogpTags, resolveImageUrl } from '../scripts/lib/ogp';

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

// OGP（SNS でリンクを共有したときの見え方）のタグを index.html に書き込む。SNS は JavaScript を動かさないため。
// グループ名と説明は Deploy が Firestore から読んで web/ogp.json に書く（scripts/ogp.ts）。なければ EventPost の名前で出す。
// 画像は環境変数 OGP_IMAGE_URL（Variables）があればそれを、なければリポジトリの custom/ogp.png（または .jpg）を、
// それもなければ既定の画像（web/ogp-default.png）を使う。
// サイトの URL は環境変数 SITE_URL（Deploy が GitHub Pages の設定から渡す）。なければ URL と画像のタグは出さない
const OGP_IMAGE_CANDIDATES = ['ogp.png', 'ogp.jpg', 'ogp.jpeg'];
const repoRoot = new URL('../', import.meta.url);

function ogp(): Plugin {
  const jsonPath = fileURLToPath(new URL('./ogp.json', import.meta.url));
  const customName = OGP_IMAGE_CANDIDATES.find((name) => existsSync(new URL(`custom/${name}`, repoRoot)));
  const imageName = customName ?? 'ogp.png';
  const image = readFileSync(customName ? new URL(`custom/${customName}`, repoRoot) : new URL('./ogp-default.png', import.meta.url));
  const siteUrl = process.env.SITE_URL?.trim() || undefined;
  const imageUrlVar = process.env.OGP_IMAGE_URL;
  // OGP_IMAGE_URL があるときは、リポジトリの画像を公開しない
  const publishImage = !imageUrlVar?.trim();

  return {
    name: 'ogp',
    apply: 'build',
    transformIndexHtml(html) {
      const group = existsSync(jsonPath)
        ? (JSON.parse(readFileSync(jsonPath, 'utf8')) as { title?: string; description?: string })
        : {};
      const imageUrl = resolveImageUrl({
        imageUrlVar,
        siteUrl,
        customFile: { fileName: imageName, version: createHash('sha256').update(image).digest('hex').slice(0, 8) },
      });
      const tags = ogpTags({ title: group.title ?? '', description: group.description ?? '', siteUrl, imageUrl });
      return html.replace('<title>EventPost</title>', tags);
    },
    generateBundle() {
      if (publishImage) this.emitFile({ type: 'asset', fileName: imageName, source: image });
    },
  };
}

// ファビコン。リポジトリの custom/favicon.svg か custom/favicon.png があればそれを、なければ既定の
// web/public/favicon.svg と apple-touch-icon.png（ホーム画面に追加したときのアイコン）を使う。
// custom/favicon.png は、ホーム画面のアイコンにも使う（180×180 ピクセル以上がおすすめ）
function favicon(): Plugin {
  const svg = existsSync(new URL('custom/favicon.svg', repoRoot)) ? readFileSync(new URL('custom/favicon.svg', repoRoot)) : undefined;
  const png = existsSync(new URL('custom/favicon.png', repoRoot)) ? readFileSync(new URL('custom/favicon.png', repoRoot)) : undefined;
  let base = '/';

  return {
    name: 'favicon',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml(html) {
      // 既定のファイルと名前を変えて、ブラウザに古いアイコンを使われないようにする
      if (svg || png) {
        html = html.replace(
          /<link rel="icon"[^>]*>/,
          svg
            ? `<link rel="icon" href="${base}custom-favicon.svg" type="image/svg+xml" />`
            : `<link rel="icon" href="${base}custom-favicon.png" type="image/png" />`,
        );
      }
      if (png) {
        html = html.replace(/<link rel="apple-touch-icon"[^>]*>/, `<link rel="apple-touch-icon" href="${base}custom-favicon.png" />`);
      }
      return html;
    },
    generateBundle() {
      if (svg) this.emitFile({ type: 'asset', fileName: 'custom-favicon.svg', source: svg });
      if (png) this.emitFile({ type: 'asset', fileName: 'custom-favicon.png', source: png });
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: basePath(),
  plugins: [react(), ogp(), favicon(), spaFallback()],
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
