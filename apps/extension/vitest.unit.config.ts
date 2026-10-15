import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

export default defineProject({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    name: 'extension',
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.{ts,tsx}', 'e2e/support/**/*.test.ts'],
    restoreMocks: true,
    setupFiles: ['vitest.setup.ts']
  }
});
