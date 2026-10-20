// グループの作成、参加申し込み、承認、役割の変更、メンバーの削除のルール
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
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { createGroup, updateGroup, type GroupInput, type PersonInput } from '../../../web/src/lib/group';
import {
  approveApplication,
  changeRole,
  deleteApplication,
  getApplication,
  listApplications,
  removeMember,
  submitApplication,
  type Application,
  type ApplicationInput,
  type Role,
} from '../../../web/src/lib/membership';

const PROJECT_ID = 'demo-event-post';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firebase/firestore.next.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

const GROUP: GroupInput = { name: 'CoderDojo 奈良', description: '子どものためのプログラミング道場です。', ownerName: '奈良 太郎' };
const OWNER: PersonInput = { realName: '奈良 太郎', nickname: 'たろう' };
const APPLICATION: ApplicationInput = { realName: '山田 花子', nickname: 'はなこ', reason: '子どもと参加したいです。' };

async function seed(fn: (db: Firestore) => Promise<unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore() as unknown as Firestore);
  });
}

function emailOf(uid: string) {
  return `${uid}@example.com`;
}

function userOf(uid: string) {
  return { uid, email: emailOf(uid) };
}

function userDb(uid: string, token: Record<string, unknown> = {}): Firestore {
  return env
    .authenticatedContext(uid, { email: emailOf(uid), email_verified: true, ...token })
    .firestore() as unknown as Firestore;
}

function guestDb(): Firestore {
  return env.unauthenticatedContext().firestore() as unknown as Firestore;
}

/** グループと特権管理者（owner）を直接作る（ルールを迂回） */
async function seedGroup(ownerUid = 'owner') {
  await seed(async (db) => {
    await setDoc(doc(db, 'group', 'profile'), { ...GROUP, ownerUid, createdAt: Timestamp.now() });
    await seedMemberIn(db, ownerUid, 'owner');
  });
}

async function seedMemberIn(db: Firestore, uid: string, role: Role) {
  await setDoc(doc(db, 'members', uid), {
    uid,
    role,
    realName: `${uid} 本名`,
    nickname: uid,
    email: emailOf(uid),
    joinedAt: Timestamp.now(),
  });
}

async function seedMember(uid: string, role: Role) {
  await seed((db) => seedMemberIn(db, uid, role));
}

async function seedApplication(uid: string, input: ApplicationInput = APPLICATION): Promise<Application> {
  const app: Application = { uid, ...input, email: emailOf(uid), createdAt: Timestamp.now() };
  await seed((db) => setDoc(doc(db, 'applications', uid), app));
  return app;
}

async function exists(path: string): Promise<boolean> {
  let found = false;
  await seed(async (db) => {
    found = (await getDoc(doc(db, path))).exists();
  });
  return found;
}

async function roleOf(uid: string): Promise<Role | undefined> {
  let role: Role | undefined;
  await seed(async (db) => {
    role = (await getDoc(doc(db, 'members', uid))).data()?.role;
  });
  return role;
}

async function expectRole(uid: string, expected: Role | undefined) {
  const actual = await roleOf(uid);
  if (actual !== expected) throw new Error(`${uid} の役割は ${expected} のはずが ${actual}`);
}

beforeEach(async () => {
  await env.clearFirestore();
});

// ---------------------------------------------------------------------------
// グループの作成
// ---------------------------------------------------------------------------

