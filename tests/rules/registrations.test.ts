// イベントへの申込（events/{eventId}/registrations/{uid}）とキャンセルのルール
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
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { getEvent } from '../../web/src/lib/events';
import type { Member, Role } from '../../web/src/lib/membership';
import {
  cancelRegistration,
  getMyRegistration,
  listMyRegistrations,
  listRegistrations,
  register,
} from '../../web/src/lib/registrations';

const PROJECT_ID = 'demo-event-post';

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

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function seed(fn: (db: Firestore) => Promise<unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore() as unknown as Firestore);
  });
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

/** これから開催するイベントを直接作る。start と deadline は今からの時間（ミリ秒） */
async function seedEvent(id: string, overrides: Record<string, unknown> = {}, start = 7 * DAY, deadline = 6 * DAY) {
  const now = Date.now();
  await seed((db) =>
    setDoc(doc(db, 'events', id), {
      title: 'はじめてのプログラミング',
      body: '',
      startAt: Timestamp.fromMillis(now + start),
      endAt: Timestamp.fromMillis(now + start + 2 * HOUR),
      deadlineAt: Timestamp.fromMillis(now + deadline),
      venue: '中部公民館',
      address: '',
      capacity: 10,
      published: true,
      registrationCount: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      ...overrides,
    }),
  );
}

/** 申込を直接作る（申込数も合わせて +1 する） */
async function seedRegistration(eventId: string, uid: string) {
  await seed(async (db) => {
    const m = memberOf(uid);
    await setDoc(doc(db, 'events', eventId, 'registrations', uid), {
      uid,
      realName: m.realName,
      nickname: m.nickname,
      email: m.email,
      createdAt: Timestamp.now(),
    });
    await updateDoc(doc(db, 'events', eventId), { registrationCount: increment(1) });
  });
}

async function countOf(eventId: string): Promise<number> {
  let count = -1;
  await seed(async (db) => {
    count = (await getDoc(doc(db, 'events', eventId))).data()?.registrationCount;
  });
  return count;
}

beforeEach(async () => {
  await env.clearFirestore();
  await seedMember('owner', 'owner');
  await seedMember('admin', 'admin');
  await seedMember('alice', 'member');
  await seedMember('bob', 'member');
});

// ---------------------------------------------------------------------------
// 申込
// ---------------------------------------------------------------------------

