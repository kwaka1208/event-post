import { describe, expect, it } from 'vitest';
import { ACCENT_PRESETS, isUsableAccent, normalizeHex } from '../../web/src/lib/theme';

describe('テーマカラー', () => {
  it('入力を #rrggbb にそろえる', () => {
    expect(normalizeHex(' #202F55 ')).toBe('#202f55');
    expect(normalizeHex('202f55')).toBe('#202f55');
    expect(normalizeHex('#abc')).toBe('#aabbcc');
    expect(normalizeHex('red')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
  });

  it('用意した色は、どれも使える（背景とのコントラスト比が足りる）', () => {
    for (const p of ACCENT_PRESETS) expect(isUsableAccent(p.color), p.name).toBe(true);
  });

  it('明るすぎる色は使えない', () => {
    expect(isUsableAccent('#ffcc00')).toBe(false);
    expect(isUsableAccent('#7fb3d5')).toBe(false);
    expect(isUsableAccent('#000000')).toBe(true);
  });
});
