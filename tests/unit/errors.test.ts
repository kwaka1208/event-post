import { FirebaseError } from 'firebase/app';
import { describe, expect, it } from 'vitest';
import { isIndexNotReady, isPermissionDenied } from '../../web/src/lib/errors';

describe('isIndexNotReady', () => {
  it('インデックスの準備中（failed-precondition）を見分ける', () => {
    expect(isIndexNotReady(new FirebaseError('failed-precondition', 'The query requires an index.'))).toBe(true);
  });

  it('権限や通信のエラー、Firebase 以外のエラーは準備中とみなさない', () => {
    const denied = new FirebaseError('permission-denied', 'Missing or insufficient permissions.');
    expect(isIndexNotReady(denied)).toBe(false);
    expect(isPermissionDenied(denied)).toBe(true);
    expect(isIndexNotReady(new FirebaseError('unavailable', 'offline'))).toBe(false);
    expect(isIndexNotReady(new Error('failed-precondition'))).toBe(false);
    expect(isIndexNotReady(undefined)).toBe(false);
  });
});
