// 配色（テーマカラー）。管理者が group/profile の accentColor に入れた色を、画面全体の --accent にする。
// ボタンの白い文字と、背景の上のリンクの文字が読めるように、ページの背景（白より少し暗い --bg）とのコントラスト比が
// 4.5:1 以上の色だけを受け付ける（白とはそれ以上の比になる）。

/** 何も選んでいないときの色（styles.css の --accent と同じ） */
export const DEFAULT_ACCENT = '#0f6e8c';

/** 選びやすいように用意した色。どれもページの背景とのコントラスト比 4.5:1 以上 */
export const ACCENT_PRESETS: { name: string; color: string }[] = [
  { name: '青緑（標準）', color: '#0f6e8c' },
  { name: '紺', color: '#202f55' },
  { name: '青', color: '#1d5fbf' },
  { name: '緑', color: '#2e7040' },
  { name: '赤茶', color: '#a3402a' },
  { name: 'えんじ', color: '#9b2d4f' },
  { name: '紫', color: '#6a3fa0' },
  { name: '墨', color: '#3a4552' },
];

/** 必要なコントラスト比（WCAG AA の本文） */
export const MIN_CONTRAST = 4.5;

/** ページの背景（styles.css の --bg と同じ）。リンクの文字がいちばん読みにくくなる背景 */
const PAGE_BG = '#f4f6f8';

const HEX = /^#[0-9a-f]{6}$/;

/** 入力された色を #rrggbb（小文字）にそろえる。色として読めなければ null */
export function normalizeHex(input: string): string | null {
  let v = input.trim().toLowerCase();
  if (!v.startsWith('#')) v = `#${v}`;
  if (/^#[0-9a-f]{3}$/.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return HEX.test(v) ? v : null;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 色とページの背景のコントラスト比（1〜21） */
export function contrastWithBackground(hex: string): number {
  const [a, b] = [luminance(hex), luminance(PAGE_BG)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/** テーマカラーとして使えるか（形式が正しく、ページの背景とのコントラスト比が足りる） */
export function isUsableAccent(hex: string): boolean {
  return HEX.test(hex) && contrastWithBackground(hex) >= MIN_CONTRAST;
}

const STORAGE_KEY = 'fireside-accent';

/**
 * 画面全体の --accent を変える。null なら標準の色に戻す。
 * 次に開いたときに標準の色が一瞬見えないよう、ブラウザにも覚えておく
 */
export function applyAccent(color: string | null | undefined): void {
  const usable = color && isUsableAccent(color) ? color : null;
  const root = document.documentElement.style;
  if (usable) root.setProperty('--accent', usable);
  else root.removeProperty('--accent');
  try {
    if (usable) localStorage.setItem(STORAGE_KEY, usable);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ブラウザに保存できなくても、色は変わっているので何もしない
  }
}

/** 前に開いたときの色を、最初の表示の前に当てる（main.tsx から呼ぶ） */
export function applyCachedAccent(): void {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached && isUsableAccent(cached)) document.documentElement.style.setProperty('--accent', cached);
  } catch {
    // 読めなければ標準の色のまま
  }
}
