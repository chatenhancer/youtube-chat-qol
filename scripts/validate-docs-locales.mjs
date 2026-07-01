import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = path.join(rootDir, 'docs', 'src', 'i18n');
const blogDir = path.join(rootDir, 'docs', 'src', 'content', 'blog');
const baseLocale = 'en.json';
const basePath = path.join(localesDir, baseLocale);

export async function validateDocsLocales() {
  const baseMessages = JSON.parse(await readFile(basePath, 'utf8'));
  const expectedMessages = flattenMessages(baseMessages);
  const expectedKeys = Object.keys(expectedMessages);
  const localeFiles = (await readdir(localesDir))
    .filter((file) => file.endsWith('.json'))
    .sort();
  const locales = localeFiles.map((file) => path.basename(file, '.json'));

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

  const blogPostCount = await validateBlogPostLocales(errors, locales);

  if (errors.length) {
    throw new Error(`Docs locale validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`);
  }

  console.log(
    `Docs locale keys, placeholders, and blog post structures match ${baseLocale} `
      + `(${expectedKeys.length} keys, ${localeFiles.length} locales, ${blogPostCount} blog posts).`
  );
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

async function validateBlogPostLocales(errors, locales) {
  const postDirs = (await readdir(blogDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const translatedLocales = locales.filter((locale) => locale !== 'en');

  for (const postDir of postDirs) {
    const postPath = path.join(blogDir, postDir);
    const entries = await readBlogMarkdownEntries(postPath);
    const english = entries.find((entry) => entry.frontmatter.locale === 'en')
      || entries.find((entry) => entry.fileName === 'index.md');

    if (!english) {
      errors.push(`blog/${postDir} missing English source post`);
      continue;
    }

    const englishStructure = getBlogStructureSignature(english.body, locales);
    const invariantFrontmatter = getBlogInvariantFrontmatter(english.frontmatter);

    for (const locale of translatedLocales) {
      const translation = entries.find((entry) => entry.fileName === `${locale}.md`);

      if (!translation) {
        errors.push(`blog/${postDir} missing ${locale}.md`);
        continue;
      }

      validateBlogFrontmatter(errors, postDir, locale, invariantFrontmatter, translation.frontmatter);

      const structure = getBlogStructureSignature(translation.body, locales);
      if (JSON.stringify(structure) !== JSON.stringify(englishStructure)) {
        errors.push(`blog/${postDir}/${locale}.md structure differs from English source`);
      }
    }
  }

  return postDirs.length;
}

async function readBlogMarkdownEntries(postPath) {
  const files = (await readdir(postPath))
    .filter((file) => file.endsWith('.md'))
    .sort();

  return Promise.all(files.map(async (fileName) => ({
    fileName,
    ...parseMarkdownEntry(await readFile(path.join(postPath, fileName), 'utf8'), fileName)
  })));
}

function parseMarkdownEntry(source, fileName) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error(`Blog post ${fileName} is missing frontmatter.`);
  }

  return {
    body: match[2],
    frontmatter: parseFrontmatter(match[1])
  };
}

function parseFrontmatter(source) {
  const data = {};
  let currentKey = '';

  for (const line of source.split('\n')) {
    const field = line.match(/^([A-Za-z_][\w-]*):(?:\s*(.*))?$/);
    if (field) {
      currentKey = field[1];
      data[currentKey] = cleanFrontmatterValue(field[2] || '');
      continue;
    }

    const listItem = line.match(/^\s+-\s+(.*)$/);
    if (listItem && currentKey) {
      if (!Array.isArray(data[currentKey])) data[currentKey] = [];
      data[currentKey].push(cleanFrontmatterValue(listItem[1]));
    }
  }

  return data;
}

function cleanFrontmatterValue(value) {
  const trimmed = String(value).trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
  return trimmed;
}

function getBlogInvariantFrontmatter(frontmatter) {
  return {
    cover_width: frontmatter.cover_width || '',
    date: frontmatter.date || '',
    image: frontmatter.image || '',
    slug: frontmatter.slug || '',
    tags: frontmatter.tags || [],
    translationKey: frontmatter.translationKey || '',
    video: frontmatter.video || ''
  };
}

function validateBlogFrontmatter(errors, postDir, locale, expected, actual) {
  if (actual.locale !== locale) {
    errors.push(`blog/${postDir}/${locale}.md locale must be ${locale}, got ${actual.locale || '(missing)'}`);
  }

  const actualInvariant = getBlogInvariantFrontmatter(actual);
  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify(value) === JSON.stringify(actualInvariant[key])) continue;
    errors.push(`blog/${postDir}/${locale}.md ${key} differs from English source`);
  }
}

function getBlogStructureSignature(body, locales) {
  return body
    .trim()
    .split(/\n{2,}/)
    .map((block) => getBlogBlockSignature(block.trim(), locales));
}

function getBlogBlockSignature(block, locales) {
  const heading = block.match(/^(#{1,6})\s+/);
  if (heading) return `heading:${heading[1]}`;

  if (/^:::[\w-]*$/.test(block) || block === ':::') return `directive:${block}`;

  const image = block.match(/^!\[[^\]]*\]\(([^)]+)\)(.*)$/);
  if (image) return `image:${image[1]}${image[2] || ''}`;

  const unorderedItems = block.split('\n').filter((line) => /^[-*]\s+/.test(line)).length;
  if (unorderedItems) return `ul:${unorderedItems}:${getInlineStructureSignature(block, locales)}`;

  const orderedItems = block.split('\n').filter((line) => /^\d+\.\s+/.test(line)).length;
  if (orderedItems) return `ol:${orderedItems}:${getInlineStructureSignature(block, locales)}`;

  return `paragraph:${getInlineStructureSignature(block, locales)}`;
}

function getInlineStructureSignature(value, locales) {
  return [
    `links:${getMarkdownLinks(value).map((href) => normalizeBlogHref(href, locales)).join(',')}`,
    `strong:${[...value.matchAll(/\*\*[^*]+\*\*/g)].length}`,
    `code:${[...value.matchAll(/`[^`]+`/g)].length}`
  ].join(';');
}

function getMarkdownLinks(value) {
  const links = [];
  for (const match of value.matchAll(/(!)?\[[^\]]*\]\(([^)]+)\)/g)) {
    if (!match[1]) links.push(match[2]);
  }
  return links;
}

function normalizeBlogHref(href, locales) {
  let normalized = href;
  for (const locale of locales) {
    const localePath = getDocsLocalePath(locale);
    if (!localePath) continue;
    normalized = normalized.replace(new RegExp(`^/${escapeRegExp(localePath)}/blog/`), '/blog/');
  }

  return normalized;
}

function getDocsLocalePath(locale) {
  if (locale === 'en') return '';
  if (locale === 'zh_CN') return 'zh-CN';
  if (locale === 'zh_TW') return 'zh-TW';
  return locale;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await validateDocsLocales();
}