describe('グループの作成', () => {
  it('グループがまだないとき、最初のユーザーが作成でき、特権管理者になる', async () => {
    await assertSucceeds(createGroup(userDb('alice'), userOf('alice'), GROUP, OWNER));
    await expectRole('alice', 'owner');
  });

  it('グループがすでにあると、ほかのユーザーは作成できない', async () => {
    await seedGroup('owner');
    await assertFails(createGroup(userDb('alice'), userOf('alice'), GROUP, OWNER));
    await expectRole('alice', undefined);
  });

  it('グループがすでにあると、特権管理者も作り直せない', async () => {
    await seedGroup('owner');
    await assertFails(createGroup(userDb('owner'), userOf('owner'), GROUP, OWNER));
  });

  it('members を作らずにグループだけ作ることはできない', async () => {
    const db = userDb('alice');
    await assertFails(
      setDoc(doc(db, 'group', 'profile'), { ...GROUP, ownerUid: 'alice', createdAt: serverTimestamp() }),
    );
  });

  it('グループを作らずに自分を owner にすることはできない', async () => {
    const db = userDb('alice');
    await assertFails(
      setDoc(doc(db, 'members', 'alice'), {
        uid: 'alice',
        role: 'owner',
        ...OWNER,
        email: emailOf('alice'),
        joinedAt: serverTimestamp(),
      }),
    );
  });

  it('他人を特権管理者にしてグループを作ることはできない', async () => {
    await assertFails(createGroup(userDb('alice'), userOf('bob'), GROUP, OWNER));
  });

  it('メールアドレスが auth token と違うと作成できない', async () => {
    await assertFails(createGroup(userDb('alice'), { uid: 'alice', email: 'other@example.com' }, GROUP, OWNER));
  });

  it('メールアドレスが未確認のユーザーは作成できない', async () => {
    await assertFails(createGroup(userDb('alice', { email_verified: false }), userOf('alice'), GROUP, OWNER));
  });

  it('グループ名が空・長すぎるときは作成できない', async () => {
    await assertFails(createGroup(userDb('alice'), userOf('alice'), { ...GROUP, name: '' }, OWNER));
    await assertFails(createGroup(userDb('alice'), userOf('alice'), { ...GROUP, name: 'あ'.repeat(101) }, OWNER));
  });

  it('本名が空のときは作成できない', async () => {
    await assertFails(createGroup(userDb('alice'), userOf('alice'), GROUP, { ...OWNER, realName: '' }));
  });

  it('説明は空でもよい', async () => {
    await assertSucceeds(createGroup(userDb('alice'), userOf('alice'), { ...GROUP, description: '' }, OWNER));
  });

  it('未ログインでは作成できない', async () => {
    const db = guestDb();
    const batch = writeBatch(db);
    batch.set(doc(db, 'group', 'profile'), { ...GROUP, ownerUid: 'x', createdAt: serverTimestamp() });
    await assertFails(batch.commit());
  });
});

// ---------------------------------------------------------------------------
// グループの情報
// ---------------------------------------------------------------------------

describe('グループの情報', () => {
  beforeEach(async () => {
    await seedGroup('owner');
    await seedMember('admin', 'admin');
  });

  it('未ログインでも読める', async () => {
    await assertSucceeds(getDoc(doc(guestDb(), 'group', 'profile')));
  });

  it('グループがまだなくても、読み取り自体は拒否されない', async () => {
    await env.clearFirestore();
    await assertSucceeds(getDoc(doc(guestDb(), 'group', 'profile')));
  });

  it('特権管理者は名前・説明・表示名を変えられる', async () => {
    await assertSucceeds(updateGroup(userDb('owner'), { ...GROUP, name: '新しい名前' }));
  });

  it('管理者は変えられない', async () => {
    await assertFails(updateGroup(userDb('admin'), { ...GROUP, name: '新しい名前' }));
  });

  it('特権管理者でも ownerUid は変えられない', async () => {
    await assertFails(updateDoc(doc(userDb('owner'), 'group', 'profile'), { ownerUid: 'admin' }));
  });

  it('特権管理者でも名前を空にはできない', async () => {
    await assertFails(updateGroup(userDb('owner'), { ...GROUP, name: '' }));
  });
});

// ---------------------------------------------------------------------------
// 参加申し込み
// ---------------------------------------------------------------------------

