import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = path.join(rootDir, 'docs', 'i18n');
const baseLocale = 'en.json';
const basePath = path.join(localesDir, baseLocale);

const baseMessages = JSON.parse(await readFile(basePath, 'utf8'));
const expectedKeys = flattenKeys(baseMessages);
const localeFiles = (await readdir(localesDir))
  .filter((file) => file.endsWith('.json'))
  .sort();

let hasError = false;

for (const file of localeFiles) {
  const messages = JSON.parse(await readFile(path.join(localesDir, file), 'utf8'));
  const actualKeys = flattenKeys(messages);
  const missingKeys = expectedKeys.filter((key) => !actualKeys.includes(key));
  const extraKeys = actualKeys.filter((key) => !expectedKeys.includes(key));

  if (!missingKeys.length && !extraKeys.length) continue;

  hasError = true;
  console.error(`\n${file}`);
  if (missingKeys.length) {
    console.error(`  Missing keys:\n    ${missingKeys.join('\n    ')}`);
  }
  if (extraKeys.length) {
    console.error(`  Extra keys:\n    ${extraKeys.join('\n    ')}`);
  }
}

if (hasError) {
  process.exitCode = 1;
} else {
  console.log(`Docs locale keys match ${baseLocale} (${expectedKeys.length} keys, ${localeFiles.length} locales).`);
}

function flattenKeys(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    return flattenKeys(child, nextPrefix);
  });
}
