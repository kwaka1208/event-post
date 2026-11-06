// メンバー向けのイベントと申込のキャッシュのキー。ログアウトのときに ['events'] ごと消す（SessionProvider）
export const eventKeys = {
  all: ['events'] as const,
  published: ['events', 'published'] as const,
  detail: (id: string) => ['events', 'detail', id] as const,
  myRegistration: (id: string, uid: string) => ['events', 'detail', id, 'registration', uid] as const,
  myRegistrations: (uid: string) => ['events', 'mine', uid] as const,
  /** マイページ（自分の申込と、そのイベント） */
  myPage: (uid: string) => ['events', 'my-page', uid] as const,
};
