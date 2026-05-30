import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
    setupFiles: ['tests/setup.ts']
  }
});
