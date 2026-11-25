// マイページでの名前の変更（members と、開始前のイベントの申込の写し）、退会と、
// メンバーから管理者への問い合わせ（inquiries）のルール
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { deleteInquiry, listInquiries, sendInquiry } from '../../web/src/lib/inquiries';
import { updateProfile, withdraw, type Member, type Role } from '../../web/src/lib/membership';

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

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NEW_NAME = { realName: '山田 花子', nickname: 'はなちゃん' };

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

function memberOf(uid: string, role: Role = 'member'): Member {
  return {
    uid,
    role,
    realName: `${uid} 本名`,
    nickname: uid,
    email: `${uid}@example.com`,
    joinedAt: Timestamp.now(),
  };
}

async function seedMember(uid: string, role: Role) {
  await seed((db) => setDoc(doc(db, 'members', uid), memberOf(uid, role)));
}

/** イベントと、uid の申込を直接作る。start は今からの時間（ミリ秒。負なら開始後） */
async function seedRegisteredEvent(id: string, uid: string, start: number, overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  const m = memberOf(uid);
  await seed(async (db) => {
    await setDoc(doc(db, 'events', id), {
      title: id,
      body: '',
      startAt: Timestamp.fromMillis(now + start),
      endAt: Timestamp.fromMillis(now + start + 2 * HOUR),
      deadlineAt: Timestamp.fromMillis(now + start),
      venue: '会場',
      address: '',
      capacity: null,
      published: true,
      registrationCount: 1,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      ...overrides,
    });
    await setDoc(doc(db, 'events', id, 'registrations', uid), {
      uid,
      realName: m.realName,
      nickname: m.nickname,
      email: m.email,
      createdAt: Timestamp.now(),
      // Actions が書き足す送信の記録があっても変えられる
      confirmedAt: Timestamp.now(),
    });
  });
}

// ---------------------------------------------------------------------------
// 名前の変更
// ---------------------------------------------------------------------------

describe('名前の変更', () => {
  it('本人は自分の本名とニックネームを変えられる', async () => {
    await assertSucceeds(updateProfile(userDb('alice'), 'alice', NEW_NAME, []));
    expect(await read('members/alice')).toMatchObject({ ...NEW_NAME, role: 'member', email: 'alice@example.com' });
  });

  it('管理者・特権管理者も、自分の名前を変えられる', async () => {
    await assertSucceeds(updateProfile(userDb('admin'), 'admin', NEW_NAME, []));
    await assertSucceeds(updateProfile(userDb('owner'), 'owner', NEW_NAME, []));
  });

  it('ほかの人の名前は変えられない（管理者でも）', async () => {
    await assertFails(updateProfile(userDb('bob'), 'alice', NEW_NAME, []));
    await assertFails(updateProfile(userDb('admin'), 'alice', NEW_NAME, []));
    await assertFails(updateProfile(guestDb(), 'alice', NEW_NAME, []));
  });

  it('役割やメールアドレスは変えられない', async () => {
    const db = userDb('alice');
    await assertFails(updateDoc(doc(db, 'members', 'alice'), { role: 'admin' }));
    await assertFails(updateDoc(doc(db, 'members', 'alice'), { email: 'other@example.com' }));
    await assertFails(updateDoc(doc(db, 'members', 'alice'), { ...NEW_NAME, role: 'admin' }));
  });

  it('空の名前や長すぎる名前にはできない', async () => {
    const db = userDb('alice');
    await assertFails(updateProfile(db, 'alice', { realName: '', nickname: 'はな' }, []));
    await assertFails(updateProfile(db, 'alice', { realName: '山田', nickname: '' }, []));
    await assertFails(updateProfile(db, 'alice', { realName: 'あ'.repeat(101), nickname: 'はな' }, []));
  });

  it('開始前のイベントの申込にも、新しい名前を写す', async () => {
    await seedRegisteredEvent('soon', 'alice', 3 * DAY);
    await seedRegisteredEvent('later', 'alice', 10 * DAY);
    await assertSucceeds(updateProfile(userDb('alice'), 'alice', NEW_NAME, ['soon', 'later']));
    expect(await read('events/soon/registrations/alice')).toMatchObject(NEW_NAME);
    expect(await read('events/later/registrations/alice')).toMatchObject(NEW_NAME);
  });

  it('申込が多くても、何回かに分けて写す', async () => {
    const ids = Array.from({ length: 23 }, (_, i) => `e${i}`);
    for (const id of ids) await seedRegisteredEvent(id, 'alice', 3 * DAY);
    await assertSucceeds(updateProfile(userDb('alice'), 'alice', NEW_NAME, ids));
    for (const id of ids) expect(await read(`events/${id}/registrations/alice`)).toMatchObject(NEW_NAME);
  });

  it('開始後のイベントの申込は変えられない（当時の名前のまま残す）', async () => {
    await seedRegisteredEvent('started', 'alice', -HOUR);
    await assertSucceeds(updateProfile(userDb('alice'), 'alice', NEW_NAME, []));
    const db = userDb('alice');
    await assertFails(updateDoc(doc(db, 'events', 'started', 'registrations', 'alice'), NEW_NAME));
    expect(await read('events/started/registrations/alice')).toMatchObject({ realName: 'alice 本名' });
  });

  it('申込の名前は、自分の members と同じ名前にしかできない', async () => {
    await seedRegisteredEvent('soon', 'alice', 3 * DAY);
    const db = userDb('alice');
    await assertFails(updateDoc(doc(db, 'events', 'soon', 'registrations', 'alice'), NEW_NAME));

    // members と同時に変えるならよい
    const batch = writeBatch(db);
    batch.update(doc(db, 'members', 'alice'), NEW_NAME);
    batch.update(doc(db, 'events', 'soon', 'registrations', 'alice'), NEW_NAME);
    await assertSucceeds(batch.commit());
  });

  it('申込の名前のほか（メールアドレスなど）は変えられない', async () => {
    await seedRegisteredEvent('soon', 'alice', 3 * DAY);
    const db = userDb('alice');
    await assertFails(updateDoc(doc(db, 'events', 'soon', 'registrations', 'alice'), { email: 'other@example.com' }));
  });

  it('ほかの人の申込は変えられない', async () => {
    await seedRegisteredEvent('soon', 'alice', 3 * DAY);
    await seed((db) => updateDoc(doc(db, 'members', 'bob'), NEW_NAME));
    await assertFails(updateDoc(doc(userDb('bob'), 'events', 'soon', 'registrations', 'alice'), NEW_NAME));
    await assertFails(updateDoc(doc(userDb('admin'), 'events', 'soon', 'registrations', 'alice'), NEW_NAME));
  });
});

