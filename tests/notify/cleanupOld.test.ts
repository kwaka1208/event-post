// 旧版のデータを消すスクリプト（scripts/lib/cleanupOld.ts）のテスト。Admin SDK でエミュレーターに接続する
import { beforeEach, describe, expect, it } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { runCleanupOld } from '../../scripts/lib/cleanupOld';
import { EMULATOR_PROJECT_ID } from '../../web/src/consts';

const app = initializeApp({ projectId: EMULATOR_PROJECT_ID }, 'cleanup-test');
const db = getFirestore(app);

async function exists(path: string) {
  return (await db.doc(path).get()).exists;
}

beforeEach(async () => {
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${EMULATOR_PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  // 旧版：count と archived を持つイベントと、その申込、管理者の一覧
  await db.doc('events/2026-09-05-old').set({ title: '旧版', count: 2, archived: false, startAt: Timestamp.now() });
  await db.doc('events/2026-09-05-old/registrations/u1').set({ uid: 'u1', name: '旧', email: 'u1@example.org' });
  await db.doc('events/2026-09-05-old/registrations/u2').set({ uid: 'u2', name: '旧', email: 'u2@example.org' });
  await db.doc('config/admins').set({ emails: ['a@example.org'] });
  // 新版：registrationCount を持つイベントと、その申込、メンバー
  await db.doc('events/new1').set({ title: '新版', registrationCount: 1, published: true, startAt: Timestamp.now() });
  await db.doc('events/new1/registrations/u1').set({ uid: 'u1', realName: '新' });
  await db.doc('members/u1').set({ uid: 'u1', role: 'member' });
});

describe('旧版のデータの削除', () => {
  it('dryRun では、消す予定を返すだけで消さない', async () => {
    const result = await runCleanupOld(db, true);
    expect(result).toEqual({ events: [{ id: '2026-09-05-old', registrations: 2 }], adminsConfig: true });
    expect(await exists('events/2026-09-05-old')).toBe(true);
    expect(await exists('events/2026-09-05-old/registrations/u1')).toBe(true);
    expect(await exists('config/admins')).toBe(true);
  });

  it('旧版のイベントを申込ごと消し、管理者の一覧も消す', async () => {
    await runCleanupOld(db, false);
    expect(await exists('events/2026-09-05-old')).toBe(false);
    expect(await exists('events/2026-09-05-old/registrations/u1')).toBe(false);
    expect(await exists('events/2026-09-05-old/registrations/u2')).toBe(false);
    expect(await exists('config/admins')).toBe(false);
  });

  it('新版のイベント、申込、メンバーには触らない', async () => {
    await runCleanupOld(db, false);
    expect(await exists('events/new1')).toBe(true);
    expect(await exists('events/new1/registrations/u1')).toBe(true);
    expect(await exists('members/u1')).toBe(true);
  });

  it('旧版のデータがなければ、何もしない', async () => {
    await runCleanupOld(db, false);
    expect(await runCleanupOld(db, false)).toEqual({ events: [], adminsConfig: false });
  });
});
