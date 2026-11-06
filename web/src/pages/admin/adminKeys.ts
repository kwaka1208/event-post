// 管理者の画面で使うキャッシュのキー。ログアウトのときに ['admin'] ごと消す（SessionProvider）
export const membersKey = ['admin', 'members'] as const;
export const mailsKey = ['admin', 'mails'] as const;
