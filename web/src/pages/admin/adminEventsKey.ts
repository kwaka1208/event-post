// 管理者のイベント一覧のキャッシュのキー。ログアウトのときに ['admin'] ごと消す（SessionProvider）
export const adminEventsKey = ['admin', 'events'] as const;
