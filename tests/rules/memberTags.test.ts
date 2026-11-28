// メンバーのタグ（members の tags）のルール
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { Timestamp, doc, getDoc, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { setMemberTags, type Member, type Role } from '../../web/src/lib/membership';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-fireside',
    firestore: { rules: readFileSync('firebase/firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

function memberOf(uid: string, role: Role): Member {
  return { uid, role, realName: `${uid} 本名`, nickname: uid, email: `${uid}@example.com`, joinedAt: Timestamp.now() };
}

function userDb(uid: string): Firestore {
  return env
    .authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true })
    .firestore() as unknown as Firestore;
}

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const s = ctx.firestore() as unknown as Firestore;
    for (const m of [memberOf('owner', 'owner'), memberOf('admin', 'admin'), memberOf('alice', 'member'), memberOf('bob', 'member')]) {
      await setDoc(doc(s, 'members', m.uid), m);
    }
  });
});

async function tagsOfMember(uid: string) {
  const snap = await getDoc(doc(userDb('owner'), 'members', uid));
  return snap.data()?.tags as string[] | undefined;
}

describe('メンバーのタグ', () => {
  it('管理者と特権管理者は、メンバーにタグを付けられる（五十音順にそろう）', async () => {
    await assertSucceeds(setMemberTags(userDb('admin'), 'alice', ['運営', '2026年度']));
    expect(await tagsOfMember('alice')).toEqual(['2026年度', '運営']);
    await assertSucceeds(setMemberTags(userDb('owner'), 'admin', ['運営']));
    await assertSucceeds(setMemberTags(userDb('admin'), 'owner', ['運営']));
  });

  it('タグを全部外せる', async () => {
    await setMemberTags(userDb('admin'), 'alice', ['運営']);
    await assertSucceeds(setMemberTags(userDb('admin'), 'alice', []));
    expect(await tagsOfMember('alice')).toEqual([]);
  });

  it('参加者は、自分にもほかの人にもタグを付けられない', async () => {
    await assertFails(setMemberTags(userDb('alice'), 'alice', ['運営']));
    await assertFails(setMemberTags(userDb('alice'), 'bob', ['運営']));
  });

  it('1 人 10 個まで', async () => {
    const tags = Array.from({ length: 10 }, (_, i) => `タグ${i}`);
    await assertSucceeds(setMemberTags(userDb('admin'), 'alice', tags));
    await assertFails(setMemberTags(userDb('admin'), 'alice', [...tags, 'タグ10']));
  });

  it('リストでないものは書けない', async () => {
    await assertFails(updateDoc(doc(userDb('admin'), 'members', 'alice'), { tags: '運営' }));
  });

  it('タグと一緒に、ほかの項目は変えられない', async () => {
    await assertFails(updateDoc(doc(userDb('admin'), 'members', 'alice'), { tags: ['運営'], realName: '書き換え' }));
    await assertFails(updateDoc(doc(userDb('admin'), 'members', 'alice'), { tags: ['運営'], role: 'admin' }));
  });

  it('本人が名前を変えるときに、タグは変えられない', async () => {
    await assertFails(
      updateDoc(doc(userDb('alice'), 'members', 'alice'), { realName: '新しい名前', nickname: 'alice', tags: ['運営'] }),
    );
    await assertSucceeds(updateDoc(doc(userDb('alice'), 'members', 'alice'), { realName: '新しい名前', nickname: 'alice' }));
  });
});
