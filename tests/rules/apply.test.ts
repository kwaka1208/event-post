// 詳細ページが使う申込・キャンセルの関数（app/src/lib/apply.ts）を、ルールを有効にしたエミュレーターで動かす
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, doc, setDoc, type Firestore } from 'firebase/firestore';
import {
  applyForEvent,
  cancelRegistration,
  diagnoseApplyFailure,
  getEvent,
  getRegistration,
} from '../../app/src/lib/apply';
import { buildRegistration } from '../../app/src/lib/answers';
import type { EventField } from '../../app/src/lib/schema';

const PROJECT_ID = 'demo-event-post';
const HOUR = 60 * 60 * 1000;

const fields: EventField[] = [
  { id: 'grade', label: '学年', type: 'select', options: ['小1', '小3'], required: true },
  { id: 'note', label: '連絡事項', type: 'textarea', required: false },
];

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
});

async function seedEvent(id: string, o: { capacity?: number | null; count?: number; deadline?: Date } = {}) {
  const startAt = new Date(Date.now() + 7 * 24 * HOUR);
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, 'events', id), {
      title: 'テストイベント',
      startAt: Timestamp.fromDate(startAt),
      endAt: Timestamp.fromDate(new Date(startAt.getTime() + 3 * HOUR)),
      deadline: Timestamp.fromDate(o.deadline ?? startAt),
      capacity: o.capacity === undefined ? 2 : o.capacity,
      count: o.count ?? 0,
      fieldIds: fields.map((f) => f.id),
      published: true,
      archived: false,
    });
  });
}

function userDb(uid: string): Firestore {
  return env
    .authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true })
    .firestore() as unknown as Firestore;
}

function applicant(uid: string) {
  return { uid, email: `${uid}@example.com` };
}

/** フォームの入力から申し込む（詳細ページと同じ流れ） */
async function applyWithForm(db: Firestore, eventId: string, uid: string, values: Record<string, string>) {
  const form = buildRegistration(fields, { name: '山田 花子', values });
  if (!form.ok) throw new Error('入力エラー');
  await applyForEvent(db, eventId, applicant(uid), form.name, form.answers);
}

describe('applyForEvent / cancelRegistration', () => {
  it('未入力の任意項目をキーごと省いた申込が通り、count が +1 される', async () => {
    await seedEvent('e');
    const db = userDb('alice');
    await applyWithForm(db, 'e', 'alice', { grade: '小3', note: '' });

    const reg = await getRegistration(db, 'e', 'alice');
    expect(reg).toMatchObject({ uid: 'alice', name: '山田 花子', email: 'alice@example.com', answers: { grade: '小3' } });
    expect(reg!.createdAt).toBeInstanceOf(Timestamp);
    expect((await getEvent(db, 'e'))!.count).toBe(1);
  });

  it('申込がなければ getRegistration は null', async () => {
    await seedEvent('e');
    expect(await getRegistration(userDb('alice'), 'e', 'alice')).toBeNull();
  });

  it('キャンセルで申込が消え、count が −1 される', async () => {
    await seedEvent('e');
    const db = userDb('alice');
    await applyWithForm(db, 'e', 'alice', { grade: '小1' });
    await cancelRegistration(db, 'e', 'alice');

    expect(await getRegistration(db, 'e', 'alice')).toBeNull();
    expect((await getEvent(db, 'e'))!.count).toBe(0);
  });

  it('キャンセル後にもう一度申し込める', async () => {
    await seedEvent('e');
    const db = userDb('alice');
    await applyWithForm(db, 'e', 'alice', { grade: '小1' });
    await cancelRegistration(db, 'e', 'alice');
    await applyWithForm(db, 'e', 'alice', { grade: '小3' });
    expect((await getEvent(db, 'e'))!.count).toBe(1);
  });

  it('満席なら permission-denied になり、理由は full と判定される', async () => {
    await seedEvent('e', { capacity: 2, count: 2 });
    const db = userDb('alice');
    await expect(applyWithForm(db, 'e', 'alice', { grade: '小1' })).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(diagnoseApplyFailure(await getEvent(db, 'e'), new Date())).toBe('full');
  });

  it('締切後なら理由は closed と判定される', async () => {
    await seedEvent('e', { deadline: new Date(Date.now() - HOUR) });
    const db = userDb('alice');
    await expect(applyWithForm(db, 'e', 'alice', { grade: '小1' })).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(diagnoseApplyFailure(await getEvent(db, 'e'), new Date())).toBe('closed');
  });

  it('定員なしのイベントにも申し込める', async () => {
    await seedEvent('e', { capacity: null, count: 100 });
    const db = userDb('alice');
    await applyWithForm(db, 'e', 'alice', { grade: '小1' });
    expect((await getEvent(db, 'e'))!.count).toBe(101);
  });
});
