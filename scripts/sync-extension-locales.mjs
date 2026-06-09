/*
 * Generate WebExtension `_locales` files from the shared locale catalogs.
 *
 * The popup and manifest use browser-native chrome.i18n messages. The injected
 * YouTube UI loads one copied source catalog at runtime so it can follow
 * YouTube's language instead of the browser language.
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localesSourceDir = path.join(root, 'src', 'shared', 'locales');
const defaultOutputDir = path.join(root, 'dist', 'extension-chrome', '_locales');
const webExtensionLocaleAliases = {
  // WebExtension locale directories require regional Portuguese names.
  // The source catalog is intentionally broad, so ship it to both variants.
  pt: ['pt_BR', 'pt_PT']
};

export async function syncExtensionLocales(outputDir = defaultOutputDir) {
  const catalogs = await readLocaleCatalogs();
  const defaultExtensionMessages = catalogs.en?.extension;
  if (!defaultExtensionMessages) {
    throw new Error('English locale catalog must define extension messages.');
  }

  await rm(outputDir, { recursive: true, force: true });

  await Promise.all(Object.entries(catalogs)
    .filter(([, catalog]) => catalog.extension)
    .flatMap(([locale, catalog]) => getWebExtensionLocales(locale).map((outputLocale) => ({ catalog, outputLocale })))
    .map(async ({ catalog, outputLocale }) => {
      const localeDir = path.join(outputDir, outputLocale);
      await mkdir(localeDir, { recursive: true });
      const messages = createExtensionMessages(defaultExtensionMessages, catalog.extension || {});
      await writeFile(path.join(localeDir, 'messages.json'), `${JSON.stringify(messages, null, 2)}\n`);
    }));
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

function createExtensionMessages(defaultMessages, localeMessages) {
  return Object.fromEntries(Object.keys(defaultMessages).map((key) => {
    const message = {
      ...defaultMessages[key],
      ...localeMessages[key],
      message: localeMessages[key]?.message || defaultMessages[key].message
    };

    return [key, toWebExtensionMessage(message)];
  }));
}

function getWebExtensionLocales(locale) {
  return webExtensionLocaleAliases[locale] || [locale];
}

function toWebExtensionMessage(message) {
  const placeholderNames = getPlaceholderNames(message.message);
  if (!placeholderNames.length) return message;

  return {
    ...message,
    message: placeholderNames.reduce(
      (text, name) => text.replaceAll(`{${name}}`, `$${name.toUpperCase()}$`),
      message.message
    ),
    placeholders: Object.fromEntries(placeholderNames.map((name, index) => [
      name,
      { content: `$${index + 1}` }
    ]))
  };
}

function getPlaceholderNames(message) {
  const names = new Set();
  for (const match of String(message).matchAll(/\{(\w+)\}/g)) {
    names.add(match[1]);
  }
  return [...names];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await syncExtensionLocales(process.argv[2] ? path.resolve(process.argv[2]) : defaultOutputDir);
}