// ---------------------------------------------------------------------------
// 退会
// ---------------------------------------------------------------------------

describe('退会', () => {
  it('参加者と管理者は、本人が退会できる', async () => {
    await assertSucceeds(withdraw(userDb('alice'), 'alice', [], []));
    await assertSucceeds(withdraw(userDb('admin'), 'admin', [], []));
    expect(await read('members/alice')).toBeUndefined();
    expect(await read('members/admin')).toBeUndefined();
  });

  it('特権管理者は退会できない', async () => {
    await assertFails(withdraw(userDb('owner'), 'owner', [], []));
    expect(await read('members/owner')).toBeDefined();
  });

  it('ほかの参加者を退会させることはできない', async () => {
    await assertFails(withdraw(userDb('bob'), 'alice', [], []));
    expect(await read('members/alice')).toBeDefined();
  });

  it('開始前のイベントの申込はキャンセルして申込数を減らし、開始後の申込は記録として残す', async () => {
    await seedRegisteredEvent('soon', 'alice', 3 * DAY);
    await seedRegisteredEvent('started', 'alice', -HOUR);
    await assertSucceeds(withdraw(userDb('alice'), 'alice', ['soon'], []));
    expect(await read('events/soon/registrations/alice')).toBeUndefined();
    expect((await read('events/soon'))?.registrationCount).toBe(0);
    expect(await read('events/started/registrations/alice')).toBeDefined();
    expect(await read('members/alice')).toBeUndefined();
  });

  it('開始日時が分からないイベントは、開始前ならキャンセルし、開始後ならそのまま退会する', async () => {
    await seedRegisteredEvent('draft-soon', 'alice', 3 * DAY, { published: false });
    await seedRegisteredEvent('draft-started', 'alice', -HOUR, { published: false });
    await assertSucceeds(withdraw(userDb('alice'), 'alice', [], ['draft-soon', 'draft-started']));
    expect(await read('events/draft-soon/registrations/alice')).toBeUndefined();
    expect(await read('events/draft-started/registrations/alice')).toBeDefined();
    expect(await read('members/alice')).toBeUndefined();
  });

  it('開始前と分かっているイベントのキャンセルに失敗したら、退会しない', async () => {
    await seedRegisteredEvent('started', 'alice', -HOUR);
    await assertFails(withdraw(userDb('alice'), 'alice', ['started'], []));
    expect(await read('members/alice')).toBeDefined();
  });

  it('退会したあとは、もう一度参加を申し込める', async () => {
    await seed((db) => setDoc(doc(db, 'group/profile'), { name: 'g', description: '', ownerName: 'o', ownerUid: 'owner', createdAt: Timestamp.now() }));
    await withdraw(userDb('alice'), 'alice', [], []);
    await assertSucceeds(
      setDoc(doc(userDb('alice'), 'applications', 'alice'), {
        uid: 'alice',
        realName: 'alice 本名',
        nickname: 'alice',
        reason: 'また参加したいです。',
        email: 'alice@example.com',
        createdAt: serverTimestamp(),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// 問い合わせ
// ---------------------------------------------------------------------------

const INQUIRY = { subject: '次回の持ち物', body: 'ノートパソコンは必要ですか？' };

function validInquiry(uid: string, overrides: Record<string, unknown> = {}) {
  const m = memberOf(uid);
  return {
    uid,
    realName: m.realName,
    nickname: m.nickname,
    email: m.email,
    ...INQUIRY,
    createdAt: serverTimestamp(),
    ...overrides,
  };
}

describe('問い合わせ', () => {
  it('メンバーは問い合わせを送れる', async () => {
    await assertSucceeds(sendInquiry(userDb('alice'), memberOf('alice'), INQUIRY));
  });

  it('メンバーでない人やログインしていない人は送れない', async () => {
    await assertFails(addDoc(collection(userDb('stranger'), 'inquiries'), validInquiry('stranger')));
    await assertFails(addDoc(collection(guestDb(), 'inquiries'), validInquiry('alice')));
  });

  it('名前とメールアドレスは、自分の members と同じでなければならない', async () => {
    const col = collection(userDb('alice'), 'inquiries');
    await assertFails(addDoc(col, validInquiry('alice', { realName: '別の名前' })));
    await assertFails(addDoc(col, validInquiry('alice', { email: 'other@example.com' })));
    await assertFails(addDoc(col, validInquiry('bob')));
  });

  it('件名と内容は空にできず、長すぎてもいけない', async () => {
    const col = collection(userDb('alice'), 'inquiries');
    await assertFails(addDoc(col, validInquiry('alice', { subject: '' })));
    await assertFails(addDoc(col, validInquiry('alice', { body: '' })));
    await assertFails(addDoc(col, validInquiry('alice', { subject: 'あ'.repeat(201) })));
    await assertFails(addDoc(col, validInquiry('alice', { body: 'あ'.repeat(5001) })));
    await assertSucceeds(addDoc(col, validInquiry('alice', { subject: 'あ'.repeat(200), body: 'あ'.repeat(5000) })));
  });

  it('送信の記録（notifiedAt）などを自分で書き足せない', async () => {
    const col = collection(userDb('alice'), 'inquiries');
    await assertFails(addDoc(col, validInquiry('alice', { notifiedAt: serverTimestamp() })));
    await assertFails(addDoc(col, validInquiry('alice', { createdAt: Timestamp.fromMillis(0) })));
  });

  it('管理者は一覧を読めて、削除できる。メンバーは読めず、削除もできない', async () => {
    await sendInquiry(userDb('alice'), memberOf('alice'), INQUIRY);
    const list = await assertSucceeds(listInquiries(userDb('admin')));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ uid: 'alice', ...INQUIRY });
    await assertFails(listInquiries(userDb('alice')));
    await assertFails(getDoc(doc(userDb('alice'), 'inquiries', list[0].id)));
    await assertFails(deleteInquiry(userDb('alice'), list[0].id));
    await assertSucceeds(deleteInquiry(userDb('owner'), list[0].id));
  });

  it('送ったあとは、本人も管理者も内容を変えられない', async () => {
    await sendInquiry(userDb('alice'), memberOf('alice'), INQUIRY);
    const [inquiry] = await listInquiries(userDb('admin'));
    await assertFails(updateDoc(doc(userDb('alice'), 'inquiries', inquiry.id), { body: '書き換え' }));
    await assertFails(updateDoc(doc(userDb('admin'), 'inquiries', inquiry.id), { body: '書き換え' }));
  });
});
