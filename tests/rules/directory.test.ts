// メンバー一覧（directory）のルール。読めるのはメンバーだけ、書けるのは本人だけ。
// 管理者は、承認と同時か、この機能より前からいるメンバーの分を、空の自己紹介で足せる
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { Timestamp, deleteDoc, doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { listDirectory, saveIntroduction, syncDirectory } from '../../web/src/lib/directory';
import { createGroup } from '../../web/src/lib/group';
import {
  approveApplication,
  removeMember,
  updateProfile,
  withdraw,
  type Application,
  type Role,
} from '../../web/src/lib/membership';

const PROJECT_ID = 'demo-fireside';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firebase/firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seedMember('owner', 'owner');
  await seedMember('admin', 'admin');
  await seedMember('alice', 'member');
  await seedMember('bob', 'member');
});

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

const INTRO = { bio: '週末は山を歩いています。', url: 'https://example.com/alice' };

async function seed(fn: (db: Firestore) => Promise<unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore() as unknown as Firestore);
  });
}

async function read(path: string): Promise<Record<string, unknown> | undefined> {
  let data: Record<string, unknown> | undefined;
  await seed(async (db) => {
    data = (await getDoc(doc(db, path))).data();
  });
  return data;
}

function userDb(uid: string): Firestore {
  return env
    .authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true })
    .firestore() as unknown as Firestore;
}

function guestDb(): Firestore {
  return env.unauthenticatedContext().firestore() as unknown as Firestore;
}

async function seedMember(uid: string, role: Role) {
  await seed((db) =>
    setDoc(doc(db, 'members', uid), {
      uid,
      role,
      realName: `${uid} 本名`,
      nickname: uid,
      email: `${uid}@example.com`,
      joinedAt: Timestamp.now(),
    }),
  );
}

async function seedEntry(uid: string, data: Record<string, unknown> = {}) {
  await seed((db) => setDoc(doc(db, 'directory', uid), { uid, nickname: uid, bio: '', url: '', ...data }));
}

// ---------------------------------------------------------------------------
// 読む
// ---------------------------------------------------------------------------

describe('メンバー一覧を読む', () => {
  beforeEach(async () => {
    await seedEntry('alice', INTRO);
    await seedEntry('bob');
  });

  it('メンバーは全員の分を読める', async () => {
    const list = await assertSucceeds(listDirectory(userDb('bob')));
    expect(list.map((e) => e.uid)).toEqual(['alice', 'bob']);
    expect(list[0]).toEqual({ uid: 'alice', nickname: 'alice', ...INTRO });
  });

  it('メンバーでない人とログインしていない人は読めない', async () => {
    await assertFails(listDirectory(userDb('stranger')));
    await assertFails(listDirectory(guestDb()));
  });
});

// ---------------------------------------------------------------------------
// 自己紹介を書く
// ---------------------------------------------------------------------------

describe('自己紹介を書く', () => {
  it('本人は、まだなくても、あっても書ける', async () => {
    await assertSucceeds(saveIntroduction(userDb('alice'), 'alice', 'alice', INTRO));
    await assertSucceeds(saveIntroduction(userDb('alice'), 'alice', 'alice', { bio: '', url: '' }));
    expect(await read('directory/alice')).toEqual({ uid: 'alice', nickname: 'alice', bio: '', url: '' });
  });

  it('自己紹介は 100 文字まで', async () => {
    await assertSucceeds(saveIntroduction(userDb('alice'), 'alice', 'alice', { bio: 'あ'.repeat(100), url: '' }));
    await assertFails(saveIntroduction(userDb('alice'), 'alice', 'alice', { bio: 'あ'.repeat(101), url: '' }));
  });

  it('URL は空か、http:// か https:// で始まって空白を含まないもの', async () => {
    await assertSucceeds(saveIntroduction(userDb('alice'), 'alice', 'alice', { bio: '', url: 'http://example.com' }));
    for (const url of ['javascript:alert(1)', 'example.com', 'https://', 'https://example.com/a b', 'https://' + 'a'.repeat(493)]) {
      await assertFails(saveIntroduction(userDb('alice'), 'alice', 'alice', { bio: '', url }));
    }
  });

  it('ニックネームは members と同じでなければならない', async () => {
    await assertFails(saveIntroduction(userDb('alice'), 'alice', '別の名前', INTRO));
  });

  it('ほかの人の分は、管理者でも書けない', async () => {
    await seedEntry('alice');
    await assertFails(saveIntroduction(userDb('bob'), 'alice', 'alice', INTRO));
    await assertFails(saveIntroduction(userDb('admin'), 'alice', 'alice', INTRO));
  });

  it('メンバーでない人は書けない', async () => {
    await assertFails(saveIntroduction(userDb('stranger'), 'stranger', 'stranger', INTRO));
  });

  it('決まった項目のほかは書けない', async () => {
    await assertFails(setDoc(doc(userDb('alice'), 'directory', 'alice'), { uid: 'alice', nickname: 'alice', ...INTRO, extra: 1 }));
    await assertFails(setDoc(doc(userDb('alice'), 'directory', 'alice'), { uid: 'alice', nickname: 'alice', bio: '' }));
  });

  it('メンバーのあいだは、本人も管理者も消せない', async () => {
    await seedEntry('alice');
    await assertFails(deleteDoc(doc(userDb('alice'), 'directory', 'alice')));
    await assertFails(deleteDoc(doc(userDb('admin'), 'directory', 'alice')));
  });
});

