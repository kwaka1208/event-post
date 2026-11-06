import { defineConfig } from 'vitest/config';

// 再設計版の Firestore ルールと通知メール（scripts/next/）のテスト。エミュレーターの中で実行する（npm run test:next-rules）
export default defineConfig({
  test: {
    include: ['tests/next/rules/**/*.test.ts', 'tests/next/notify/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
});
