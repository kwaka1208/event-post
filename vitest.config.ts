import { defineConfig } from 'vitest/config';

// 単体テスト（npm test）。Firestore を使うテストは vitest.rules.config.ts
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