describe('申込', () => {
  it('メンバーは申し込め、申込数が 1 増える', async () => {
    await seedEvent('ev');
    await assertSucceeds(register(userDb('alice'), 'ev', memberOf('alice')));
    expect(await countOf('ev')).toBe(1);
    const reg = await getMyRegistration(userDb('alice'), 'ev', 'alice');
    expect(reg?.realName).toBe('alice 本名');
    expect(reg?.email).toBe('alice@example.com');
  });

  it('管理者も、メンバーとして申し込める', async () => {
    await seedEvent('ev');
    await assertSucceeds(register(userDb('admin'), 'ev', memberOf('admin', 'admin')));
  });

  it('同じイベントに 2 回は申し込めない', async () => {
    await seedEvent('ev');
    await register(userDb('alice'), 'ev', memberOf('alice'));
    await assertFails(register(userDb('alice'), 'ev', memberOf('alice')));
    expect(await countOf('ev')).toBe(1);
  });

  it('メンバーでない人とログインしていない人は申し込めない', async () => {
    await seedEvent('ev');
    await assertFails(register(userDb('stranger'), 'ev', memberOf('stranger')));
    await assertFails(register(guestDb(), 'ev', memberOf('alice')));
  });

  it('ほかの人の分は申し込めない', async () => {
    await seedEvent('ev');
    await assertFails(register(userDb('alice'), 'ev', memberOf('bob')));
  });

  it('名前やメールアドレスを members と違う内容にして申し込めない', async () => {
    await seedEvent('ev');
    await assertFails(register(userDb('alice'), 'ev', { ...memberOf('alice'), realName: '別の名前' }));
    await assertFails(register(userDb('alice'), 'ev', { ...memberOf('alice'), email: 'other@example.com' }));
  });

  it('下書きのイベントには申し込めない', async () => {
    await seedEvent('ev', { published: false });
    await assertFails(register(userDb('alice'), 'ev', memberOf('alice')));
  });

  it('締切を過ぎると申し込めない（開始前でも）', async () => {
    await seedEvent('ev', {}, 2 * DAY, -1 * HOUR);
    await assertFails(register(userDb('alice'), 'ev', memberOf('alice')));
  });

  it('定員に達していると申し込めない', async () => {
    await seedEvent('ev', { capacity: 1 });
    await seedRegistration('ev', 'bob');
    await assertFails(register(userDb('alice'), 'ev', memberOf('alice')));
    expect(await countOf('ev')).toBe(1);
  });

  it('定員なしなら、何人でも申し込める', async () => {
    await seedEvent('ev', { capacity: null, registrationCount: 500 });
    await assertSucceeds(register(userDb('alice'), 'ev', memberOf('alice')));
  });

  it('残り 1 人のとき、同時に申し込むと 1 人だけが申し込める', async () => {
    await seedEvent('ev', { capacity: 1 });
    const results = await Promise.allSettled([
      register(userDb('alice'), 'ev', memberOf('alice')),
      register(userDb('bob'), 'ev', memberOf('bob')),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await countOf('ev')).toBe(1);
  });

  it('申込数を増やさずに、申込だけを作れない', async () => {
    await seedEvent('ev');
    const m = memberOf('alice');
    await assertFails(
      setDoc(doc(userDb('alice'), 'events', 'ev', 'registrations', 'alice'), {
        uid: 'alice',
        realName: m.realName,
        nickname: m.nickname,
        email: m.email,
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('申込を作らずに、申込数だけを増やせない', async () => {
    await seedEvent('ev');
    await assertFails(updateDoc(doc(userDb('alice'), 'events', 'ev'), { registrationCount: increment(1) }));
  });

  it('申込数を 2 以上増やせない', async () => {
    await seedEvent('ev');
    const db = userDb('alice');
    const m = memberOf('alice');
    const batch = writeBatch(db);
    batch.set(doc(db, 'events', 'ev', 'registrations', 'alice'), {
      uid: 'alice',
      realName: m.realName,
      nickname: m.nickname,
      email: m.email,
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'events', 'ev'), { registrationCount: increment(2) });
    await assertFails(batch.commit());
  });

  it('申込の内容は変えられない', async () => {
    await seedEvent('ev');
    await seedRegistration('ev', 'alice');
    await assertFails(updateDoc(doc(userDb('alice'), 'events', 'ev', 'registrations', 'alice'), { nickname: '変更' }));
  });
});

// ---------------------------------------------------------------------------
// キャンセル
// ---------------------------------------------------------------------------

describe('キャンセル', () => {
  it('本人は開始前ならキャンセルでき、申込数が 1 減る', async () => {
    await seedEvent('ev');
    await seedRegistration('ev', 'alice');
    await assertSucceeds(cancelRegistration(userDb('alice'), 'ev', 'alice'));
    expect(await countOf('ev')).toBe(0);
    expect(await getMyRegistration(userDb('alice'), 'ev', 'alice')).toBeNull();
  });

  it('キャンセルしたあと、もう一度申し込める', async () => {
    await seedEvent('ev');
    await register(userDb('alice'), 'ev', memberOf('alice'));
    await cancelRegistration(userDb('alice'), 'ev', 'alice');
    await assertSucceeds(register(userDb('alice'), 'ev', memberOf('alice')));
    expect(await countOf('ev')).toBe(1);
  });

  it('締切後でも、開始前ならキャンセルできる', async () => {
    await seedEvent('ev', {}, 2 * DAY, -1 * HOUR);
    await seedRegistration('ev', 'alice');
    await assertSucceeds(cancelRegistration(userDb('alice'), 'ev', 'alice'));
  });

  it('開始日時を過ぎるとキャンセルできない', async () => {
    await seedEvent('ev', {}, -1 * HOUR, -2 * HOUR);
    await seedRegistration('ev', 'alice');
    await assertFails(cancelRegistration(userDb('alice'), 'ev', 'alice'));
  });

  it('ほかの人の申込はキャンセルできない（管理者も）', async () => {
    await seedEvent('ev');
    await seedRegistration('ev', 'alice');
    await assertFails(cancelRegistration(userDb('bob'), 'ev', 'alice'));
    await assertFails(cancelRegistration(userDb('admin'), 'ev', 'alice'));
  });

  it('申込数を減らさずに、申込だけを消せない', async () => {
    await seedEvent('ev');
    await seedRegistration('ev', 'alice');
    await assertFails(deleteDoc(doc(userDb('alice'), 'events', 'ev', 'registrations', 'alice')));
  });

  it('申込を消さずに、申込数だけを減らせない', async () => {
    await seedEvent('ev');
    await seedRegistration('ev', 'alice');
    await assertFails(updateDoc(doc(userDb('alice'), 'events', 'ev'), { registrationCount: increment(-1) }));
  });
});

// ---------------------------------------------------------------------------
// 読み取り
// ---------------------------------------------------------------------------

describe('読み取り', () => {
  beforeEach(async () => {
    await seedEvent('ev1');
    await seedEvent('ev2');
    await seedRegistration('ev1', 'alice');
    await seedRegistration('ev2', 'alice');
    await seedRegistration('ev1', 'bob');
  });

  it('本人は自分の申込を読めるが、ほかの人の申込は読めない', async () => {
    await assertSucceeds(getMyRegistration(userDb('alice'), 'ev1', 'alice'));
    await assertFails(getMyRegistration(userDb('alice'), 'ev1', 'bob'));
  });

  it('管理者は申込者の一覧を読める', async () => {
    const regs = await assertSucceeds(listRegistrations(userDb('admin'), 'ev1'));
    expect(regs.map((r) => r.uid).sort()).toEqual(['alice', 'bob']);
  });

  it('参加者は申込者の一覧を読めない', async () => {
    await assertFails(listRegistrations(userDb('alice'), 'ev1'));
    await assertFails(getDocs(collection(userDb('alice'), 'events', 'ev1', 'registrations')));
  });

  it('collectionGroup で、自分の申込をすべて読める（マイページ用）', async () => {
    const regs = await assertSucceeds(listMyRegistrations(userDb('alice'), 'alice'));
    expect(regs.map((r) => r.eventId).sort()).toEqual(['ev1', 'ev2']);
  });

  it('collectionGroup で、ほかの人の申込や、絞り込まない検索は読めない', async () => {
    await assertFails(listMyRegistrations(userDb('alice'), 'bob'));
    await assertFails(getDocs(collectionGroup(userDb('alice'), 'registrations')));
  });

  it('申込があるイベントも、管理者は編集できる（申込数は変わらない）', async () => {
    await assertSucceeds(
      updateDoc(doc(userDb('admin'), 'events', 'ev1'), { title: '新しいタイトル', updatedAt: serverTimestamp() }),
    );
    const event = await getEvent(userDb('admin'), 'ev1');
    expect(event?.registrationCount).toBe(2);
  });
});
