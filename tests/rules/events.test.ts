// イベント（events）の読み取り、作成、編集、削除のルール
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
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import {
  createEvent,
  deleteEvent,
  getEvent,
  listAllEvents,
  listPublishedEvents,
  updateEvent,
  type EventInput,
} from '../../web/src/lib/events';
import type { Role } from '../../web/src/lib/membership';

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

const DAY = 24 * 60 * 60 * 1000;
const base = Date.now() + 30 * DAY;

const INPUT: EventInput = {
  title: 'はじめてのプログラミング',
  body: '## 持ち物\n\n- ノートパソコン',
  startAt: new Date(base),
  endAt: new Date(base + 2 * 60 * 60 * 1000),
  deadlineAt: new Date(base - DAY),
  venue: '奈良市中部公民館',
  address: '奈良県奈良市三条本町',
  capacity: 10,
  published: true,
};

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

/** イベントを直接作る（ルールを迂回）。申込数などを自由に決められる */
async function seedEvent(id: string, overrides: Record<string, unknown> = {}) {
  await seed((db) =>
    setDoc(doc(db, 'events', id), {
      title: INPUT.title,
      body: INPUT.body,
      startAt: Timestamp.fromDate(INPUT.startAt),
      endAt: Timestamp.fromDate(INPUT.endAt),
      deadlineAt: Timestamp.fromDate(INPUT.deadlineAt!),
      venue: INPUT.venue,
      address: INPUT.address,
      capacity: INPUT.capacity,
      published: true,
      registrationCount: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      ...overrides,
    }),
  );
}

/** ルールが拒否するはずの生の書き込み（作成） */
function rawCreate(db: Firestore, data: Record<string, unknown>) {
  return setDoc(doc(collection(db, 'events')), {
    title: INPUT.title,
    body: INPUT.body,
    startAt: Timestamp.fromDate(INPUT.startAt),
    endAt: Timestamp.fromDate(INPUT.endAt),
    deadlineAt: Timestamp.fromDate(INPUT.deadlineAt!),
    venue: INPUT.venue,
    address: INPUT.address,
    capacity: INPUT.capacity,
    published: true,
    registrationCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...data,
  });
}

beforeEach(async () => {
  await env.clearFirestore();
  await seedMember('owner', 'owner');
  await seedMember('admin', 'admin');
  await seedMember('alice', 'member');
});

// ---------------------------------------------------------------------------
// 読み取り
// ---------------------------------------------------------------------------

describe('読み取り', () => {
  beforeEach(async () => {
    await seedEvent('open');
    await seedEvent('draft', { published: false });
  });

  it('参加者は公開中のイベントを読める', async () => {
    await assertSucceeds(getEvent(userDb('alice'), 'open'));
  });

  it('参加者は下書きを読めない', async () => {
    await assertFails(getEvent(userDb('alice'), 'draft'));
  });

  it('管理者と特権管理者は下書きを読める', async () => {
    await assertSucceeds(getEvent(userDb('admin'), 'draft'));
    await assertSucceeds(getEvent(userDb('owner'), 'draft'));
  });

  it('メンバーでない人とログインしていない人は読めない', async () => {
    await assertFails(getEvent(userDb('stranger'), 'open'));
    await assertFails(getEvent(guestDb(), 'open'));
  });

  it('参加者は、公開中に絞り込んだ一覧を読める', async () => {
    const events = await assertSucceeds(listPublishedEvents(userDb('alice')));
    expect(events.map((e) => e.id)).toEqual(['open']);
  });

  it('参加者は、絞り込まない一覧を読めない', async () => {
    await assertFails(listAllEvents(userDb('alice')));
    await assertFails(getDocs(collection(userDb('alice'), 'events')));
  });

  it('管理者は、下書きを含む一覧を読める', async () => {
    const events = await assertSucceeds(listAllEvents(userDb('admin')));
    expect(events.map((e) => e.id).sort()).toEqual(['draft', 'open']);
  });
});

// ---------------------------------------------------------------------------
// 作成
// ---------------------------------------------------------------------------

