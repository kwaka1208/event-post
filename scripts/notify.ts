// 受付メール・リマインドの送信、件数の補正、古い申込データの削除。notify.yml から毎時実行する。
//
//   npm run notify                      # 送信して記録する（SMTP_USER / SMTP_PASSWORD が必要）
//   npm run notify -- --dry-run         # Firestore を読むだけで、送信も書き込みもせず予定をログに出す
//
// 接続先と認証は scripts/lib/firestore.ts を参照。サイトの URL は PAGES_BASE_URL（または config.yml の custom_domain）。
// 送信に失敗した申込があれば終了コード 1 で終わる（Actions の失敗通知で気づけるように）。
// 公開リポジトリでは Actions のログも公開されるため、申込者の名前やメールアドレスはログに出さない。
import { loadConfig } from '../app/src/lib/config';
import { eventPageUrl, siteLocation } from '../app/src/lib/site-url';
import { connectFirestore } from './lib/firestore';
import { loadEvents } from './lib/load-site';
import { loadTemplate, mailVars, renderTemplate, type TemplateName } from './lib/mail';
import { runNotify, type Delivery, type NotifyResult } from './lib/notify';
import { createSender, smtpCredentials } from './lib/smtp';

const KIND_LABEL: Record<TemplateName, string> = { confirmation: '受付メール', reminder: 'リマインド' };

/** エラーメッセージに含まれうるメールアドレスを伏せる */
function mask(message: string): string {
  return message.replace(/[^\s<>"'@]+@[^\s<>"'@]+/g, '（メールアドレス）');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const config = loadConfig();
  const events = loadEvents();
  const templates = { confirmation: loadTemplate('confirmation'), reminder: loadTemplate('reminder') };
  const location = siteLocation(config);
  const eventUrl = (id: string) => eventPageUrl(location, id);
  const { db, projectId } = connectFirestore(config);
  const now = new Date();
  const sender = dryRun ? undefined : createSender(config, smtpCredentials());

  let result: NotifyResult;
  try {
    result = await runNotify({
      db,
      config,
      events,
      templates,
      eventUrl,
      send: sender?.send ?? (async () => {}),
      now,
      dryRun,
    });
  } finally {
    sender?.close();
  }

  if (!dryRun) {
    console.log(`Firestore（${projectId}）を確認しました（${now.toISOString()}）。`);
    report(result, '送りました', '補正しました', '削除しました');
    if (result.stopped) console.log(`- 送信の失敗が続いたため、残りは次の回に送ります。SMTP の設定や送信上限を確認してください。`);
    if (result.failed.length > 0) process.exitCode = 1;
    return;
  }

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
  report({ ...result, sent: [] }, '', '補正する予定', '削除する予定です');
}

/** 件数・補正・削除・失敗・注意をログに出す。名前やメールアドレスは出さない */
function report(result: NotifyResult, sentVerb: string, correctVerb: string, purgeVerb: string) {
  const counts = new Map<string, number>();
  for (const d of result.sent) {
    const key = `${d.eventId}: ${KIND_LABEL[d.kind]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, n] of counts) console.log(`- ${key}を ${n} 件${sentVerb}。`);
  if (sentVerb && counts.size === 0 && result.failed.length === 0) console.log('- 送るメールはありませんでした。');
  for (const c of result.corrected) {
    console.log(`- ${c.eventId}: count が ${c.from} でしたが、申込は ${c.to} 件です（${correctVerb}）。`);
  }
  for (const p of result.purged) {
    console.log(`- ${p.eventId}: 保存期間を過ぎた申込 ${p.count} 件を${purgeVerb}。`);
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
