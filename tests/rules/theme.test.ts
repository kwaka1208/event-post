// 配色（group/profile の accentColor）のルール。管理者なら誰でも変えられ、ほかの項目は変えられない
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { Timestamp, doc, getDoc, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { updateAccentColor, updateGroup } from '../../web/src/lib/group';
import type { Role } from '../../web/src/lib/membership';

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

async function seed(fn: (db: Firestore) => Promise<unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore() as unknown as Firestore);
  });
}

async function seedMember(uid: string, role: Role) {
  await seed((db) =>
    setDoc(doc(db, 'members', uid), {
      uid,
      role,
      realName: uid,
      nickname: uid,
      email: `${uid}@example.com`,
      joinedAt: Timestamp.now(),
    }),
  );
}

function userDb(uid: string): Firestore {
  return env
    .authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true })
    .firestore() as unknown as Firestore;
}

async function readGroup() {
  let data: Record<string, unknown> | undefined;
  await seed(async (db) => {
    data = (await getDoc(doc(db, 'group', 'profile'))).data();
  });
  return data;
}

beforeEach(async () => {
  await env.clearFirestore();
  await seed((db) =>
    setDoc(doc(db, 'group', 'profile'), {
      name: 'グループ',
      description: '',
      ownerName: 'たろう',
      ownerUid: 'owner',
      createdAt: Timestamp.now(),
    }),
  );
  await seedMember('owner', 'owner');
  await seedMember('admin', 'admin');
  await seedMember('alice', 'member');
});

describe('配色', () => {
  it('管理者と特権管理者は、テーマカラーを変えられ、標準に戻せる', async () => {
    await assertSucceeds(updateAccentColor(userDb('admin'), '#202f55'));
    expect(await readGroup()).toMatchObject({ accentColor: '#202f55' });
    await assertSucceeds(updateAccentColor(userDb('owner'), '#2e7040'));
    await assertSucceeds(updateAccentColor(userDb('admin'), null));
    expect((await readGroup())?.accentColor).toBeUndefined();
  });

  it('参加者とメンバーでない人は変えられない', async () => {
    await assertFails(updateAccentColor(userDb('alice'), '#202f55'));
    await assertFails(updateAccentColor(userDb('stranger'), '#202f55'));
  });

  it('色は #rrggbb（小文字）の形だけ', async () => {
    for (const color of ['#FFF', '#20305', 'red', '#202f55; x', '#GGGGGG']) {
      await assertFails(updateDoc(doc(userDb('admin'), 'group', 'profile'), { accentColor: color }));
    }
  });

  it('管理者は、色と一緒にほかの項目を変えられない。グループの情報を変えられるのは特権管理者だけ', async () => {
    await assertFails(updateDoc(doc(userDb('admin'), 'group', 'profile'), { accentColor: '#202f55', name: '別の名前' }));
    await assertFails(updateGroup(userDb('admin'), { name: '別の名前', description: '', ownerName: 'たろう' }));
    await seed((db) => updateDoc(doc(db, 'group', 'profile'), { accentColor: '#202f55' }));
    await assertSucceeds(updateGroup(userDb('owner'), { name: '別の名前', description: '', ownerName: 'たろう' }));
  });
});
