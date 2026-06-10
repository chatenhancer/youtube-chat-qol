import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = path.join(rootDir, 'docs', 'src', 'i18n');
const baseLocale = 'en.json';
const basePath = path.join(localesDir, baseLocale);

export async function validateDocsLocales() {
  const baseMessages = JSON.parse(await readFile(basePath, 'utf8'));
  const expectedMessages = flattenMessages(baseMessages);
  const expectedKeys = Object.keys(expectedMessages);
  const localeFiles = (await readdir(localesDir))
    .filter((file) => file.endsWith('.json'))
    .sort();

  const errors = [];

  for (const file of localeFiles) {
    const messages = JSON.parse(await readFile(path.join(localesDir, file), 'utf8'));
    const actualMessages = flattenMessages(messages);
    const actualKeys = Object.keys(actualMessages);
    const missingKeys = expectedKeys.filter((key) => !actualKeys.includes(key));
    const extraKeys = actualKeys.filter((key) => !expectedKeys.includes(key));

    if (missingKeys.length) {
      errors.push(`${file} missing keys: ${missingKeys.join(', ')}`);
    }
    if (extraKeys.length) {
      errors.push(`${file} extra keys: ${extraKeys.join(', ')}`);
    }
    for (const key of expectedKeys) {
      if (!Object.hasOwn(actualMessages, key)) continue;
      comparePlaceholders(errors, file, key, expectedMessages[key], actualMessages[key]);
    }
  }

  if (errors.length) {
    throw new Error(`Docs locale validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`);
  }

  console.log(`Docs locale keys and placeholders match ${baseLocale} (${expectedKeys.length} keys, ${localeFiles.length} locales).`);
}

function flattenMessages(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { [prefix]: String(value) };
  }

  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    return Object.entries(flattenMessages(child, nextPrefix));
  }));
}

function comparePlaceholders(errors, file, key, expectedMessage, actualMessage) {
  const expected = getPlaceholderNames(expectedMessage).sort();
  const actual = getPlaceholderNames(actualMessage).sort();
  if (expected.join('\0') === actual.join('\0')) return;

  errors.push(`${file} ${key} placeholders differ: expected [${expected.join(', ')}], got [${actual.join(', ')}]`);
}

function getPlaceholderNames(message) {
  const names = new Set();
  for (const match of String(message || '').matchAll(/\{(\w+)\}/g)) {
    names.add(match[1]);
  }
  return [...names];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await validateDocsLocales();
}
