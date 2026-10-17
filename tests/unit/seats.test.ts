import { describe, expect, it } from 'vitest';
import { seatStatus } from '../../app/src/lib/seats';

describe('seatStatus', () => {
  it('定員なし', () => {
    expect(seatStatus(null, 5)).toEqual({ state: 'unlimited', remaining: null, label: '定員なし' });
  });

  it('残りが 4 席以上なら通常', () => {
    expect(seatStatus(20, 12)).toEqual({ state: 'open', remaining: 8, label: '残り 8 席' });
    expect(seatStatus(20, 16).state).toBe('open');
  });

  it('残り 3 席以下で「残りわずか」', () => {
    expect(seatStatus(20, 17)).toEqual({ state: 'few', remaining: 3, label: '残りわずか 3 席' });
    expect(seatStatus(20, 19).label).toBe('残りわずか 1 席');
  });

  it('0 席で満席。count が定員を超えていても 0 席として扱う', () => {
    expect(seatStatus(20, 20)).toEqual({ state: 'full', remaining: 0, label: '満席' });
    expect(seatStatus(20, 25)).toEqual({ state: 'full', remaining: 0, label: '満席' });
  });
});
