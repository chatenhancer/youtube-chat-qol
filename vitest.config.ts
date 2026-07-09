import { readFile } from 'node:fs/promises';
import { defineConfig } from 'vitest/config';

function rawHtmlTextModules() {
  return {
    name: 'raw-html-text-modules',
    enforce: 'pre' as const,
    async load(id: string) {
      if (!id.endsWith('.html')) return null;
      return `export default ${JSON.stringify(await readFile(id, 'utf8'))};`;
    }
  };
}

export default defineConfig({
  plugins: [rawHtmlTextModules()],
  test: {
    coverage: {
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/shared/locales/**'
      ],
      include: [
        'src/**/*.ts',
        'src/**/*.tsx'
      ],
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage/unit'
    },
    environment: 'jsdom',
    globals: false,
    include: [
      'cloudflare/language-redirect/src/**/*.test.ts',
      'cloudflare/playground/src/**/*.test.ts',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'scripts/**/*.test.mjs'
    ],
    restoreMocks: true,
    setupFiles: ['tests/setup.ts']
  }
});
