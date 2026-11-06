// 通知メールの文面。Firestore には触らず、渡された値から件名と本文を組み立てる。
export interface Mail {
  subject: string;
  text: string;
}

/** 申し込みの通知に載せる内容 */
export interface ApplicantSummary {
  realName: string;
  nickname: string;
  reason: string;
}

/** サイトの URL（末尾の / はあってもなくてもよい）にパスをつなぐ */
export function pageUrl(siteUrl: string, path: string): string {
  return `${siteUrl.replace(/\/+$/, '')}${path}`;
}

/** 管理者宛て：その回に見つかった新しい申し込みをまとめて知らせる */
export function applicationsMail(groupName: string, siteUrl: string, applicants: ApplicantSummary[]): Mail {
  const items = applicants.map((a) => `- ${a.realName}（${a.nickname}）\n  理由：${indent(a.reason)}`);
  return {
    subject: `【${groupName}】新しい参加申し込みが ${applicants.length} 件あります`,
    text: [
      `${groupName} に新しい参加申し込みがありました。`,
      '承認するか削除するかを、次のページで選んでください。',
      pageUrl(siteUrl, '/admin/applications'),
      '',
      ...items,
      '',
    ].join('\n'),
  };
}

/** 本人宛て：参加が承認されたことを知らせる */
export function welcomeMail(groupName: string, siteUrl: string, nickname: string): Mail {
  return {
    subject: `【${groupName}】参加が承認されました`,
    text: [
      `${nickname} さん`,
      '',
      `${groupName} への参加が承認されました。`,
      '次のページからイベントを見て、申し込めます。',
      pageUrl(siteUrl, '/events'),
      '',
    ].join('\n'),
  };
}

/** 理由が複数行のとき、2 行目以降を箇条書きの中にそろえる */
function indent(text: string): string {
  return text.trim().replace(/\r?\n/g, '\n  ');
}
