// site/ のイベントと管理者を Firestore に同期する。deploy.yml から実行する。
//
//   npx tsx scripts/sync-firestore.ts            # 同期する（認証情報が必要）
//   npx tsx scripts/sync-firestore.ts --dry-run  # 検証して、書き込む内容を表示するだけ（Firestore に接続しない）
//
// 認証は Application Default Credentials（Actions では google-github-actions/auth が設定する）。
// FIRESTORE_EMULATOR_HOST があればエミュレーターに接続する。
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { loadConfig } from '../app/src/lib/config';
import { loadEvents } from './lib/load-site';
import { normalizeAdmins, syncFirestore, toEventDoc } from './lib/sync';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const config = loadConfig();
  const events = loadEvents();
  console.log(`site/config.yml とイベント ${events.length} 件を検証しました。`);

  if (dryRun) {
    for (const e of events) {
      const doc = toEventDoc(e);
      console.log(
        `- ${e.id}: ${doc.title}（${e.data.date} ${e.data.start}〜${e.data.end}、定員 ${doc.capacity ?? 'なし'}、` +
          `公開 ${doc.published ? 'する' : 'しない'}、追加項目 [${doc.fieldIds.join(', ')}]）`,
      );
    }
    console.log(`- 管理者: ${normalizeAdmins(config.admins).join(', ')}`);
    console.log('--dry-run のため、Firestore には書き込みません。');
    return;
  }

  const app = initializeApp({ projectId: config.firebase.projectId });
  const result = await syncFirestore(getFirestore(app), config, events);
  const list = (ids: string[]) => (ids.length ? ids.join(', ') : 'なし');
  console.log(`Firestore（${config.firebase.projectId}）に同期しました。`);
  console.log(`- 新規: ${list(result.created)}`);
  console.log(`- 更新: ${list(result.updated)}`);
  console.log(`- アーカイブ: ${list(result.archived)}`);
  console.log(`- 管理者: ${result.admins.length} 件`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
