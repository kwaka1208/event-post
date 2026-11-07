import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import type { GroupProfile } from '../../web/src/lib/group';
import type { Application, Member } from '../../web/src/lib/membership';
import { homePathFor, resolveSession } from '../../web/src/lib/session';

const group: GroupProfile = {
  name: 'CoderDojo 奈良',
  description: '',
  ownerName: '奈良 太郎',
  ownerUid: 'owner',
  createdAt: Timestamp.now(),
};
const user = { uid: 'alice', email: 'alice@example.com' };
const member: Member = {
  uid: 'alice',
  role: 'member',
  realName: '山田 花子',
  nickname: 'はなこ',
  email: user.email,
  joinedAt: Timestamp.now(),
};
const application: Application = {
  uid: 'alice',
  realName: '山田 花子',
  nickname: 'はなこ',
  reason: '参加したいです',
  email: user.email,
  createdAt: Timestamp.now(),
};

describe('resolveSession', () => {
  it('グループがなければ、ログインしていても no-group', () => {
    expect(resolveSession({ group: null, user: null, member: null, application: null })).toEqual({
      kind: 'no-group',
      user: null,
    });
    expect(resolveSession({ group: null, user, member: null, application: null })).toEqual({ kind: 'no-group', user });
  });

  it('未ログインなら guest', () => {
    expect(resolveSession({ group, user: null, member: null, application: null }).kind).toBe('guest');
  });

  it('メンバーなら、申し込みが残っていても member', () => {
    expect(resolveSession({ group, user, member, application }).kind).toBe('member');
  });

  it('申し込み済みなら pending', () => {
    expect(resolveSession({ group, user, member: null, application }).kind).toBe('pending');
  });

  it('どちらもなければ newcomer', () => {
    expect(resolveSession({ group, user, member: null, application: null }).kind).toBe('newcomer');
  });
});

describe('homePathFor', () => {
  it('状態ごとに、ログイン後に見せる画面を返す', () => {
    expect(homePathFor({ kind: 'no-group', user: null })).toBe('/');
    expect(homePathFor({ kind: 'no-group', user })).toBe('/setup');
    expect(homePathFor({ kind: 'guest', group })).toBe('/');
    expect(homePathFor({ kind: 'newcomer', group, user })).toBe('/join');
    expect(homePathFor({ kind: 'pending', group, user, application })).toBe('/join');
    expect(homePathFor({ kind: 'member', group, user, member })).toBe('/events');
  });
});
