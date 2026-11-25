// OGP（SNS でリンクを共有したときの見え方）のタグを組み立てる。
// SNS は JavaScript を動かさずに HTML を読むので、Deploy のときに web/index.html に書き込む（web/vite.config.ts）。
// Firestore やファイルには触らず、渡された値だけから組み立てる。

export interface OgpInfo {
  /** グループ名。なければ Fireside */
  title: string;
  /** グループの説明 */
  description: string;
  /** サイトの URL（https://…）。なければ og:url と og:image を出さない（SNS は絶対 URL しか読まないため） */
  siteUrl?: string;
  /** 画像の URL（絶対 URL）。なければ画像なし */
  imageUrl?: string;
}

/** og:description に入れる長さの上限（長いと SNS が途中で切るため） */
export const OGP_DESCRIPTION_MAX = 120;

/** 改行や続く空白を 1 つの空白にまとめ、長ければ末尾を「…」にして縮める */
export function summarize(text: string, max = OGP_DESCRIPTION_MAX): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const chars = Array.from(flat);
  return chars.length <= max ? flat : `${chars.slice(0, max - 1).join('')}…`;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * 画像の URL を決める。Variables の OGP_IMAGE_URL があればそれを使い、
 * なければリポジトリに置いた画像（公開するときのファイル名と、中身から作った版の印）を、サイトの URL につなぐ
 */
export function resolveImageUrl(opts: {
  imageUrlVar?: string;
  siteUrl?: string;
  customFile?: { fileName: string; version: string };
}): string | undefined {
  const fromVar = opts.imageUrlVar?.trim();
  if (fromVar) return fromVar;
  if (!opts.customFile || !opts.siteUrl) return undefined;
  // 画像を差し替えたときに SNS の古いキャッシュを使われないよう、中身ごとに変わる印を付ける
  return `${opts.siteUrl.replace(/\/+$/, '')}/${opts.customFile.fileName}?v=${opts.customFile.version}`;
}

/** <head> に入れる <title> と meta タグ */
export function ogpTags(info: OgpInfo): string {
  const title = info.title.trim() || 'Fireside';
  const description = summarize(info.description);
  const meta = (attr: 'name' | 'property', key: string, value: string) =>
    `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`;
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    ...(description ? [meta('name', 'description', description)] : []),
    meta('property', 'og:type', 'website'),
    meta('property', 'og:title', title),
    meta('property', 'og:site_name', title),
    ...(description ? [meta('property', 'og:description', description)] : []),
    ...(info.siteUrl ? [meta('property', 'og:url', `${info.siteUrl.replace(/\/+$/, '')}/`)] : []),
    ...(info.imageUrl ? [meta('property', 'og:image', info.imageUrl)] : []),
    meta('name', 'twitter:card', info.imageUrl ? 'summary_large_image' : 'summary'),
  ];
  return tags.join('\n    ');
}
