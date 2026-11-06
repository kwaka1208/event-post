// 参加申し込みの通知（管理者宛て）、承認の通知（本人宛て）、管理者が書いたメール。毎時の Actions から実行する。
//
//   npm run notify:next                 # 送信して記録する（SMTP_USER / SMTP_PASSWORD が必要）
//   npm run notify:next -- --dry-run    # Firestore を読むだけで、送信も書き込みもせず予定をログに出す
//
// 環境変数：SITE_URL（メールに載せるサイトの URL）、SMTP_*・REPLY_TO（lib/smtp.ts）、
// 接続先は lib/firestore.ts を参照。
// 送信に失敗したメールがあれば終了コード 1 で終わる（Actions の失敗通知で気づけるように）。
// 公開リポジトリでは Actions のログも公開されるため、名前やメールアドレスはログに出さない。
import { connectFirestore } from './lib/firestore';
import { applicationsMail, welcomeMail } from './lib/messages';
import { runNotify, type DeliveryKind, type NotifyResult } from './lib/notify';
import { createSender, smtpSettings } from './lib/smtp';

const KIND_LABEL: Record<DeliveryKind, string> = {
  applications: '申し込みの通知',
  welcome: '承認の通知',
  mail: '管理者のメール',
};

/** エラーメッセージに含まれうるメールアドレスを伏せる */
function mask(message: string): string {
  return message.replace(/[^\s<>"'@]+@[^\s<>"'@]+/g, '（メールアドレス）');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) throw new Error('環境変数 SITE_URL を設定してください');
  const settings = dryRun ? undefined : smtpSettings();
  const { db, projectId } = connectFirestore();
  const now = new Date();

  // 差出人の表示名にグループ名を使う。グループがなければ runNotify が注意を返す
  const groupName: string = (await db.doc('group/profile').get()).get('name') ?? '';
  const sender = settings && groupName ? createSender(settings, groupName) : undefined;

  let result: NotifyResult;
  try {
    result = await runNotify({ db, siteUrl, send: sender?.send ?? (async () => {}), dryRun });
  } finally {
    sender?.close();
  }

  const note = dryRun ? '--dry-run のため、送信も書き込みもしません。' : '';
  console.log(`Firestore（${projectId}）を確認しました（${now.toISOString()}）。${note}`);
  report(result, dryRun);
  if (dryRun) printSamples(result, groupName, siteUrl);
  if (result.failed.length > 0) process.exitCode = 1;
}

/** 件数・失敗・注意をログに出す。名前やメールアドレスは出さない */
function report(result: NotifyResult, dryRun: boolean) {
  const verb = dryRun ? '送る予定です' : '送りました';
  for (const kind of Object.keys(KIND_LABEL) as DeliveryKind[]) {
    const n = result.sent.filter((d) => d.kind === kind).length;
    if (n > 0) console.log(`- ${KIND_LABEL[kind]}を ${n} 通${verb}。`);
  }
  if (result.notifiedApplications > 0) {
    console.log(`- 申し込み ${result.notifiedApplications} 件を通知済みに${dryRun ? 'する予定です' : 'しました'}。`);
  }
  if (result.completedMails > 0) console.log(`- 管理者のメール ${result.completedMails} 件を送信済みにしました。`);
  if (result.failedMails > 0) {
    console.log(`- 管理者のメール ${result.failedMails} 件は、届かない宛先が残ったため、一部失敗として送り直しをやめました。`);
  }
  if (result.sent.length === 0 && result.failed.length === 0) console.log('- 送るメールはありませんでした。');
  for (const f of result.failed) {
    const where = f.mailId ? `${f.mailId} の ${f.uid}` : f.uid;
    console.log(`- ${KIND_LABEL[f.kind]}の送信に失敗しました（${where}）：${mask(f.error)}`);
  }
  if (result.stopped) console.log('- 送信の失敗が続いたため、残りは次の回に送ります。SMTP の設定や送信上限を確認してください。');
  for (const w of result.warnings) console.log(`- 注意：${w}`);
}

/** 送る予定の種類ごとに、文面の見本を 1 通ずつ出す（名前は伏せる）。管理者のメールは本文を公開のログに出さないよう、見本を出さない */
function printSamples(result: NotifyResult, groupName: string, siteUrl: string) {
  const kinds = new Set(result.sent.map((d) => d.kind));
  const samples = [];
  if (kinds.has('applications')) {
    const applicants = Array.from({ length: result.notifiedApplications }, () => ({
      realName: '〇〇 〇〇',
      nickname: '〇〇',
      reason: '（申し込みの理由）',
    }));
    samples.push({ kind: 'applications' as const, mail: applicationsMail(groupName, siteUrl, applicants) });
  }
  if (kinds.has('welcome')) samples.push({ kind: 'welcome' as const, mail: welcomeMail(groupName, siteUrl, '〇〇') });
  for (const { kind, mail } of samples) {
    console.log(`\n${KIND_LABEL[kind]}の見本：`);
    console.log(`  件名：${mail.subject}`);
    console.log(mail.text.trimEnd().replace(/^/gm, '  | '));
  }
}

main().catch((e) => {
  console.error(mask((e as Error).message));
  process.exit(1);
});
