import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/auth.browser.integration.test.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
    maxWorkers: 1,
  },
});
