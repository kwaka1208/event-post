// 掲示板（topics と replies）のルール
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
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import {
  canDeletePost,
  createTopic,
  deleteReply,
  deleteTopic,
  getTopic,
  listReplies,
  listTopics,
  reply,
} from '../../web/src/lib/board';
import type { Member, Role } from '../../web/src/lib/membership';

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

function memberOf(uid: string, role: Role): Member {
  return { uid, role, realName: `${uid} 本名`, nickname: `${uid}さん`, email: `${uid}@example.com`, joinedAt: Timestamp.now() };
}

const owner = memberOf('owner', 'owner');
const admin = memberOf('admin', 'admin');
const alice = memberOf('alice', 'member');
const bob = memberOf('bob', 'member');

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

const db = {
  owner: () => userDb('owner'),
  admin: () => userDb('admin'),
  alice: () => userDb('alice'),
  bob: () => userDb('bob'),
  /** メンバーでない、ログインした人 */
  stranger: () => userDb('stranger'),
  guest: () => env.unauthenticatedContext().firestore() as unknown as Firestore,
};

beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (s) => {
    for (const m of [owner, admin, alice, bob]) await setDoc(doc(s, 'members', m.uid), m);
  });
});

/** alice が立てた話題と、bob の返信を 1 件用意する */
async function seedTopic(): Promise<{ topicId: string; replyId: string }> {
  const topicId = await createTopic(db.alice(), alice, { title: '雑談', body: 'はじめまして' });
  await reply(db.bob(), bob, topicId, 'よろしくお願いします');
  const replies = await listReplies(db.alice(), topicId);
  return { topicId, replyId: replies[0]!.id };
}

describe('話題', () => {
  it('メンバーが立てて、メンバー全員が読める', async () => {
    const id = await assertSucceeds(createTopic(db.alice(), alice, { title: '雑談', body: 'はじめまして' }));
    const topics = await listTopics(db.bob());
    expect(topics.map((t) => t.id)).toEqual([id]);
    expect(topics[0]).toMatchObject({ uid: 'alice', nickname: 'aliceさん', title: '雑談', lastReplyId: null });
    await assertSucceeds(getTopic(db.admin(), id));
  });

  it('メンバーでない人とログインしていない人は、読めず、立てられない', async () => {
    const { topicId } = await seedTopic();
    await assertFails(getTopic(db.stranger(), topicId));
    await assertFails(getTopic(db.guest(), topicId));
    await assertFails(listTopics(db.stranger()));
    await assertFails(
      createTopic(db.stranger(), memberOf('stranger', 'member'), { title: 'こんにちは', body: '本文' }),
    );
  });

  it('ほかの人の名前やニックネームでは立てられない', async () => {
    await assertFails(createTopic(db.alice(), bob, { title: '雑談', body: '本文' }));
    await assertFails(createTopic(db.alice(), { ...alice, nickname: '別の名前' }, { title: '雑談', body: '本文' }));
  });

  it('タイトルと本文は空にできず、上限を超えられない', async () => {
    await assertFails(createTopic(db.alice(), alice, { title: '', body: '本文' }));
    await assertFails(createTopic(db.alice(), alice, { title: '雑談', body: '' }));
    await assertFails(createTopic(db.alice(), alice, { title: 'あ'.repeat(101), body: '本文' }));
    await assertFails(createTopic(db.alice(), alice, { title: '雑談', body: 'あ'.repeat(5001) }));
    await assertSucceeds(createTopic(db.alice(), alice, { title: 'あ'.repeat(100), body: 'あ'.repeat(5000) }));
  });

  it('余計な項目や、最初から返信があることにはできない', async () => {
    const base = {
      uid: 'alice',
      nickname: 'aliceさん',
      title: '雑談',
      body: '本文',
      createdAt: serverTimestamp(),
      lastPostedAt: serverTimestamp(),
      lastReplyId: null,
    };
    await assertFails(setDoc(doc(collection(db.alice(), 'topics')), { ...base, pinned: true }));
    await assertFails(setDoc(doc(collection(db.alice(), 'topics')), { ...base, lastReplyId: 'x' }));
    await assertSucceeds(setDoc(doc(collection(db.alice(), 'topics')), base));
  });

  it('内容は書き換えられない', async () => {
    const { topicId } = await seedTopic();
    await assertFails(updateDoc(doc(db.alice(), 'topics', topicId), { title: '書き換え' }));
    await assertFails(updateDoc(doc(db.admin(), 'topics', topicId), { body: '書き換え' }));
  });

  it('返信なしに、最後の投稿日時だけを進めることはできない', async () => {
    const { topicId, replyId } = await seedTopic();
    await assertFails(
      updateDoc(doc(db.bob(), 'topics', topicId), { lastPostedAt: serverTimestamp(), lastReplyId: 'nothing' }),
    );
    // すでにある返信を指しても進められない
    await assertFails(
      updateDoc(doc(db.bob(), 'topics', topicId), { lastPostedAt: serverTimestamp(), lastReplyId: replyId }),
    );
  });

  it('立てた人と管理者は消せる（返信も消える）。ほかの参加者は消せない', async () => {
    const first = await seedTopic();
    await assertFails(deleteTopic(db.bob(), first.topicId));
    await assertSucceeds(deleteTopic(db.alice(), first.topicId));
    expect(await listTopics(db.alice())).toEqual([]);
    await seed(async (s) => {
      expect((await getDocs(collection(s, 'topics', first.topicId, 'replies'))).size).toBe(0);
    });

    const second = await seedTopic();
    await assertSucceeds(deleteTopic(db.admin(), second.topicId));
    const third = await seedTopic();
    await assertSucceeds(deleteTopic(db.owner(), third.topicId));
  });
});

