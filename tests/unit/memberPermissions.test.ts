import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { canChangeRole, canRemoveMember, type Member, type Role } from '../../web/src/lib/membership';

const m = (uid: string, role: Role): Member => ({
  uid,
  role,
  realName: uid,
  nickname: uid,
  email: `${uid}@example.com`,
  joinedAt: Timestamp.now(),
});
const owner = m('owner', 'owner');
const admin = m('admin', 'admin');
const admin2 = m('admin2', 'admin');
const member = m('member', 'member');

describe('メンバーの削除と役割の変更ができるか（ルールと同じ条件）', () => {
  it('特権管理者は、管理者と参加者を削除でき、役割を変えられる', () => {
    expect(canRemoveMember(owner, admin)).toBe(true);
    expect(canRemoveMember(owner, member)).toBe(true);
    expect(canChangeRole(owner, admin)).toBe(true);
    expect(canChangeRole(owner, member)).toBe(true);
  });

  it('特権管理者は、自分を削除できず、自分の役割も変えられない', () => {
    expect(canRemoveMember(owner, owner)).toBe(false);
    expect(canChangeRole(owner, owner)).toBe(false);
  });

  it('管理者は参加者だけを削除でき、役割は変えられない', () => {
    expect(canRemoveMember(admin, member)).toBe(true);
    expect(canRemoveMember(admin, admin2)).toBe(false);
    expect(canRemoveMember(admin, admin)).toBe(false);
    expect(canRemoveMember(admin, owner)).toBe(false);
    expect(canChangeRole(admin, member)).toBe(false);
  });

  it('参加者は何もできない', () => {
    expect(canRemoveMember(member, m('member2', 'member'))).toBe(false);
    expect(canChangeRole(member, admin)).toBe(false);
  });
});
