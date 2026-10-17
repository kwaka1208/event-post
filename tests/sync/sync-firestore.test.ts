// 同期スクリプトのテスト。Admin SDK でエミュレーターに接続する（npm run test:rules）
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { configSchema } from '../../app/src/lib/schema';
import { parseEventFile, type SiteEvent } from '../../scripts/lib/load-site';
import { syncFirestore } from '../../scripts/lib/sync';

const PROJECT_ID = 'demo-event-post';
const app = initializeApp({ projectId: PROJECT_ID }, 'sync-test');
const db = getFirestore(app);

const config = configSchema.parse({
  group: { name: 'CoderDojo 奈良', contact_email: 'info@example.org' },
  admins: ['Organizer@Example.org'],
  firebase: { apiKey: 'k', authDomain: 'x.firebaseapp.com', projectId: PROJECT_ID, appId: 'a' },
});

function event(id: string, extra = ''): SiteEvent {
  return parseEventFile(
    `${id}.md`,
    `---\ntitle: ${id}\ndate: 2026-11-20\nstart: "13:00"\nend: "16:00"\nvenue: 公民館\n${extra}\n---\n`,
  );
}

async function clear() {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {
    method: 'DELETE',
  });
}

beforeEach(clear);
afterAll(async () => {
  await clear();
  await deleteApp(app);
});

describe('sync-firestore', () => {
  it('新規のイベントを count: 0 で作る', async () => {
    const result = await syncFirestore(db, config, [event('a', 'capacity: 10')]);
    expect(result.created).toEqual(['a']);
    const snap = await db.doc('events/a').get();
    expect(snap.data()).toMatchObject({ title: 'a', count: 0, capacity: 10, fieldIds: [], archived: false });
  });

  it('既存のイベントは count を残して更新する', async () => {
    await syncFirestore(db, config, [event('a')]);
    await db.doc('events/a').update({ count: 5 });
    const result = await syncFirestore(db, config, [event('a', 'capacity: 30')]);
    expect(result.updated).toEqual(['a']);
    expect((await db.doc('events/a').get()).data()).toMatchObject({ count: 5, capacity: 30 });
  });

  it('Markdown から消えたイベントは削除せずアーカイブし、申込データも残す', async () => {
    await syncFirestore(db, config, [event('a'), event('b')]);
    await db.doc('events/b/registrations/u1').set({ name: '太郎' });
    const result = await syncFirestore(db, config, [event('a')]);
    expect(result.archived).toEqual(['b']);
    expect((await db.doc('events/b').get()).get('archived')).toBe(true);
    expect((await db.doc('events/b/registrations/u1').get()).exists).toBe(true);

    // 2 回目以降は数えない。Markdown が戻ればアーカイブを解除する
    expect((await syncFirestore(db, config, [event('a')])).archived).toEqual([]);
    await syncFirestore(db, config, [event('a'), event('b')]);
    expect((await db.doc('events/b').get()).get('archived')).toBe(false);
  });

  it('config/admins を小文字にそろえて上書きする', async () => {
    await db.doc('config/admins').set({ emails: ['old@example.org'], extra: 1 });
    await syncFirestore(db, config, []);
    expect((await db.doc('config/admins').get()).data()).toEqual({ emails: ['organizer@example.org'] });
  });
});
