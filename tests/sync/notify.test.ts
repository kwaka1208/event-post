// notify のテスト。Admin SDK でエミュレーターに接続し、送信は偽の関数で受け取る（npm run test:rules）
import { resolve } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { configSchema } from '../../app/src/lib/schema';
import { parseEventFile, type SiteEvent } from '../../scripts/lib/load-site';
import { loadTemplate, type Mail } from '../../scripts/lib/mail';
import { runNotify, type NotifyOptions, type Recipient } from '../../scripts/lib/notify';
import { syncFirestore } from '../../scripts/lib/sync';

const PROJECT_ID = 'demo-event-post';
const app = initializeApp({ projectId: PROJECT_ID }, 'notify-test');
const db = getFirestore(app);

const config = configSchema.parse({
  group: { name: 'CoderDojo 奈良', contact_email: 'info@example.org' },
  admins: ['organizer@example.org'],
  firebase: { apiKey: 'k', authDomain: 'x.firebaseapp.com', projectId: PROJECT_ID, appId: 'a' },
  mail: { reminder_hour: 18 },
  retention_days: 30,
});

const templateDir = resolve(import.meta.dirname, '../../site/templates');
const templates = { confirmation: loadTemplate('confirmation', templateDir), reminder: loadTemplate('reminder', templateDir) };

// 2026-11-20 13:00 JST 開始。リマインドは 11-19 18:00〜24:00 JST
function event(id: string): SiteEvent {
  return parseEventFile(
    `${id}.md`,
    `---\ntitle: ${id} の会\ndate: 2026-11-20\nstart: "13:00"\nend: "16:00"\nvenue: 公民館\n---\n`,
  );
}

const BEFORE = new Date('2026-11-10T03:00:00Z'); // 11-10 12:00 JST
const REMINDER_TIME = new Date('2026-11-19T10:00:00Z'); // 11-19 19:00 JST
const BEFORE_REMINDER = new Date('2026-11-19T08:00:00Z'); // 11-19 17:00 JST
const AFTER_START = new Date('2026-11-20T05:00:00Z'); // 11-20 14:00 JST
const AFTER_RETENTION = new Date('2027-01-10T03:00:00Z');

async function register(eventId: string, uid: string, extra: Record<string, unknown> = {}) {
  await db.doc(`events/${eventId}/registrations/${uid}`).set({
    uid,
    name: `${uid} さん`,
    email: `${uid}@example.org`,
    answers: {},
    createdAt: Timestamp.fromDate(new Date('2026-11-01T00:00:00Z')),
    ...extra,
  });
  await db.doc(`events/${eventId}`).update({ count: (await db.doc(`events/${eventId}`).get()).get('count') + 1 });
}

function sender(failFor: string[] = []) {
  const sent: { to: Recipient; mail: Mail }[] = [];
  const send = async (to: Recipient, mail: Mail) => {
    if (failFor.includes(to.email)) throw new Error(`550 rejected: ${to.email}`);
    sent.push({ to, mail });
  };
  return { sent, send };
}

function run(now: Date, overrides: Partial<NotifyOptions> = {}) {
  return runNotify({
    db,
    config,
    events: [event('a')],
    templates,
    eventUrl: (id) => `https://example.github.io/repo/events/${id}/`,
    send: async () => {},
    now,
    dryRun: false,
    ...overrides,
  });
}

async function reg(eventId: string, uid: string) {
  return (await db.doc(`events/${eventId}/registrations/${uid}`).get()).data();
}

async function clear() {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {
    method: 'DELETE',
  });
}

beforeEach(async () => {
  await clear();
  await syncFirestore(db, config, [event('a')]);
});
afterAll(async () => {
  await clear();
  await deleteApp(app);
});

describe('受付メール', () => {
  it('未送信の申込に送って記録し、次の回では送らない', async () => {
    await register('a', 'u1');
    await register('a', 'u2', { confirmationSentAt: Timestamp.now() });
    const { sent, send } = sender();

    const result = await run(BEFORE, { send });
    expect(sent.map((s) => s.to)).toEqual([{ name: 'u1 さん', email: 'u1@example.org' }]);
    expect(sent[0].mail.subject).toBe('【CoderDojo 奈良】お申し込みを受け付けました：a の会');
    expect(sent[0].mail.text).toContain('https://example.github.io/repo/events/a/');
    expect(result.sent).toEqual([{ eventId: 'a', uid: 'u1', kind: 'confirmation' }]);
    expect((await reg('a', 'u1'))?.confirmationSentAt).toBeInstanceOf(Timestamp);

    await run(BEFORE, { send });
    expect(sent).toHaveLength(1);
  });

  it('confirmation: false なら送らない', async () => {
    await register('a', 'u1');
    const { sent, send } = sender();
    await run(BEFORE, { send, config: { ...config, mail: { ...config.mail, confirmation: false } } });
    expect(sent).toEqual([]);
  });

  it('開催開始後は送らず、記録もしない', async () => {
    await register('a', 'u1');
    const { sent, send } = sender();
    await run(AFTER_START, { send });
    expect(sent).toEqual([]);
    expect((await reg('a', 'u1'))?.confirmationSentAt).toBeUndefined();
  });
});

