import { defineConfig } from 'vitest/config';

// 再設計版（web/）の Firestore ルールのテスト。エミュレーターの中で実行する（npm run test:next-rules）
export default defineConfig({
  test: {
    include: ['tests/next/rules/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
});
