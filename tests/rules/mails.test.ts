// 管理者が書いたメール（mails）のルール
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
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { createMail, deleteMail, listMails, recipientOf, type MailInput } from '../../web/src/lib/mails';
import type { Member, Role } from '../../web/src/lib/membership';

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

function memberOf(uid: string, role: Role): Member {
  return { uid, role, realName: `${uid} 本名`, nickname: uid, email: `${uid}@example.com`, joinedAt: Timestamp.now() };
}

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

const INPUT: MailInput = {
  subject: '次回のお知らせ',
  body: '来週の日曜日に集まります。',
  recipients: [recipientOf(memberOf('alice', 'member')), recipientOf(memberOf('bob', 'member'))],
};

/** メールを直接作る（Actions が送信状況を書いた状態などを作るため） */
async function seedMail(id: string, extra: Record<string, unknown> = {}) {
  await seed((db) =>
    setDoc(doc(db, 'mails', id), {
      ...INPUT,
      createdByUid: 'admin',
      createdByName: 'admin 本名',
      createdAt: Timestamp.now(),
      status: 'pending',
      ...extra,
    }),
  );
}

function rawCreate(db: Firestore, data: Record<string, unknown>) {
  return setDoc(doc(collection(db, 'mails')), {
    ...INPUT,
    createdByUid: 'admin',
    createdByName: 'admin 本名',
    createdAt: serverTimestamp(),
    status: 'pending',
    ...data,
  });
}

beforeEach(async () => {
  await env.clearFirestore();
  for (const [uid, role] of [['owner', 'owner'], ['admin', 'admin'], ['alice', 'member']] as const) {
    await seed((db) => setDoc(doc(db, 'members', uid), memberOf(uid, role)));
  }
});

describe('作成', () => {
  it('管理者と特権管理者は送信待ちで作成できる', async () => {
    await assertSucceeds(createMail(userDb('admin'), memberOf('admin', 'admin'), INPUT));
    await assertSucceeds(createMail(userDb('owner'), memberOf('owner', 'owner'), INPUT));
  });

  it('参加者は作成できない', async () => {
    await assertFails(createMail(userDb('alice'), memberOf('alice', 'member'), INPUT));
  });

  it('書いた人をほかの人にしたり、名前を変えたりできない', async () => {
    await assertFails(createMail(userDb('admin'), memberOf('owner', 'owner'), INPUT));
    await assertFails(rawCreate(userDb('admin'), { createdByName: '別の名前' }));
  });

  it('送信済みなど、送信待ち以外の状態では作成できない', async () => {
    await assertFails(rawCreate(userDb('admin'), { status: 'sent' }));
  });

  it('件名や本文が空、または長すぎると作成できない', async () => {
    const me = memberOf('admin', 'admin');
    await assertFails(createMail(userDb('admin'), me, { ...INPUT, subject: '' }));
    await assertFails(createMail(userDb('admin'), me, { ...INPUT, body: '' }));
    await assertFails(createMail(userDb('admin'), me, { ...INPUT, subject: 'あ'.repeat(201) }));
    await assertFails(createMail(userDb('admin'), me, { ...INPUT, body: 'あ'.repeat(10001) }));
  });

  it('宛先は 1〜500 人', async () => {
    const me = memberOf('admin', 'admin');
    const many = (n: number) => Array.from({ length: n }, (_, i) => recipientOf(memberOf(`m${i}`, 'member')));
    await assertFails(createMail(userDb('admin'), me, { ...INPUT, recipients: [] }));
    await assertSucceeds(createMail(userDb('admin'), me, { ...INPUT, recipients: many(500) }));
    await assertFails(createMail(userDb('admin'), me, { ...INPUT, recipients: many(501) }));
  });

  it('送信状況の項目を足して作成できない', async () => {
    await assertFails(rawCreate(userDb('admin'), { deliveredUids: ['alice'] }));
  });
});

describe('読み取り', () => {
  it('管理者は一覧を読めるが、参加者は読めない', async () => {
    await seedMail('m1');
    const mails = await assertSucceeds(listMails(userDb('admin')));
    expect(mails.map((m) => m.id)).toEqual(['m1']);
    await assertFails(listMails(userDb('alice')));
    await assertFails(getDoc(doc(userDb('alice'), 'mails', 'm1')));
  });
});

describe('変更と削除', () => {
  it('内容は変えられない', async () => {
    await seedMail('m1');
    await assertFails(updateDoc(doc(userDb('admin'), 'mails', 'm1'), { subject: '書き換え' }));
    await assertFails(updateDoc(doc(userDb('admin'), 'mails', 'm1'), { status: 'sent' }));
  });

  it('送信前なら、管理者が削除できる（書いた人でなくても）', async () => {
    await seedMail('m1');
    await assertSucceeds(deleteMail(userDb('owner'), 'm1'));
  });

  it('送信済みや、送り始めたメールは削除できない', async () => {
    await seedMail('sent', { status: 'sent', deliveredUids: ['alice', 'bob'] });
    await seedMail('partway', { status: 'pending', deliveredUids: ['alice'] });
    await seedMail('failed', { status: 'failed', deliveredUids: [] });
    await assertFails(deleteMail(userDb('admin'), 'sent'));
    await assertFails(deleteMail(userDb('admin'), 'partway'));
    await assertFails(deleteMail(userDb('admin'), 'failed'));
  });

  it('参加者は削除できない', async () => {
    await seedMail('m1');
    await assertFails(deleteMail(userDb('alice'), 'm1'));
  });
});