describe('リマインド', () => {
  it('前日の reminder_hour 以降に、未送信の申込に送る', async () => {
    await register('a', 'u1', { confirmationSentAt: Timestamp.now() });
    await register('a', 'u2', { confirmationSentAt: Timestamp.now(), remindedAt: Timestamp.now() });
    const { sent, send } = sender();

    await run(BEFORE_REMINDER, { send });
    expect(sent).toEqual([]);

    await run(REMINDER_TIME, { send });
    expect(sent.map((s) => [s.to.email, s.mail.subject])).toEqual([
      ['u1@example.org', '【CoderDojo 奈良】明日開催：a の会'],
    ]);
    expect((await reg('a', 'u1'))?.remindedAt).toBeInstanceOf(Timestamp);
  });

  it('受付メールが未送信なら、両方送る', async () => {
    await register('a', 'u1');
    const { sent, send } = sender();
    const result = await run(REMINDER_TIME, { send });
    expect(result.sent.map((d) => d.kind)).toEqual(['confirmation', 'reminder']);
    expect(sent).toHaveLength(2);
  });

  it('アーカイブされたイベントには送らない', async () => {
    await register('a', 'u1');
    await db.doc('events/a').update({ archived: true });
    const { sent, send } = sender();
    await run(REMINDER_TIME, { send, events: [] });
    expect(sent).toEqual([]);
  });
});

describe('送信の失敗', () => {
  it('失敗した申込は記録せず、ほかの申込には送る', async () => {
    await register('a', 'u1');
    await register('a', 'u2');
    const { sent, send } = sender(['u1@example.org']);
    const result = await run(BEFORE, { send });
    expect(result.failed).toMatchObject([{ eventId: 'a', uid: 'u1', kind: 'confirmation' }]);
    expect(sent.map((s) => s.to.email)).toEqual(['u2@example.org']);
    expect((await reg('a', 'u1'))?.confirmationSentAt).toBeUndefined();
    expect((await reg('a', 'u2'))?.confirmationSentAt).toBeInstanceOf(Timestamp);
    expect(result.stopped).toBe(false);
  });

  it(`連続で失敗したら送信をやめる`, async () => {
    for (const uid of ['u1', 'u2', 'u3', 'u4']) await register('a', uid);
    const { sent, send } = sender(['u1@example.org', 'u2@example.org', 'u3@example.org']);
    const result = await run(BEFORE, { send });
    expect(result.failed).toHaveLength(3);
    expect(sent).toEqual([]);
    expect(result.stopped).toBe(true);
  });
});

describe('件数補正', () => {
  it('count を registrations の実数に合わせる', async () => {
    await register('a', 'u1');
    await register('a', 'u2');
    await db.doc('events/a').update({ count: 5 });
    const result = await run(BEFORE);
    expect(result.corrected).toEqual([{ eventId: 'a', from: 5, to: 2 }]);
    expect((await db.doc('events/a').get()).get('count')).toBe(2);
    expect((await run(BEFORE)).corrected).toEqual([]);
  });

  it('開始後は補正しない', async () => {
    await db.doc('events/a').update({ count: 5 });
    expect((await run(AFTER_START)).corrected).toEqual([]);
    expect((await db.doc('events/a').get()).get('count')).toBe(5);
  });
});

describe('削除', () => {
  it('保存期間を過ぎた申込を、アーカイブ済みのイベントも含めて消す。count は残す', async () => {
    await syncFirestore(db, config, [event('a'), event('b')]);
    await register('a', 'u1');
    await register('b', 'u2');
    await syncFirestore(db, config, [event('a')]); // b はアーカイブ

    const result = await run(AFTER_RETENTION);
    expect(result.purged).toEqual([
      { eventId: 'a', count: 1 },
      { eventId: 'b', count: 1 },
    ]);
    expect((await db.collection('events/a/registrations').get()).size).toBe(0);
    expect((await db.collection('events/b/registrations').get()).size).toBe(0);
    expect((await db.doc('events/a').get()).get('count')).toBe(1);
  });

  it('保存期間内なら消さない', async () => {
    await register('a', 'u1');
    expect((await run(AFTER_START)).purged).toEqual([]);
    expect((await db.collection('events/a/registrations').get()).size).toBe(1);
  });
});

describe('dry run', () => {
  it('送信も書き込みもせず、予定だけを返す', async () => {
    await register('a', 'u1');
    await db.doc('events/a').update({ count: 5 });
    const { sent, send } = sender();

    const result = await run(REMINDER_TIME, { send, dryRun: true });
    expect(sent).toEqual([]);
    expect(result.sent.map((d) => d.kind)).toEqual(['confirmation', 'reminder']);
    expect(result.corrected).toEqual([{ eventId: 'a', from: 5, to: 1 }]);
    expect(await reg('a', 'u1')).not.toHaveProperty('confirmationSentAt');
    expect((await db.doc('events/a').get()).get('count')).toBe(5);

    const purge = await run(AFTER_RETENTION, { dryRun: true });
    expect(purge.purged).toEqual([{ eventId: 'a', count: 1 }]);
    expect((await db.collection('events/a/registrations').get()).size).toBe(1);
  });
});
