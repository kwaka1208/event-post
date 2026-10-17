import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  collection,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-eventpost';
const ADMIN_EMAIL = 'organizer@example.org';
const HOUR = 60 * 60 * 1000;

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
  await seed((db) => setDoc(doc(db, 'config/admins'), { emails: [ADMIN_EMAIL] }));
  await seedEvent('open');
});

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

async function seed(fn: (db: Firestore) => Promise<unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore() as unknown as Firestore);
  });
}

interface EventOverrides {
  startAt?: Date;
  deadline?: Date;
  capacity?: number | null;
  count?: number;
  published?: boolean;
  archived?: boolean;
  fieldIds?: string[];
}

/** events/{id} を作る。既定は「1 週間後に開催・受付中・定員 3・count 0」 */
async function seedEvent(id: string, o: EventOverrides = {}) {
  const startAt = o.startAt ?? new Date(Date.now() + 7 * 24 * HOUR);
  await seed((db) =>
    setDoc(doc(db, 'events', id), {
      title: 'テストイベント',
      startAt: Timestamp.fromDate(startAt),
      endAt: Timestamp.fromDate(new Date(startAt.getTime() + 3 * HOUR)),
      deadline: Timestamp.fromDate(o.deadline ?? startAt),
      capacity: o.capacity === undefined ? 3 : o.capacity,
      count: o.count ?? 0,
      fieldIds: o.fieldIds ?? ['grade', 'note'],
      published: o.published ?? true,
      archived: o.archived ?? false,
    }),
  );
}

/** 申込を直接作る（ルールを迂回）。count も合わせて +1 する */
async function seedRegistration(eventId: string, uid: string) {
  await seed(async (db) => {
    await setDoc(doc(db, 'events', eventId, 'registrations', uid), {
      uid,
      name: uid,
      email: emailOf(uid),
      answers: {},
      createdAt: Timestamp.now(),
    });
    const ev = await getDoc(doc(db, 'events', eventId));
    await updateDoc(doc(db, 'events', eventId), { count: ev.data()!.count + 1 });
  });
}

function emailOf(uid: string) {
  return `${uid}@example.com`;
}

function userDb(uid: string, token: Record<string, unknown> = {}): Firestore {
  return env
    .authenticatedContext(uid, { email: emailOf(uid), email_verified: true, ...token })
    .firestore() as unknown as Firestore;
}

function adminDb(): Firestore {
  return env
    .authenticatedContext('admin', { email: ADMIN_EMAIL, email_verified: true })
    .firestore() as unknown as Firestore;
}

function guestDb(): Firestore {
  return env.unauthenticatedContext().firestore() as unknown as Firestore;
}

interface ApplyOptions {
  regUid?: string;
  email?: string;
  name?: string;
  answers?: Record<string, unknown>;
  countDelta?: number;
  extra?: Record<string, unknown>;
}

/** クライアントと同じく、トランザクションで申込を作って count を +1 する */
function apply(db: Firestore, eventId: string, uid: string, o: ApplyOptions = {}) {
  return runTransaction(db, async (tx) => {
    const evRef = doc(db, 'events', eventId);
    const ev = await tx.get(evRef);
    const regUid = o.regUid ?? uid;
    tx.set(doc(db, 'events', eventId, 'registrations', regUid), {
      uid: regUid,
      name: o.name ?? 'テスト 太郎',
      email: o.email ?? emailOf(uid),
      answers: o.answers ?? { grade: '小3' },
      createdAt: serverTimestamp(),
      ...o.extra,
    });
    tx.update(evRef, { count: ev.data()!.count + (o.countDelta ?? 1) });
  });
}

/** トランザクションで申込を削除して count を −1 する */
function cancel(db: Firestore, eventId: string, uid: string, regUid = uid) {
  return runTransaction(db, async (tx) => {
    const evRef = doc(db, 'events', eventId);
    const ev = await tx.get(evRef);
    tx.delete(doc(db, 'events', eventId, 'registrations', regUid));
    tx.update(evRef, { count: ev.data()!.count - 1 });
  });
}

async function countOf(eventId: string): Promise<number> {
  let count = -1;
  await seed(async (db) => {
    count = (await getDoc(doc(db, 'events', eventId))).data()!.count;
  });
  return count;
}

async function expectCount(eventId: string, expected: number) {
  const actual = await countOf(eventId);
  if (actual !== expected) throw new Error(`count は ${expected} のはずが ${actual}`);
}

// ---------------------------------------------------------------------------
// 申込
// ---------------------------------------------------------------------------

