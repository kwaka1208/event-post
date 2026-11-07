// 通知メール（scripts/lib/notify.ts）のテスト。Admin SDK でエミュレーターに接続し、
// 送信は偽の関数で受け取る（npm run test:rules）
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import type { Mail } from '../../scripts/lib/messages';
import {
  MAX_CONSECUTIVE_FAILURES,
  MAX_MAIL_ATTEMPTS,
  runNotify,
  type NotifyOptions,
  type Recipient,
} from '../../scripts/lib/notify';
import { EMULATOR_PROJECT_ID } from '../../web/src/consts';

const app = initializeApp({ projectId: EMULATOR_PROJECT_ID }, 'notify-test');
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

describe('受付メールとリマインド', () => {
  // 開催は 2026-12-05 10:00（JST）
  const startAt = new Date('2026-12-05T10:00:00+09:00');
  const before = new Date('2026-12-01T12:00:00+09:00');
  const remindTime = new Date('2026-12-04T18:30:00+09:00');

  async function addEvent(id: string, extra: Record<string, unknown> = {}) {
    await db.doc(`events/${id}`).set({
      title: `${id} のイベント`,
      body: '',
      startAt: Timestamp.fromDate(startAt),
      endAt: Timestamp.fromMillis(startAt.getTime() + 2 * 60 * 60 * 1000),
      deadlineAt: Timestamp.fromDate(startAt),
      venue: '公民館',
      address: '',
      capacity: null,
      published: true,
      registrationCount: 0,
      createdAt: nextTime(),
      updatedAt: nextTime(),
      ...extra,
    });
  }

  async function addRegistration(eventId: string, uid: string, extra: Record<string, unknown> = {}) {
    await db.doc(`events/${eventId}/registrations/${uid}`).set({
      uid,
      realName: `${uid} 本名`,
      nickname: `${uid} さん`,
      email: `${uid}@example.org`,
      createdAt: nextTime(),
      ...extra,
    });
  }

  it('申込者に受付メールを送って記録し、次の回では送らない', async () => {
    await addEvent('ev1');
    await addRegistration('ev1', 'a');
    await addRegistration('ev1', 'b');
    const { sent, send } = sender();

    const result = await run({ send, now: before });
    expect(sent.map((s) => s.to.email)).toEqual(['a@example.org', 'b@example.org']);
    expect(sent[0].mail.subject).toBe('【テストの会】お申し込みを受け付けました：ev1 のイベント');
    expect(sent[0].mail.text).toContain(`${siteUrl}/events/ev1`);
    expect(result.sent.map((d) => d.kind)).toEqual(['confirmation', 'confirmation']);
    expect((await data('events/ev1/registrations/a'))?.confirmedAt).toBeDefined();

    const again = sender();
    await run({ send: again.send, now: before });
    expect(again.sent).toEqual([]);
  });

  it('前日の指定の時刻を過ぎたら、リマインドを送って記録する', async () => {
    await addEvent('ev1');
    await addRegistration('ev1', 'a', { confirmedAt: nextTime() });
    const { sent, send } = sender();

    await run({ send, now: remindTime, reminderHour: 18 });
    expect(sent.map((s) => s.mail.subject)).toEqual(['【テストの会】明日開催：ev1 のイベント']);
    expect((await data('events/ev1/registrations/a'))?.remindedAt).toBeDefined();

    const again = sender();
    await run({ send: again.send, now: remindTime, reminderHour: 18 });
    expect(again.sent).toEqual([]);
  });

  it('指定の時刻より前なら、リマインドを送らない', async () => {
    await addEvent('ev1');
    await addRegistration('ev1', 'a', { confirmedAt: nextTime() });
    const { sent, send } = sender();
    await run({ send, now: remindTime, reminderHour: 20 });
    expect(sent).toEqual([]);
  });

  it('リマインドの時間帯に申し込んだ人には、受付メールとリマインドを続けて送る', async () => {
    await addEvent('ev1');
    await addRegistration('ev1', 'a');
    const { sent, send } = sender();
    const result = await run({ send, now: remindTime, reminderHour: 18 });
    expect(result.sent.map((d) => d.kind)).toEqual(['confirmation', 'reminder']);
    expect(sent).toHaveLength(2);
  });

  it('開始したイベント、下書きのイベントには送らない', async () => {
    await addEvent('started');
    await addEvent('draft', { published: false });
    await addRegistration('started', 'a');
    await addRegistration('draft', 'b');
    const { sent, send } = sender();
    await run({ send, now: new Date('2026-12-05T10:30:00+09:00') });
    await run({ send, now: before });
    // 開始前の回では、下書きでない started にだけ受付メールを送る
    expect(sent.map((s) => s.to.email)).toEqual(['a@example.org']);
  });

  it('送れなかった人は記録せず、次の回に送り直す', async () => {
    await addEvent('ev1');
    await addRegistration('ev1', 'a');
    await run({ send: sender(['a@example.org']).send, now: before });
    expect((await data('events/ev1/registrations/a'))?.confirmedAt).toBeUndefined();
    const retry = sender();
    await run({ send: retry.send, now: before });
    expect(retry.sent).toHaveLength(1);
  });

  it('送信中にキャンセルされた申込は、記録できなくても止まらない', async () => {
    await addEvent('ev1');
    await addRegistration('ev1', 'a');
    await addRegistration('ev1', 'b');
    const send = async (to: Recipient) => {
      if (to.email === 'a@example.org') await db.doc('events/ev1/registrations/a').delete();
    };
    const result = await run({ send, now: before });
    expect(result.sent).toHaveLength(2);
    expect((await data('events/ev1/registrations/b'))?.confirmedAt).toBeDefined();
  });

  it('dryRun では、送らず記録もしない', async () => {
    await addEvent('ev1');
    await addRegistration('ev1', 'a');
    const { sent, send } = sender();
    const result = await run({ send, now: remindTime, dryRun: true });
    expect(sent).toEqual([]);
    expect(result.sent).toEqual([
      { kind: 'confirmation', uid: 'a', eventId: 'ev1' },
      { kind: 'reminder', uid: 'a', eventId: 'ev1' },
    ]);
    expect((await data('events/ev1/registrations/a'))?.confirmedAt).toBeUndefined();
  });
});

