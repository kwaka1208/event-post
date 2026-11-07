// 旧版（Astro 版）のデータを Firestore から消す。新版へ移るときに 1 回だけ使う。
// 旧版のイベントは registrationCount を持たない（旧版は count と archived を持つ）ので、それで見分ける。
// 新版のイベント、メンバー、申し込みなどには触らない。
import type { Firestore } from 'firebase-admin/firestore';

export interface CleanupResult {
  /** 消した（dryRun では消す予定の）旧版のイベントと、その申込の件数 */
  events: { id: string; registrations: number }[];
  /** 旧版の管理者の一覧（config/admins）があったか */
  adminsConfig: boolean;
}

export async function runCleanupOld(db: Firestore, dryRun: boolean): Promise<CleanupResult> {
  const result: CleanupResult = { events: [], adminsConfig: false };

  for (const doc of (await db.collection('events').get()).docs) {
    if (doc.get('registrationCount') !== undefined) continue;
    const registrations = (await doc.ref.collection('registrations').count().get()).data().count;
    result.events.push({ id: doc.id, registrations });
    // サブコレクション（申込）ごと消す
    if (!dryRun) await db.recursiveDelete(doc.ref);
  }

  const admins = db.doc('config/admins');
  if ((await admins.get()).exists) {
    result.adminsConfig = true;
    if (!dryRun) await admins.delete();
  }
  return result;
}