describe('作成', () => {
  it('管理者と特権管理者は作成でき、申込数は 0 になる', async () => {
    const id = await assertSucceeds(createEvent(userDb('admin'), INPUT));
    await assertSucceeds(createEvent(userDb('owner'), INPUT));
    const event = await getEvent(userDb('admin'), id);
    expect(event?.registrationCount).toBe(0);
    expect(event?.title).toBe(INPUT.title);
  });

  it('参加者、メンバーでない人、ログインしていない人は作成できない', async () => {
    await assertFails(createEvent(userDb('alice'), INPUT));
    await assertFails(createEvent(userDb('stranger'), INPUT));
    await assertFails(createEvent(guestDb(), INPUT));
  });

  it('締切を入れないと、開始日時が締切になる', async () => {
    const id = await createEvent(userDb('admin'), { ...INPUT, deadlineAt: null });
    const event = await getEvent(userDb('admin'), id);
    expect(event?.deadlineAt.toMillis()).toBe(INPUT.startAt.getTime());
  });

  it('定員なし（null）で作成できる', async () => {
    await assertSucceeds(createEvent(userDb('admin'), { ...INPUT, capacity: null }));
  });

  it('下書きで作成できる', async () => {
    await assertSucceeds(createEvent(userDb('admin'), { ...INPUT, published: false }));
  });

  it('終了が開始より前、または同じなら作成できない', async () => {
    await assertFails(createEvent(userDb('admin'), { ...INPUT, endAt: INPUT.startAt }));
    await assertFails(createEvent(userDb('admin'), { ...INPUT, endAt: new Date(base - 1000) }));
  });

  it('締切が開始より後なら作成できない', async () => {
    await assertFails(createEvent(userDb('admin'), { ...INPUT, deadlineAt: new Date(base + 1000) }));
  });

  it('定員が 0、上限より多い、整数でない場合は作成できない', async () => {
    await assertFails(createEvent(userDb('admin'), { ...INPUT, capacity: 0 }));
    await assertFails(createEvent(userDb('admin'), { ...INPUT, capacity: 10001 }));
    await assertFails(createEvent(userDb('admin'), { ...INPUT, capacity: 1.5 }));
  });

  it('タイトルや会場が空、または長すぎる場合は作成できない', async () => {
    await assertFails(createEvent(userDb('admin'), { ...INPUT, title: '' }));
    await assertFails(createEvent(userDb('admin'), { ...INPUT, title: 'あ'.repeat(101) }));
    await assertFails(createEvent(userDb('admin'), { ...INPUT, venue: '' }));
    await assertFails(createEvent(userDb('admin'), { ...INPUT, body: 'あ'.repeat(10001) }));
    await assertFails(createEvent(userDb('admin'), { ...INPUT, address: 'あ'.repeat(201) }));
  });

  it('本文と住所は空でも作成できる', async () => {
    await assertSucceeds(createEvent(userDb('admin'), { ...INPUT, body: '', address: '' }));
  });

  it('申込数を 0 以外にして作成できない', async () => {
    await assertFails(rawCreate(userDb('admin'), { registrationCount: 3 }));
  });

  it('作成日時をサーバーの時刻以外にして作成できない', async () => {
    await assertFails(rawCreate(userDb('admin'), { createdAt: Timestamp.fromMillis(0) }));
  });

  it('決まっていない項目を足して作成できない', async () => {
    await assertFails(rawCreate(userDb('admin'), { extra: 'x' }));
  });
});

// ---------------------------------------------------------------------------
// 編集
// ---------------------------------------------------------------------------

describe('編集', () => {
  beforeEach(async () => {
    await seedEvent('ev', { registrationCount: 5 });
  });

  it('管理者は編集でき、下書きに戻すこともできる', async () => {
    await assertSucceeds(updateEvent(userDb('admin'), 'ev', { ...INPUT, title: '新しいタイトル' }));
    await assertSucceeds(updateEvent(userDb('owner'), 'ev', { ...INPUT, title: '新しいタイトル', published: false }));
    const event = await getEvent(userDb('admin'), 'ev');
    expect(event?.title).toBe('新しいタイトル');
    expect(event?.published).toBe(false);
    expect(event?.registrationCount).toBe(5);
  });

  it('参加者は編集できない', async () => {
    await assertFails(updateEvent(userDb('alice'), 'ev', { ...INPUT, title: '書き換え' }));
  });

  it('定員を申込数と同じまで減らせるが、それより少なくはできない', async () => {
    await assertSucceeds(updateEvent(userDb('admin'), 'ev', { ...INPUT, capacity: 5 }));
    await assertFails(updateEvent(userDb('admin'), 'ev', { ...INPUT, capacity: 4 }));
  });

  it('申込があっても、定員なしにはできる', async () => {
    await assertSucceeds(updateEvent(userDb('admin'), 'ev', { ...INPUT, capacity: null }));
  });

  it('申込数と作成日時は変えられない', async () => {
    const db = userDb('admin');
    await assertFails(updateDoc(doc(db, 'events', 'ev'), { registrationCount: 0, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'events', 'ev'), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });

  it('更新日時を変えずには編集できない', async () => {
    await assertFails(updateDoc(doc(userDb('admin'), 'events', 'ev'), { title: '更新日時なし' }));
  });

  it('入力の確かめは作成と同じ（終了が開始より前なら編集できない）', async () => {
    await assertFails(updateEvent(userDb('admin'), 'ev', { ...INPUT, endAt: new Date(base - 1000) }));
  });

  it('Actions がメールの送信日時などを書き足したあとも編集できる', async () => {
    await seed((db) => updateDoc(doc(db, 'events', 'ev'), { remindedAt: Timestamp.now() }));
    await assertSucceeds(updateEvent(userDb('admin'), 'ev', { ...INPUT, title: '書き足し後の編集' }));
  });

  it('Actions が書き足した項目を、管理者は変えられない', async () => {
    await seed((db) => updateDoc(doc(db, 'events', 'ev'), { remindedAt: Timestamp.now() }));
    await assertFails(updateDoc(doc(userDb('admin'), 'events', 'ev'), { remindedAt: null, updatedAt: serverTimestamp() }));
  });
});

// ---------------------------------------------------------------------------
// 削除
// ---------------------------------------------------------------------------

describe('削除', () => {
  it('申込がないイベントは、管理者が削除できる', async () => {
    await seedEvent('empty');
    await assertSucceeds(deleteEvent(userDb('admin'), 'empty'));
    let found = true;
    await seed(async (db) => {
      found = (await getDoc(doc(db, 'events', 'empty'))).exists();
    });
    expect(found).toBe(false);
  });

  it('申込があるイベントは削除できない', async () => {
    await seedEvent('busy', { registrationCount: 1 });
    await assertFails(deleteEvent(userDb('admin'), 'busy'));
    await assertFails(deleteEvent(userDb('owner'), 'busy'));
  });

  it('参加者は削除できない', async () => {
    await seedEvent('empty');
    await assertFails(deleteEvent(userDb('alice'), 'empty'));
  });
});