describe('管理者のメール', () => {
  const to = (uid: string) => ({ uid, name: `${uid} 本名`, email: `${uid}@example.org` });

  async function addMail(id: string, recipients: string[], extra: Record<string, unknown> = {}) {
    await db.doc(`mails/${id}`).set({
      subject: '次回のお知らせ',
      body: '来週の日曜日に集まります。',
      recipients: recipients.map(to),
      createdByUid: 'admin',
      createdByName: 'admin 本名',
      createdAt: nextTime(),
      status: 'pending',
      ...extra,
    });
  }

  it('宛先に 1 人ずつ送り、全員に届いたら送信済みにして、次の回では送らない', async () => {
    await addMail('m1', ['a', 'b']);
    const { sent, send } = sender();

    const result = await run({ send });
    expect(sent.map((s) => s.to.email)).toEqual(['a@example.org', 'b@example.org']);
    expect(sent[0].mail.subject).toBe('【テストの会】次回のお知らせ');
    expect(sent[0].mail.text).toContain('来週の日曜日に集まります。');
    expect(result.completedMails).toBe(1);
    const saved = await data('mails/m1');
    expect(saved?.status).toBe('sent');
    expect(saved?.deliveredUids).toEqual(['a', 'b']);
    expect(saved?.sentAt).toBeDefined();

    const again = sender();
    await run({ send: again.send });
    expect(again.sent).toEqual([]);
  });

  it('書いた順に送る', async () => {
    await addMail('first', ['a']);
    await addMail('second', ['b']);
    const { sent, send } = sender();
    await run({ send });
    expect(sent.map((s) => s.to.email)).toEqual(['a@example.org', 'b@example.org']);
  });

  it('届かなかった宛先は、次の回にその人だけへ送り直す', async () => {
    await addMail('m1', ['a', 'bad', 'c']);
    const first = sender(['bad@example.org']);
    await run({ send: first.send });
    let saved = await data('mails/m1');
    expect(saved?.status).toBe('pending');
    expect(saved?.deliveredUids).toEqual(['a', 'c']);
    expect(saved?.failedUids).toEqual(['bad']);
    expect(saved?.attempts).toBe(1);

    const second = sender();
    const result = await run({ send: second.send });
    expect(second.sent.map((s) => s.to.email)).toEqual(['bad@example.org']);
    expect(result.completedMails).toBe(1);
    saved = await data('mails/m1');
    expect(saved?.status).toBe('sent');
    expect(saved?.failedUids).toEqual([]);
  });

  it(`届かない宛先が ${MAX_MAIL_ATTEMPTS} 回続いたら、一部失敗として送り直しをやめる`, async () => {
    await addMail('m1', ['a', 'bad']);
    let result;
    for (let i = 0; i < MAX_MAIL_ATTEMPTS; i++) result = await run({ send: sender(['bad@example.org']).send });
    expect(result?.failedMails).toBe(1);
    const saved = await data('mails/m1');
    expect(saved?.status).toBe('failed');
    expect(saved?.attempts).toBe(MAX_MAIL_ATTEMPTS);
    expect(saved?.deliveredUids).toEqual(['a']);

    const after = sender();
    await run({ send: after.send });
    expect(after.sent).toEqual([]);
  });

  it('失敗が続いて送信をやめたときは、送り直しの回数に数えない', async () => {
    await addMail('m1', ['a', 'b', 'c', 'd']);
    const send = async () => {
      throw new Error('421 too many');
    };
    const result = await run({ send });
    expect(result.stopped).toBe(true);
    const saved = await data('mails/m1');
    expect(saved?.status).toBe('pending');
    expect(saved?.attempts).toBeUndefined();
  });

  it('送信済み・一部失敗のメールは送らない', async () => {
    await addMail('done', ['a'], { status: 'sent' });
    await addMail('gave-up', ['b'], { status: 'failed' });
    const { sent, send } = sender();
    await run({ send });
    expect(sent).toEqual([]);
  });

  it('dryRun では、送らず記録もしない', async () => {
    await addMail('m1', ['a', 'b']);
    const { sent, send } = sender();
    const result = await run({ send, dryRun: true });
    expect(sent).toEqual([]);
    expect(result.sent).toEqual([
      { kind: 'mail', uid: 'a', mailId: 'm1' },
      { kind: 'mail', uid: 'b', mailId: 'm1' },
    ]);
    expect((await data('mails/m1'))?.deliveredUids).toBeUndefined();
  });

  it('送信中に削除されたメールは、残りの宛先に送らない', async () => {
    await addMail('m1', ['a', 'b', 'c']);
    const sentTo: string[] = [];
    const send = async (r: Recipient) => {
      sentTo.push(r.email);
      if (sentTo.length === 1) await db.doc('mails/m1').delete();
    };
    const result = await run({ send });
    expect(sentTo).toEqual(['a@example.org']);
    expect(result.completedMails).toBe(0);
    expect((await db.doc('mails/m1').get()).exists).toBe(false);
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