// ---------------------------------------------------------------------------
// ほかの書き込みと同時に書く
// ---------------------------------------------------------------------------

describe('ほかの書き込みと同時に書く', () => {
  it('グループの作成で、特権管理者の分もできる', async () => {
    await env.clearFirestore();
    await assertSucceeds(
      createGroup(
        userDb('alice'),
        { uid: 'alice', email: 'alice@example.com' },
        { name: 'グループ', description: '', ownerName: '山田 花子' },
        { realName: '山田 花子', nickname: 'はなこ' },
      ),
    );
    expect(await read('directory/alice')).toEqual({ uid: 'alice', nickname: 'はなこ', bio: '', url: '' });
  });

  it('承認で、空の自己紹介ができる', async () => {
    const app: Application = {
      uid: 'carol',
      realName: 'carol 本名',
      nickname: 'キャロル',
      reason: '',
      email: 'carol@example.com',
      createdAt: Timestamp.now(),
    };
    await seed((db) => setDoc(doc(db, 'applications', 'carol'), app));
    await assertSucceeds(approveApplication(userDb('admin'), app, 'member'));
    expect(await read('directory/carol')).toEqual({ uid: 'carol', nickname: 'キャロル', bio: '', url: '' });
  });

  it('名前の変更で、ニックネームが変わり、自己紹介は残る', async () => {
    await seedEntry('alice', INTRO);
    await assertSucceeds(updateProfile(userDb('alice'), 'alice', { realName: '本名', nickname: 'ありす' }, []));
    expect(await read('directory/alice')).toEqual({ uid: 'alice', nickname: 'ありす', ...INTRO });
  });

  it('名前の変更で、まだなければ作られる', async () => {
    await assertSucceeds(updateProfile(userDb('alice'), 'alice', { realName: '本名', nickname: 'ありす' }, []));
    expect(await read('directory/alice')).toEqual({ uid: 'alice', nickname: 'ありす', bio: '', url: '' });
  });

  it('退会で消える', async () => {
    await seedEntry('alice', INTRO);
    await assertSucceeds(withdraw(userDb('alice'), 'alice', [], []));
    expect(await read('directory/alice')).toBeUndefined();
    expect(await read('members/alice')).toBeUndefined();
  });

  it('管理者がメンバーを削除すると消える', async () => {
    await seedEntry('alice', INTRO);
    await assertSucceeds(removeMember(userDb('admin'), 'alice'));
    expect(await read('directory/alice')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 管理者がそろえ直す
// ---------------------------------------------------------------------------

describe('管理者がメンバー一覧をそろえ直す', () => {
  const members = ['owner', 'admin', 'alice', 'bob'].map((uid) => ({ uid, nickname: uid }));

  it('まだいないメンバーを足し、もうメンバーでない人を消す。書いてある自己紹介は残る', async () => {
    await seedEntry('alice', INTRO);
    await seedEntry('gone');
    await assertSucceeds(syncDirectory(userDb('admin'), members));
    expect(await read('directory/alice')).toEqual({ uid: 'alice', nickname: 'alice', ...INTRO });
    expect(await read('directory/bob')).toEqual({ uid: 'bob', nickname: 'bob', bio: '', url: '' });
    expect(await read('directory/owner')).toBeDefined();
    expect(await read('directory/gone')).toBeUndefined();
  });

  it('参加者はそろえ直せない', async () => {
    await assertFails(syncDirectory(userDb('alice'), members));
  });

  it('管理者が足せるのは空の自己紹介だけ', async () => {
    await assertFails(setDoc(doc(userDb('admin'), 'directory', 'bob'), { uid: 'bob', nickname: 'bob', ...INTRO }));
  });
});