describe('申込', () => {
  it('本人の申込が成功し、count が +1 される', async () => {
    await assertSucceeds(apply(userDb('alice'), 'open', 'alice'));
    await expectCount('open', 1);
  });

  it('追加項目に数値の回答もできる', async () => {
    await seedEvent('num', { fieldIds: ['age'] });
    await assertSucceeds(apply(userDb('alice'), 'num', 'alice', { answers: { age: 9 } }));
  });

  it('定員なしのイベントには何人でも申し込める', async () => {
    await seedEvent('unlimited', { capacity: null, count: 100 });
    await assertSucceeds(apply(userDb('alice'), 'unlimited', 'alice'));
    await expectCount('unlimited', 101);
  });

  it('他人の uid での申込は拒否', async () => {
    await assertFails(apply(userDb('alice'), 'open', 'alice', { regUid: 'bob' }));
  });

  it('メールアドレスが auth token と違う申込は拒否', async () => {
    await assertFails(apply(userDb('alice'), 'open', 'alice', { email: 'other@example.com' }));
  });

  it('メールアドレスが未確認のユーザーの申込は拒否', async () => {
    await assertFails(apply(userDb('alice', { email_verified: false }), 'open', 'alice'));
  });

  it('未ログインの申込は拒否', async () => {
    const db = guestDb();
    await assertFails(
      setDoc(doc(db, 'events/open/registrations/anon'), {
        uid: 'anon',
        name: 'x',
        email: 'x@example.com',
        answers: {},
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(updateDoc(doc(db, 'events/open'), { count: 1 }));
  });

  it('定員ちょうどまでは成功し、定員を超える申込は拒否', async () => {
    await assertSucceeds(apply(userDb('u1'), 'open', 'u1'));
    await assertSucceeds(apply(userDb('u2'), 'open', 'u2'));
    await assertSucceeds(apply(userDb('u3'), 'open', 'u3'));
    await expectCount('open', 3);
    await assertFails(apply(userDb('u4'), 'open', 'u4'));
    await expectCount('open', 3);
  });

  it('count を +2 する申込は拒否', async () => {
    await assertFails(apply(userDb('alice'), 'open', 'alice', { countDelta: 2 }));
  });

  it('count を変えない申込は拒否', async () => {
    const db = userDb('alice');
    await assertFails(
      setDoc(doc(db, 'events/open/registrations/alice'), {
        uid: 'alice',
        name: 'x',
        email: emailOf('alice'),
        answers: {},
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('申込を伴わない count の変更は拒否', async () => {
    await assertFails(updateDoc(doc(userDb('alice'), 'events/open'), { count: 1 }));
    await assertFails(updateDoc(doc(userDb('alice'), 'events/open'), { count: -1 }));
  });

  it('count 以外のフィールドの変更は拒否', async () => {
    const db = userDb('alice');
    await assertFails(
      runTransaction(db, async (tx) => {
        const evRef = doc(db, 'events/open');
        const ev = await tx.get(evRef);
        tx.set(doc(db, 'events/open/registrations/alice'), {
          uid: 'alice',
          name: 'x',
          email: emailOf('alice'),
          answers: {},
          createdAt: serverTimestamp(),
        });
        tx.update(evRef, { count: ev.data()!.count + 1, capacity: 100 });
      }),
    );
  });

  it('締切後のイベントへの申込は拒否', async () => {
    await seedEvent('closed', { deadline: new Date(Date.now() - HOUR) });
    await assertFails(apply(userDb('alice'), 'closed', 'alice'));
  });

  it('非公開のイベントへの申込は拒否', async () => {
    await seedEvent('draft', { published: false });
    await assertFails(apply(userDb('alice'), 'draft', 'alice'));
  });

  it('アーカイブ済みのイベントへの申込は拒否', async () => {
    await seedEvent('archived', { archived: true });
    await assertFails(apply(userDb('alice'), 'archived', 'alice'));
  });

  it('存在しないイベントへの申込は拒否', async () => {
    await assertFails(
      setDoc(doc(userDb('alice'), 'events/missing/registrations/alice'), {
        uid: 'alice',
        name: 'x',
        email: emailOf('alice'),
        answers: {},
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('二重申込は拒否', async () => {
    await assertSucceeds(apply(userDb('alice'), 'open', 'alice'));
    await assertFails(apply(userDb('alice'), 'open', 'alice'));
    await expectCount('open', 1);
  });

  it('fieldIds にない回答キーは拒否', async () => {
    await assertFails(apply(userDb('alice'), 'open', 'alice', { answers: { hack: 'x' } }));
  });

  it('長すぎる回答は拒否', async () => {
    await assertSucceeds(apply(userDb('ok'), 'open', 'ok', { answers: { note: 'あ'.repeat(1000) } }));
    await assertFails(apply(userDb('ng'), 'open', 'ng', { answers: { note: 'あ'.repeat(1001) } }));
  });

  it('文字列・数値以外の回答は拒否', async () => {
    await assertFails(apply(userDb('alice'), 'open', 'alice', { answers: { grade: ['小3'] } }));
    await assertFails(apply(userDb('alice'), 'open', 'alice', { answers: { grade: true } }));
  });

  it('名前が空・長すぎる申込は拒否', async () => {
    await assertFails(apply(userDb('alice'), 'open', 'alice', { name: '' }));
    await assertFails(apply(userDb('alice'), 'open', 'alice', { name: 'あ'.repeat(101) }));
  });

  it('決められたキー以外を含む申込は拒否', async () => {
    await assertFails(
      apply(userDb('alice'), 'open', 'alice', { extra: { confirmationSentAt: Timestamp.now() } }),
    );
  });

  it('createdAt がサーバー時刻でない申込は拒否', async () => {
    await assertFails(
      apply(userDb('alice'), 'open', 'alice', { extra: { createdAt: Timestamp.fromMillis(0) } }),
    );
  });
});

// ---------------------------------------------------------------------------
// キャンセル・更新
// ---------------------------------------------------------------------------

describe('キャンセル', () => {
  it('本人のキャンセルは成功し、count が −1 される', async () => {
    await seedRegistration('open', 'alice');
    await assertSucceeds(cancel(userDb('alice'), 'open', 'alice'));
    await expectCount('open', 0);
  });

  it('キャンセル後にもう一度申し込める', async () => {
    await assertSucceeds(apply(userDb('alice'), 'open', 'alice'));
    await assertSucceeds(cancel(userDb('alice'), 'open', 'alice'));
    await assertSucceeds(apply(userDb('alice'), 'open', 'alice'));
    await expectCount('open', 1);
  });

  it('他人の申込は削除できない', async () => {
    await seedRegistration('open', 'bob');
    await assertFails(cancel(userDb('alice'), 'open', 'alice', 'bob'));
    await expectCount('open', 1);
  });

  it('count を減らさない削除は拒否', async () => {
    await seedRegistration('open', 'alice');
    await assertFails(deleteDoc(doc(userDb('alice'), 'events/open/registrations/alice')));
  });

  it('開催開始後のキャンセルは拒否', async () => {
    await seedEvent('started', { startAt: new Date(Date.now() - HOUR) });
    await seedRegistration('started', 'alice');
    await assertFails(cancel(userDb('alice'), 'started', 'alice'));
  });

  it('registration の更新は拒否', async () => {
    await seedRegistration('open', 'alice');
    await assertFails(updateDoc(doc(userDb('alice'), 'events/open/registrations/alice'), { name: '変更' }));
  });
});

// ---------------------------------------------------------------------------
// 読み取り
// ---------------------------------------------------------------------------

describe('読み取り', () => {
  it('イベントは未ログインでも読める', async () => {
    await assertSucceeds(getDoc(doc(guestDb(), 'events/open')));
  });

  it('イベントの作成・削除はできない', async () => {
    await assertFails(setDoc(doc(adminDb(), 'events/new'), { title: 'x' }));
    await assertFails(deleteDoc(doc(adminDb(), 'events/open')));
  });

  it('本人は自分の申込を読める', async () => {
    await seedRegistration('open', 'alice');
    await assertSucceeds(getDoc(doc(userDb('alice'), 'events/open/registrations/alice')));
  });

  it('管理者は申込一覧を読める', async () => {
    await seedRegistration('open', 'alice');
    await seedRegistration('open', 'bob');
    await assertSucceeds(getDocs(collection(adminDb(), 'events/open/registrations')));
  });

  it('一般ユーザーは他人の申込や申込一覧を読めない', async () => {
    await seedRegistration('open', 'bob');
    await assertFails(getDoc(doc(userDb('alice'), 'events/open/registrations/bob')));
    await assertFails(getDocs(collection(userDb('alice'), 'events/open/registrations')));
    await assertFails(getDocs(collection(guestDb(), 'events/open/registrations')));
  });

  it('メールアドレスが未確認なら管理者として扱わない', async () => {
    const db = env
      .authenticatedContext('admin', { email: ADMIN_EMAIL, email_verified: false })
      .firestore() as unknown as Firestore;
    await assertFails(getDocs(collection(db, 'events/open/registrations')));
  });

  it('config/admins は管理者だけが読め、誰も書けない', async () => {
    await assertSucceeds(getDoc(doc(adminDb(), 'config/admins')));
    await assertFails(getDoc(doc(userDb('alice'), 'config/admins')));
    await assertFails(setDoc(doc(adminDb(), 'config/admins'), { emails: ['x@example.com'] }));
  });
});
