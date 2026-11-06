// 通知メール（scripts/next/lib/notify.ts）のテスト。Admin SDK でエミュレーターに接続し、
// 送信は偽の関数で受け取る（npm run test:next-rules）
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import type { Mail } from '../../../scripts/next/lib/messages';
import { MAX_CONSECUTIVE_FAILURES, runNotify, type NotifyOptions, type Recipient } from '../../../scripts/next/lib/notify';
import { EMULATOR_PROJECT_ID } from '../../../web/src/consts';

const app = initializeApp({ projectId: EMULATOR_PROJECT_ID }, 'next-notify-test');
const db = getFirestore(app);
const siteUrl = 'https://example.github.io/event-post';

async function clear() {
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${EMULATOR_PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
}

let clock = 0;
/** 書き込んだ順に日時が進むようにする */
function nextTime() {
  return Timestamp.fromMillis(Date.UTC(2026, 9, 1) + ++clock * 60_000);
}

async function addMember(uid: string, role: 'owner' | 'admin' | 'member', extra: Record<string, unknown> = {}) {
  await db.doc(`members/${uid}`).set({
    uid,
    role,
    realName: `${uid} 本名`,
    nickname: `${uid} さん`,
    email: `${uid}@example.org`,
    joinedAt: nextTime(),
    ...extra,
  });
}

async function addApplication(uid: string, extra: Record<string, unknown> = {}) {
  await db.doc(`applications/${uid}`).set({
    uid,
    realName: `${uid} 本名`,
    nickname: `${uid} さん`,
    reason: `${uid} の理由`,
    email: `${uid}@example.org`,
    createdAt: nextTime(),
    ...extra,
  });
}

function sender(failFor: string[] = []) {
  const sent: { to: Recipient; mail: Mail }[] = [];
  const send = async (to: Recipient, mail: Mail) => {
    if (failFor.includes(to.email)) throw new Error(`550 rejected: ${to.email}`);
    sent.push({ to, mail });
  };
  return { sent, send };
}

function run(overrides: Partial<NotifyOptions> = {}) {
  return runNotify({ db, siteUrl, send: async () => {}, dryRun: false, ...overrides });
}

async function data(path: string) {
  return (await db.doc(path).get()).data();
}

beforeEach(async () => {
  await clear();
  await db.doc('group/profile').set({
    name: 'テストの会',
    description: '',
    ownerName: '代表',
    ownerUid: 'owner',
    createdAt: nextTime(),
  });
  // 特権管理者と管理者は承認の通知を送り終えた状態にしておく
  await addMember('owner', 'owner');
  await addMember('admin', 'admin', { welcomedAt: nextTime() });
});
afterAll(async () => {
  await clear();
  await deleteApp(app);
});

describe('グループがないとき', () => {
  it('何も送らず、注意を返す', async () => {
    await clear();
    const { sent, send } = sender();
    const result = await run({ send });
    expect(sent).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });
});

describe('申し込みの通知', () => {
  it('新しい申し込みをまとめて、管理者全員に 1 通ずつ送り、次の回では送らない', async () => {
    await addMember('alice', 'member', { welcomedAt: nextTime() });
    await addApplication('bob');
    await addApplication('carol');
    await addApplication('dave', { notifiedAt: nextTime() });
    const { sent, send } = sender();

    const result = await run({ send });
    expect(sent.map((s) => s.to.email)).toEqual(['owner@example.org', 'admin@example.org']);
    expect(sent[0].mail.subject).toBe('【テストの会】新しい参加申し込みが 2 件あります');
    expect(sent[0].mail.text).toContain('bob 本名（bob さん）');
    expect(sent[0].mail.text).toContain('carol 本名（carol さん）');
    expect(sent[0].mail.text).not.toContain('dave');
    expect(result.notifiedApplications).toBe(2);
    expect((await data('applications/bob'))?.notifiedAt).toBeInstanceOf(Timestamp);
    expect((await data('applications/carol'))?.notifiedAt).toBeInstanceOf(Timestamp);

    await run({ send });
    expect(sent).toHaveLength(2);
  });

  it('新しい申し込みがなければ送らない', async () => {
    const { sent, send } = sender();
    await run({ send });
    expect(sent).toEqual([]);
  });

  it('管理者の 1 人にでも届けば通知済みにし、届かなかった分は失敗として返す', async () => {
    await addApplication('bob');
    const { sent, send } = sender(['admin@example.org']);

    const result = await run({ send });
    expect(sent.map((s) => s.to.email)).toEqual(['owner@example.org']);
    expect(result.failed).toEqual([{ kind: 'applications', uid: 'admin', error: '550 rejected: admin@example.org' }]);
    expect((await data('applications/bob'))?.notifiedAt).toBeInstanceOf(Timestamp);
  });

  it('誰にも届かなければ記録せず、次の回に送り直す', async () => {
    await addApplication('bob');
    const failing = sender(['owner@example.org', 'admin@example.org']);
    const result = await run({ send: failing.send });
    expect(result.failed).toHaveLength(2);
    expect(result.notifiedApplications).toBe(0);
    expect((await data('applications/bob'))?.notifiedAt).toBeUndefined();

    const { sent, send } = sender();
    await run({ send });
    expect(sent).toHaveLength(2);
  });
});

describe('承認の通知', () => {
  it('まだ送っていないメンバーに送って記録し、次の回では送らない', async () => {
    await addMember('alice', 'member');
    await addMember('erin', 'admin');
    const { sent, send } = sender();

    const result = await run({ send });
    expect(sent.map((s) => s.to)).toEqual([
      { name: 'alice 本名', email: 'alice@example.org' },
      { name: 'erin 本名', email: 'erin@example.org' },
    ]);
    expect(sent[0].mail.subject).toBe('【テストの会】参加が承認されました');
    expect(sent[0].mail.text.startsWith('alice さん さん\n')).toBe(true);
    expect(result.sent).toEqual([
      { kind: 'welcome', uid: 'alice' },
      { kind: 'welcome', uid: 'erin' },
    ]);
    expect((await data('members/alice'))?.welcomedAt).toBeInstanceOf(Timestamp);

    await run({ send });
    expect(sent).toHaveLength(2);
  });

  it('特権管理者には送らない', async () => {
    const { sent, send } = sender();
    await run({ send });
    expect(sent).toEqual([]);
    expect((await data('members/owner'))?.welcomedAt).toBeUndefined();
  });

  it('送れなかった人は記録せず、次の回に送り直す', async () => {
    await addMember('alice', 'member');
    await addMember('frank', 'member');
    const failing = sender(['alice@example.org']);
    const result = await run({ send: failing.send });
    expect(failing.sent.map((s) => s.to.email)).toEqual(['frank@example.org']);
    expect(result.failed.map((f) => f.uid)).toEqual(['alice']);
    expect((await data('members/alice'))?.welcomedAt).toBeUndefined();

    const { sent, send } = sender();
    await run({ send });
    expect(sent.map((s) => s.to.email)).toEqual(['alice@example.org']);
  });
});

describe('失敗が続いたとき', () => {
  it(`${MAX_CONSECUTIVE_FAILURES} 回続けて失敗したら、残りは送らずに止める`, async () => {
    const uids = ['m1', 'm2', 'm3', 'm4', 'm5'];
    for (const uid of uids) await addMember(uid, 'member');
    const attempted: string[] = [];
    const send = async (to: Recipient) => {
      attempted.push(to.email);
      throw new Error('421 too many');
    };

    const result = await run({ send });
    expect(attempted).toHaveLength(MAX_CONSECUTIVE_FAILURES);
    expect(result.failed).toHaveLength(MAX_CONSECUTIVE_FAILURES);
    expect(result.stopped).toBe(true);
    for (const uid of uids) expect((await data(`members/${uid}`))?.welcomedAt).toBeUndefined();
  });
});

describe('dryRun', () => {
  it('送信も書き込みもせず、送る予定だけを返す', async () => {
    await addApplication('bob');
    await addMember('alice', 'member');
    const { sent, send } = sender();

    const result = await run({ send, dryRun: true });
    expect(sent).toEqual([]);
    expect(result.sent).toEqual([
      { kind: 'applications', uid: 'owner' },
      { kind: 'applications', uid: 'admin' },
      { kind: 'welcome', uid: 'alice' },
    ]);
    expect(result.notifiedApplications).toBe(1);
    expect((await data('applications/bob'))?.notifiedAt).toBeUndefined();
    expect((await data('members/alice'))?.welcomedAt).toBeUndefined();
  });
});
