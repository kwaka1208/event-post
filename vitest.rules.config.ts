import { defineConfig } from 'vitest/config';

// Firestore ルールのテスト。エミュレーターの中で実行する（npm run test:rules）
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
});
