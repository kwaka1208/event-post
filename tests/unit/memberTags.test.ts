import { describe, expect, it } from 'vitest';
import { allTags, membersWithTags, normalizeTag, tagsOf } from '../../web/src/lib/membership';

const members = [
  { uid: 'a', tags: ['運営', '2026年度'] },
  { uid: 'b', tags: ['2026年度'] },
  { uid: 'c', tags: [] },
  { uid: 'd' },
];

describe('メンバーのタグ', () => {
  it('タグがない人は空', () => {
    expect(tagsOf({})).toEqual([]);
    expect(tagsOf({ tags: ['運営'] })).toEqual(['運営']);
  });

  it('付いているタグを重なりなしで並べる', () => {
    expect(allTags(members)).toEqual(['2026年度', '運営']);
    expect(allTags([{}, { tags: [] }])).toEqual([]);
  });

  it('選んだタグのどれかが付いている人を選ぶ', () => {
    expect(membersWithTags(members, new Set(['運営'])).map((m) => m.uid)).toEqual(['a']);
    expect(membersWithTags(members, new Set(['運営', '2026年度'])).map((m) => m.uid)).toEqual(['a', 'b']);
    expect(membersWithTags(members, new Set())).toEqual([]);
  });

  it('入力の前後の空白を除き、続く空白を 1 つにする', () => {
    expect(normalizeTag('  運営  ')).toBe('運営');
    expect(normalizeTag('2026年度　 春')).toBe('2026年度 春');
    expect(normalizeTag('   ')).toBe('');
  });
});
