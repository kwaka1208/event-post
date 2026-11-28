// メンバー一覧のキャッシュのキー。ログアウトのときに ['directory'] ごと消す（SessionProvider）
export const directoryKeys = {
  all: ['directory'] as const,
  list: ['directory', 'list'] as const,
  entry: (uid: string) => ['directory', 'entry', uid] as const,
};
