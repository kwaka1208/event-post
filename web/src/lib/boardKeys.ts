// 掲示板のキャッシュのキー。ログアウトのときに ['board'] ごと消す（SessionProvider）
export const boardKeys = {
  all: ['board'] as const,
  topics: ['board', 'topics'] as const,
  topic: (id: string) => ['board', 'topic', id] as const,
  replies: (id: string) => ['board', 'topic', id, 'replies'] as const,
};
