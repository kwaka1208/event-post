// Markdown（正）の内容を Firestore（写し）に反映する。
// Admin SDK で書くのでルールは通らない。count はクライアントが ±1 する値なので、ここでは新規作成時以外に触らない。
import { Timestamp, type Firestore, type WriteBatch } from 'firebase-admin/firestore';
import { eventTimes } from '../../app/src/lib/event';
import type { SiteConfig } from '../../app/src/lib/schema';
import type { SiteEvent } from './load-site';

/** events/{eventId} のうち、同期で書くフィールド（count を含まない） */
export interface EventDoc {
  title: string;
  startAt: Timestamp;
  endAt: Timestamp;
  deadline: Timestamp;
  capacity: number | null;
  fieldIds: string[];
  published: boolean;
  archived: boolean;
}

export function toEventDoc({ data }: SiteEvent): EventDoc {
  const { startAt, endAt, deadlineAt } = eventTimes(data);
  return {
    title: data.title,
    startAt: Timestamp.fromDate(startAt),
    endAt: Timestamp.fromDate(endAt),
    deadline: Timestamp.fromDate(deadlineAt),
    capacity: data.capacity,
    // ルールの answers.keys().hasOnly(fieldIds) が前提にしているので、空でも必ず書く
    fieldIds: data.fields.map((f) => f.id),
    published: data.published,
    archived: false,
  };
}

/** ルールの判定は完全一致なので、小文字にそろえて重複を除く */
export function normalizeAdmins(emails: string[]): string[] {
  return [...new Set(emails.map((e) => e.trim().toLowerCase()))].sort();
}

export interface SyncResult {
  created: string[];
  updated: string[];
  archived: string[];
  admins: string[];
}

// 1 バッチの書き込みは 500 件まで
const BATCH_LIMIT = 400;

export async function syncFirestore(
  db: Firestore,
  config: SiteConfig,
  events: SiteEvent[],
): Promise<SyncResult> {
  const result: SyncResult = { created: [], updated: [], archived: [], admins: normalizeAdmins(config.admins) };
  const existing = await db.collection('events').get();
  const existingIds = new Set(existing.docs.map((d) => d.id));
  const markdownIds = new Set(events.map((e) => e.id));

  const ops: ((batch: WriteBatch) => void)[] = [];

  for (const event of events) {
    const ref = db.doc(`events/${event.id}`);
    const doc = toEventDoc(event);
    if (existingIds.has(event.id)) {
      // count 以外をマージする（doc に count を含めないので、既存の count は残る）
      ops.push((b) => b.set(ref, doc, { merge: true }));
      result.updated.push(event.id);
    } else {
      ops.push((b) => b.create(ref, { ...doc, count: 0 }));
      result.created.push(event.id);
    }
  }

  // Markdown から消えたイベントは、申込データを残すため削除せずアーカイブする
  for (const d of existing.docs) {
    if (markdownIds.has(d.id) || d.get('archived') === true) continue;
    ops.push((b) => b.update(d.ref, { archived: true }));
    result.archived.push(d.id);
  }

  ops.push((b) => b.set(db.doc('config/admins'), { emails: result.admins }));

  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    ops.slice(i, i + BATCH_LIMIT).forEach((op) => op(batch));
    await batch.commit();
  }
  return result;
}
