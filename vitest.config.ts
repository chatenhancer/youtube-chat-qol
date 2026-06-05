import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        'src/**/*.test.ts',
        'src/shared/locales/**'
      ],
      include: [
        'src/**/*.ts'
      ],
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage/unit'
    },
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    restoreMocks: true,
    setupFiles: ['tests/setup.ts']
  }
});