describe('参加申し込み', () => {
  beforeEach(async () => {
    await seedGroup('owner');
    await seedMember('admin', 'admin');
    await seedMember('member', 'member');
  });

  it('未登録のユーザーが申し込める', async () => {
    await assertSucceeds(submitApplication(userDb('alice'), userOf('alice'), APPLICATION));
  });

  it('グループがまだないと申し込めない', async () => {
    await env.clearFirestore();
    await assertFails(submitApplication(userDb('alice'), userOf('alice'), APPLICATION));
  });

  it('すでにメンバーなら申し込めない', async () => {
    await assertFails(submitApplication(userDb('member'), userOf('member'), APPLICATION));
  });

  it('他人の uid では申し込めない', async () => {
    await assertFails(submitApplication(userDb('alice'), userOf('bob'), APPLICATION));
  });

  it('メールアドレスが auth token と違うと申し込めない', async () => {
    await assertFails(
      submitApplication(userDb('alice'), { uid: 'alice', email: 'other@example.com' }, APPLICATION),
    );
  });

  it('メールアドレスが未確認のユーザーは申し込めない', async () => {
    await assertFails(submitApplication(userDb('alice', { email_verified: false }), userOf('alice'), APPLICATION));
  });

  it('未ログインでは申し込めない', async () => {
    await assertFails(
      setDoc(doc(guestDb(), 'applications', 'alice'), {
        uid: 'alice',
        ...APPLICATION,
        email: emailOf('alice'),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('本名・ニックネーム・理由が空なら申し込めない', async () => {
    const db = userDb('alice');
    await assertFails(submitApplication(db, userOf('alice'), { ...APPLICATION, realName: '' }));
    await assertFails(submitApplication(db, userOf('alice'), { ...APPLICATION, nickname: '' }));
    await assertFails(submitApplication(db, userOf('alice'), { ...APPLICATION, reason: '' }));
  });

  it('文字数の上限を超えると申し込めない', async () => {
    const db = userDb('alice');
    await assertSucceeds(submitApplication(db, userOf('alice'), { ...APPLICATION, reason: 'あ'.repeat(1000) }));
    await deleteApplication(db, 'alice');
    await assertFails(submitApplication(db, userOf('alice'), { ...APPLICATION, reason: 'あ'.repeat(1001) }));
    await assertFails(submitApplication(db, userOf('alice'), { ...APPLICATION, realName: 'あ'.repeat(101) }));
  });

  it('決められた項目以外は書けない', async () => {
    await assertFails(
      setDoc(doc(userDb('alice'), 'applications', 'alice'), {
        uid: 'alice',
        ...APPLICATION,
        email: emailOf('alice'),
        createdAt: serverTimestamp(),
        role: 'admin',
      }),
    );
  });

  it('申し込みの内容は書き換えられない', async () => {
    await seedApplication('alice');
    await assertFails(updateDoc(doc(userDb('alice'), 'applications', 'alice'), { reason: '変更' }));
  });

  it('本人と管理者は読めるが、ほかの参加者は読めない', async () => {
    await seedApplication('alice');
    await assertSucceeds(getApplication(userDb('alice'), 'alice'));
    await assertSucceeds(getApplication(userDb('admin'), 'alice'));
    await assertSucceeds(getApplication(userDb('owner'), 'alice'));
    await assertFails(getApplication(userDb('member'), 'alice'));
    await assertFails(getApplication(userDb('bob'), 'alice'));
  });

  it('管理者と特権管理者は一覧を読めるが、参加者と未登録のユーザーは読めない', async () => {
    await seedApplication('alice');
    await seedApplication('bob');
    await assertSucceeds(listApplications(userDb('admin')));
    await assertSucceeds(listApplications(userDb('owner')));
    await assertFails(listApplications(userDb('member')));
    await assertFails(listApplications(userDb('alice')));
    await assertFails(listApplications(guestDb()));
  });

  it('一覧は申込日時の古い順に並ぶ', async () => {
    const appAt = (uid: string, millis: number) => ({
      uid,
      ...APPLICATION,
      email: emailOf(uid),
      createdAt: Timestamp.fromMillis(millis),
    });
    await seed(async (db) => {
      await setDoc(doc(db, 'applications', 'bob'), appAt('bob', 2000));
      await setDoc(doc(db, 'applications', 'alice'), appAt('alice', 1000));
    });
    const list = await listApplications(userDb('admin'));
    const uids = list.map((a) => a.uid).join(',');
    if (uids !== 'alice,bob') throw new Error(`並び順が違います: ${uids}`);
  });

  it('本人は取り下げられる', async () => {
    await seedApplication('alice');
    await assertSucceeds(deleteApplication(userDb('alice'), 'alice'));
  });

  it('管理者は削除できるが、参加者は削除できない', async () => {
    await seedApplication('alice');
    await assertFails(deleteApplication(userDb('member'), 'alice'));
    await assertSucceeds(deleteApplication(userDb('admin'), 'alice'));
  });
});

// ---------------------------------------------------------------------------
// 承認
// ---------------------------------------------------------------------------

describe('承認', () => {
  let app: Application;

  beforeEach(async () => {
    await seedGroup('owner');
    await seedMember('admin', 'admin');
    await seedMember('member', 'member');
    app = await seedApplication('alice');
  });

  it('管理者は参加者として承認でき、申し込みは消える', async () => {
    await assertSucceeds(approveApplication(userDb('admin'), app, 'member'));
    await expectRole('alice', 'member');
    if (await exists('applications/alice')) throw new Error('申し込みが残っている');
  });

  it('管理者は管理者として承認できない', async () => {
    await assertFails(approveApplication(userDb('admin'), app, 'admin'));
    await expectRole('alice', undefined);
  });

  it('特権管理者は管理者として承認できる', async () => {
    await assertSucceeds(approveApplication(userDb('owner'), app, 'admin'));
    await expectRole('alice', 'admin');
  });

  it('owner として承認することはできない', async () => {
    await assertFails(approveApplication(userDb('owner'), app, 'owner' as never));
  });

  it('参加者は承認できない', async () => {
    await assertFails(approveApplication(userDb('member'), app, 'member'));
  });

  it('申込者本人は自分を承認できない', async () => {
    await assertFails(approveApplication(userDb('alice'), app, 'member'));
  });

  it('申し込みを消さずに members だけ作ることはできない', async () => {
    const db = userDb('admin');
    await assertFails(
      setDoc(doc(db, 'members', 'alice'), {
        uid: 'alice',
        role: 'member',
        realName: app.realName,
        nickname: app.nickname,
        email: app.email,
        joinedAt: serverTimestamp(),
      }),
    );
  });

  it('申し込みと違う名前やメールアドレスでは承認できない', async () => {
    const db = userDb('admin');
    await assertFails(approveApplication(db, { ...app, realName: '別の名前' }, 'member'));
    await assertFails(approveApplication(db, { ...app, email: 'other@example.com' }, 'member'));
  });

  it('申し込みのない人は承認できない', async () => {
    await assertFails(approveApplication(userDb('admin'), { ...app, uid: 'bob' }, 'member'));
  });
});

// ---------------------------------------------------------------------------
// メンバーの読み取り・役割の変更・削除
// ---------------------------------------------------------------------------

describe('メンバー', () => {
  beforeEach(async () => {
    await seedGroup('owner');
    await seedMember('admin', 'admin');
    await seedMember('admin2', 'admin');
    await seedMember('member', 'member');
    await seedMember('member2', 'member');
  });

  describe('読み取り', () => {
    it('本人は自分のメンバー情報を読める', async () => {
      await assertSucceeds(getDoc(doc(userDb('member'), 'members', 'member')));
    });

    it('参加者はほかのメンバーを読めない', async () => {
      await assertFails(getDoc(doc(userDb('member'), 'members', 'member2')));
    });

    it('管理者はほかのメンバーを読める', async () => {
      await assertSucceeds(getDoc(doc(userDb('admin'), 'members', 'member')));
    });

    it('未登録のユーザーは自分の uid なら読める（存在しないことの確認のため）', async () => {
      await assertSucceeds(getDoc(doc(userDb('alice'), 'members', 'alice')));
      await assertFails(getDoc(doc(userDb('alice'), 'members', 'member')));
    });
  });

  describe('役割の変更', () => {
    it('特権管理者は参加者を管理者にでき、管理者を参加者に戻せる', async () => {
      await assertSucceeds(changeRole(userDb('owner'), 'member', 'admin'));
      await expectRole('member', 'admin');
      await assertSucceeds(changeRole(userDb('owner'), 'admin', 'member'));
      await expectRole('admin', 'member');
    });

    it('管理者は役割を変えられない', async () => {
      await assertFails(changeRole(userDb('admin'), 'member', 'admin'));
    });

    it('参加者は自分を管理者にできない', async () => {
      await assertFails(changeRole(userDb('member'), 'member', 'admin'));
    });

    it('owner を付けることはできない', async () => {
      await assertFails(changeRole(userDb('owner'), 'admin', 'owner' as never));
    });

    it('特権管理者自身の役割は変えられない', async () => {
      await assertFails(changeRole(userDb('owner'), 'owner', 'member'));
    });

    it('役割以外の項目は書き換えられない', async () => {
      await assertFails(updateDoc(doc(userDb('owner'), 'members', 'member'), { realName: '変更' }));
      await assertFails(updateDoc(doc(userDb('member'), 'members', 'member'), { nickname: '変更' }));
    });
  });

  describe('削除', () => {
    it('管理者は参加者を削除できる', async () => {
      await assertSucceeds(removeMember(userDb('admin'), 'member'));
      await expectRole('member', undefined);
    });

    it('管理者はほかの管理者や特権管理者を削除できない', async () => {
      await assertFails(removeMember(userDb('admin'), 'admin2'));
      await assertFails(removeMember(userDb('admin'), 'owner'));
    });

    it('特権管理者は管理者を削除できる', async () => {
      await assertSucceeds(removeMember(userDb('owner'), 'admin'));
    });

    it('特権管理者は自分を削除できない', async () => {
      await assertFails(removeMember(userDb('owner'), 'owner'));
    });

    it('参加者はほかの参加者を削除できない', async () => {
      await assertFails(removeMember(userDb('member'), 'member2'));
    });

    it('削除された人は、もう一度申し込める', async () => {
      await removeMember(userDb('admin'), 'member');
      await assertSucceeds(submitApplication(userDb('member'), userOf('member'), APPLICATION));
    });
  });
});
