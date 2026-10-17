// 受付メール・リマインドの送信、件数の補正、古い申込データの削除。notify.yml から毎時実行する。
//
//   npx tsx scripts/notify.ts --dry-run  # Firestore を読むだけで、送信も書き込みもせず予定をログに出す
//
// 接続先と認証は scripts/lib/firestore.ts を参照。サイトの URL は PAGES_BASE_URL（または config.yml の custom_domain）。
// 公開リポジトリでは Actions のログも公開されるため、申込者の名前やメールアドレスはログに出さない。
import { loadConfig } from '../app/src/lib/config';
import { eventPageUrl, siteLocation } from '../app/src/lib/site-url';
import { connectFirestore } from './lib/firestore';
import { loadEvents } from './lib/load-site';
import { loadTemplate, mailVars, renderTemplate, type TemplateName } from './lib/mail';
import { runNotify, type Delivery } from './lib/notify';

const KIND_LABEL: Record<TemplateName, string> = { confirmation: '受付メール', reminder: 'リマインド' };

/** エラーメッセージに含まれうるメールアドレスを伏せる */
function mask(message: string): string {
  return message.replace(/[^\s<>"'@]+@[^\s<>"'@]+/g, '（メールアドレス）');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!dryRun) throw new Error('メールの送信はまだ実装していません。--dry-run を付けて実行してください');

  const config = loadConfig();
  const events = loadEvents();
  const templates = { confirmation: loadTemplate('confirmation'), reminder: loadTemplate('reminder') };
  const location = siteLocation(config);
  const eventUrl = (id: string) => eventPageUrl(location, id);
  const { db, projectId } = connectFirestore(config);
  const now = new Date();

  const result = await runNotify({
    db,
    config,
    events,
    templates,
    eventUrl,
    send: async () => {},
    now,
    dryRun,
  });

  console.log(`Firestore（${projectId}）を確認しました（${now.toISOString()}）。--dry-run のため、送信も書き込みもしません。`);

  // イベントと種類ごとに件数をまとめ、文面の見本を 1 通ずつ出す
  const groups = new Map<string, Delivery[]>();
  for (const d of result.sent) {
    const key = `${d.eventId}\t${d.kind}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  if (groups.size === 0) console.log('- 送る予定のメールはありません。');
  for (const [key, list] of groups) {
    const [eventId, kind] = key.split('\t') as [string, TemplateName];
    const event = events.find((e) => e.id === eventId)!;
    const mail = renderTemplate(templates[kind], mailVars(config, event, '（申込者名）', eventUrl(eventId)));
    console.log(`\n- ${eventId}: ${KIND_LABEL[kind]}を ${list.length} 件送る予定です。見本：`);
    console.log(`  件名：${mail.subject}`);
    console.log(mail.text.trimEnd().replace(/^/gm, '  | '));
  }
  for (const c of result.corrected) {
    console.log(`- ${c.eventId}: count が ${c.from} ですが、申込は ${c.to} 件です（補正する予定）。`);
  }
  for (const p of result.purged) {
    console.log(`- ${p.eventId}: 保存期間を過ぎた申込 ${p.count} 件を削除する予定です。`);
  }
  for (const f of result.failed) {
    console.log(`- ${f.eventId}: ${KIND_LABEL[f.kind]}の送信に失敗しました（${f.uid}）：${mask(f.error)}`);
  }
  for (const w of result.warnings) console.log(`- 注意：${w}`);
}

main().catch((e) => {
  console.error(mask((e as Error).message));
  process.exit(1);
});