describe('返信', () => {
  it('メンバーが返信すると、話題が一覧の上に来る', async () => {
    const older = await createTopic(db.alice(), alice, { title: '古い話題', body: '本文' });
    const newer = await createTopic(db.alice(), alice, { title: '新しい話題', body: '本文' });
    expect((await listTopics(db.bob())).map((t) => t.id)).toEqual([newer, older]);

    await assertSucceeds(reply(db.bob(), bob, older, '返信です'));
    const topics = await listTopics(db.bob());
    expect(topics.map((t) => t.id)).toEqual([older, newer]);
    const replies = await listReplies(db.alice(), older);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ uid: 'bob', nickname: 'bobさん', body: '返信です' });
    expect(topics[0]!.lastReplyId).toBe(replies[0]!.id);
  });

  it('話題の最後の投稿日時を進めずには返信できない', async () => {
    const { topicId } = await seedTopic();
    await assertFails(
      setDoc(doc(collection(db.bob(), 'topics', topicId, 'replies')), {
        uid: 'bob',
        nickname: 'bobさん',
        body: '返信',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('ない話題には返信できない', async () => {
    const bobDb = db.bob();
    const batch = writeBatch(bobDb);
    batch.set(doc(bobDb, 'topics', 'nothing', 'replies', 'r1'), {
      uid: 'bob',
      nickname: 'bobさん',
      body: '返信',
      createdAt: serverTimestamp(),
    });
    await assertFails(batch.commit());
    await assertFails(reply(db.bob(), bob, 'nothing', '返信'));
  });

  it('メンバーでない人や、ほかの人の名前では返信できない', async () => {
    const { topicId } = await seedTopic();
    await assertFails(reply(db.stranger(), memberOf('stranger', 'member'), topicId, '返信'));
    await assertFails(reply(db.alice(), bob, topicId, '返信'));
    await assertFails(reply(db.alice(), { ...alice, nickname: '別の名前' }, topicId, '返信'));
    await assertFails(listReplies(db.stranger(), topicId));
  });

  it('本文は空にできず、上限を超えられない', async () => {
    const { topicId } = await seedTopic();
    await assertFails(reply(db.alice(), alice, topicId, ''));
    await assertFails(reply(db.alice(), alice, topicId, 'あ'.repeat(5001)));
  });

  it('内容は書き換えられない', async () => {
    const { topicId, replyId } = await seedTopic();
    await assertFails(updateDoc(doc(db.bob(), 'topics', topicId, 'replies', replyId), { body: '書き換え' }));
  });

  it('書いた人、管理者、話題を立てた人は消せる。ほかの参加者は消せない', async () => {
    const carol = memberOf('carol', 'member');
    await seed((s) => setDoc(doc(s, 'members', 'carol'), carol));

    const a = await seedTopic();
    await assertFails(deleteReply(userDb('carol'), a.topicId, a.replyId));
    await assertSucceeds(deleteReply(db.bob(), a.topicId, a.replyId));

    const b = await seedTopic();
    await assertSucceeds(deleteReply(db.alice(), b.topicId, b.replyId));

    const c = await seedTopic();
    await assertSucceeds(deleteReply(db.admin(), c.topicId, c.replyId));
  });
});

describe('canDeletePost', () => {
  it('ルールと同じ条件', () => {
    expect(canDeletePost(alice, 'alice')).toBe(true);
    expect(canDeletePost(bob, 'alice')).toBe(false);
    expect(canDeletePost(admin, 'alice')).toBe(true);
    expect(canDeletePost(owner, 'alice')).toBe(true);
    expect(canDeletePost(alice, 'bob', 'alice')).toBe(true);
    expect(canDeletePost(bob, 'carol', 'alice')).toBe(false);
  });
});
