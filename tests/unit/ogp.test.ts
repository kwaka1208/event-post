import { describe, expect, it } from 'vitest';
import { escapeHtml, ogpTags, resolveImageUrl, summarize } from '../../scripts/lib/ogp';

const siteUrl = 'https://example.github.io/asugaku';

describe('summarize', () => {
  it('改行や続く空白を 1 つにまとめる', () => {
    expect(summarize('  AI と\n\nセキュリティ  を学ぶ会  ')).toBe('AI と セキュリティ を学ぶ会');
  });

  it('長ければ上限の文字数に縮め、末尾を「…」にする', () => {
    expect(summarize('あ'.repeat(10), 5)).toBe('ああああ…');
    expect(summarize('あ'.repeat(5), 5)).toBe('あああああ');
  });
});

describe('escapeHtml', () => {
  it('タグや属性を壊す文字を置き換える', () => {
    expect(escapeHtml('<b>"A&B"</b>')).toBe('&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;');
  });
});

describe('resolveImageUrl', () => {
  const customFile = { fileName: 'ogp.png', version: 'abcd1234' };

  it('Variables の URL があれば、それを使う', () => {
    expect(resolveImageUrl({ imageUrlVar: ' https://cdn.example.com/a.png ', siteUrl, customFile })).toBe(
      'https://cdn.example.com/a.png',
    );
  });

  it('なければ、リポジトリの画像をサイトの URL につなぎ、版の印を付ける', () => {
    expect(resolveImageUrl({ imageUrlVar: '', siteUrl: `${siteUrl}/`, customFile })).toBe(
      'https://example.github.io/asugaku/ogp.png?v=abcd1234',
    );
  });

  it('画像がないか、サイトの URL が分からなければ、画像なし', () => {
    expect(resolveImageUrl({ siteUrl })).toBeUndefined();
    expect(resolveImageUrl({ customFile })).toBeUndefined();
  });
});

describe('ogpTags', () => {
  it('グループ名と説明、URL、画像のタグを出す', () => {
    const tags = ogpTags({
      title: 'あすか雑楽部',
      description: 'AI や "セキュリティ" を学ぶ会です。',
      siteUrl,
      imageUrl: `${siteUrl}/ogp.png?v=1`,
    });
    expect(tags).toContain('<title>あすか雑楽部</title>');
    expect(tags).toContain('<meta property="og:title" content="あすか雑楽部" />');
    expect(tags).toContain('<meta property="og:description" content="AI や &quot;セキュリティ&quot; を学ぶ会です。" />');
    expect(tags).toContain('<meta name="description" content="AI や &quot;セキュリティ&quot; を学ぶ会です。" />');
    expect(tags).toContain('<meta property="og:url" content="https://example.github.io/asugaku/" />');
    expect(tags).toContain('<meta property="og:image" content="https://example.github.io/asugaku/ogp.png?v=1" />');
    expect(tags).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });

  it('グループがなければ Fireside の名前にし、説明・URL・画像がなければそのタグを出さない', () => {
    const tags = ogpTags({ title: '', description: '' });
    expect(tags).toContain('<title>Fireside</title>');
    expect(tags).not.toContain('description');
    expect(tags).not.toContain('og:url');
    expect(tags).not.toContain('og:image');
    expect(tags).toContain('<meta name="twitter:card" content="summary" />');
  });
});
