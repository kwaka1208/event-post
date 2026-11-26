import { describe, expect, it } from 'vitest';
import { splitLinks } from '../../web/src/lib/linkify';

describe('splitLinks', () => {
  it('URL がなければ、そのまま 1 つ', () => {
    expect(splitLinks('こんにちは')).toEqual([{ text: 'こんにちは', url: false }]);
  });

  it('文の中の URL を分ける', () => {
    expect(splitLinks('資料は https://example.com/a?b=1 にあります')).toEqual([
      { text: '資料は ', url: false },
      { text: 'https://example.com/a?b=1', url: true },
      { text: ' にあります', url: false },
    ]);
  });

  it('日本語や句読点が続いても、URL に含めない', () => {
    expect(splitLinks('https://example.com/a。次へ')).toEqual([
      { text: 'https://example.com/a', url: true },
      { text: '。次へ', url: false },
    ]);
    expect(splitLinks('（https://example.com/）')).toEqual([
      { text: '（', url: false },
      { text: 'https://example.com/', url: true },
      { text: '）', url: false },
    ]);
  });

  it('文の終わりのピリオドは URL に含めない', () => {
    expect(splitLinks('See https://example.com.')).toEqual([
      { text: 'See ', url: false },
      { text: 'https://example.com', url: true },
      { text: '.', url: false },
    ]);
  });

  it('javascript: などはリンクにしない', () => {
    expect(splitLinks('javascript:alert(1)')).toEqual([{ text: 'javascript:alert(1)', url: false }]);
  });
});
