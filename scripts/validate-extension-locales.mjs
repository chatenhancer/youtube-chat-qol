/*
 * Validate shared extension locale catalogs.
 *
 * Extension builds generate WebExtension `_locales` from these same catalogs,
 * and injected chat UI reads the `messages` section directly. Keep every
 * locale structurally aligned with English so missing keys do not silently
 * fall back or disappear at runtime.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localesSourceDir = path.join(root, 'src', 'shared', 'locales');

export async function validateExtensionLocales() {
  const catalogs = await readLocaleCatalogs();
  const errors = [];
  const defaultCatalog = catalogs.en;

  if (!defaultCatalog) {
    throw new Error('Shared locale catalogs must include en.json.');
  }

  const defaultMessages = flattenMessages(defaultCatalog.messages);
  const defaultExtension = isPlainObject(defaultCatalog.extension) ? defaultCatalog.extension : {};

  if (!Object.keys(defaultMessages).length) {
    errors.push('en.json must define messages.');
  }
  if (!Object.keys(defaultExtension).length) {
    errors.push('en.json must define extension messages.');
  }

  for (const [locale, catalog] of Object.entries(catalogs)) {
    validateMessages(errors, locale, defaultMessages, catalog.messages);
    validateExtensionMessages(errors, locale, defaultExtension, catalog.extension);
  }

  if (errors.length) {
    throw new Error(`Extension locale validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`);
  }

  console.log(
    `Extension locale keys match en.json (${Object.keys(defaultMessages).length} message keys, `
      + `${Object.keys(defaultExtension).length} extension keys, ${Object.keys(catalogs).length} locales).`
  );
}

async function readLocaleCatalogs() {
  const filenames = await readdir(localesSourceDir);
  const entries = await Promise.all(filenames
    .filter((filename) => filename.endsWith('.json'))
    .map(async (filename) => {
      const locale = path.basename(filename, '.json');
      const contents = await readFile(path.join(localesSourceDir, filename), 'utf8');
      return [locale, JSON.parse(contents)];
    }));

  return Object.fromEntries(entries);
}

function validateMessages(errors, locale, defaultMessages, localeMessagesSource) {
  const localeMessages = flattenMessages(localeMessagesSource);
  compareKeys(errors, locale, 'messages', Object.keys(defaultMessages), Object.keys(localeMessages));

  for (const key of Object.keys(defaultMessages)) {
    if (!Object.hasOwn(localeMessages, key)) continue;
    comparePlaceholders(errors, locale, `messages.${key}`, defaultMessages[key], localeMessages[key]);
  }
}

function validateExtensionMessages(errors, locale, defaultExtension, localeExtension) {
  if (!isPlainObject(localeExtension)) {
    errors.push(`${locale}.json must define extension messages.`);
    return;
  }

  compareKeys(errors, locale, 'extension', Object.keys(defaultExtension), Object.keys(localeExtension));

  for (const key of Object.keys(defaultExtension)) {
    if (!Object.hasOwn(localeExtension, key)) continue;
    const defaultMessage = defaultExtension[key]?.message;
    const localeMessage = localeExtension[key]?.message;
    if (typeof localeMessage !== 'string') {
      errors.push(`${locale}.extension.${key}.message must be a string.`);
      continue;
    }
    comparePlaceholders(errors, locale, `extension.${key}`, defaultMessage, localeMessage);
  }
}

function flattenMessages(value, prefix = '') {
  if (!isPlainObject(value)) return {};

  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
    const childKey = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(child)) {
      return Object.entries(flattenMessages(child, childKey));
    }
    return [[childKey, String(child)]];
  }));
}

function compareKeys(errors, locale, section, expectedKeys, actualKeys) {
  const expected = new Set(expectedKeys);
  const actual = new Set(actualKeys);
  const missing = [...expected].filter((key) => !actual.has(key)).sort();
  const extra = [...actual].filter((key) => !expected.has(key)).sort();

  if (missing.length) {
    errors.push(`${locale}.${section} is missing keys: ${missing.join(', ')}`);
  }
  if (extra.length) {
    errors.push(`${locale}.${section} has extra keys: ${extra.join(', ')}`);
  }
}

function comparePlaceholders(errors, locale, key, expectedMessage, actualMessage) {
  const expected = getPlaceholderNames(expectedMessage).sort();
  const actual = getPlaceholderNames(actualMessage).sort();
  if (expected.join('\0') === actual.join('\0')) return;

  errors.push(
    `${locale}.${key} placeholders differ: expected [${expected.join(', ')}], got [${actual.join(', ')}]`
  );
}

function getPlaceholderNames(message) {
  const names = new Set();
  for (const match of String(message || '').matchAll(/\{(\w+)\}/g)) {
    names.add(match[1]);
  }
  return [...names];
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await validateExtensionLocales();
}
