// 旧版（Astro 版）のデータを Firestore から消す。新版へ移るときに、Actions から手動で 1 回だけ実行する。
//
//   npm run cleanup:old -- --dry-run    # 消す予定の件数だけをログに出す
//   npm run cleanup:old                 # 消す
//
// 接続先は lib/firestore.ts を参照。旧版の申込の記録（名前、メールアドレス、回答）も消える。
import { runCleanupOld } from './lib/cleanupOld';
import { connectFirestore } from './lib/firestore';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const { db, projectId } = connectFirestore();
  const result = await runCleanupOld(db, dryRun);

  const verb = dryRun ? '消す予定です' : '消しました';
  console.log(`Firestore（${projectId}）の旧版のデータを確認しました。${dryRun ? '--dry-run のため、消しません。' : ''}`);
  if (result.events.length === 0 && !result.adminsConfig) {
    console.log('- 旧版のデータはありませんでした。');
    return;
  }
  const registrations = result.events.reduce((n, e) => n + e.registrations, 0);
  console.log(`- 旧版のイベント ${result.events.length} 件と、その申込 ${registrations} 件を${verb}。`);
  // イベントの ID は旧版の Markdown のファイル名で、公開の情報なのでログに出してよい
  for (const e of result.events) console.log(`  - ${e.id}（申込 ${e.registrations} 件）`);
  if (result.adminsConfig) console.log(`- 旧版の管理者の一覧（config/admins）を${verb}。`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
