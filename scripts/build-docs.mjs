import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDocsLocales } from './validate-docs-locales.mjs';

const SITE_URL = 'https://chatenhancer.com';
const DEFAULT_LOCALE = 'en';
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = path.join(rootDir, 'docs');
const i18nDir = path.join(docsDir, 'i18n');
const templatePath = path.join(docsDir, 'index.html');
const sitemapPath = path.join(docsDir, 'sitemap.xml');

const localeMeta = {
  ar: { dir: 'rtl', ogLocale: 'ar_AR', path: 'ar' },
  de: { ogLocale: 'de_DE', path: 'de' },
  en: { ogLocale: 'en_US', path: '' },
  es: { ogLocale: 'es_ES', path: 'es' },
  fa: { dir: 'rtl', ogLocale: 'fa_IR', path: 'fa' },
  fr: { ogLocale: 'fr_FR', path: 'fr' },
  he: { dir: 'rtl', ogLocale: 'he_IL', path: 'he' },
  hi: { ogLocale: 'hi_IN', path: 'hi' },
  id: { ogLocale: 'id_ID', path: 'id' },
  it: { ogLocale: 'it_IT', path: 'it' },
  ja: { ogLocale: 'ja_JP', path: 'ja' },
  ko: { ogLocale: 'ko_KR', path: 'ko' },
  nl: { ogLocale: 'nl_NL', path: 'nl' },
  pl: { ogLocale: 'pl_PL', path: 'pl' },
  pt: { ogLocale: 'pt_BR', path: 'pt' },
  ru: { ogLocale: 'ru_RU', path: 'ru' },
  th: { ogLocale: 'th_TH', path: 'th' },
  tr: { ogLocale: 'tr_TR', path: 'tr' },
  uk: { ogLocale: 'uk_UA', path: 'uk' },
  vi: { ogLocale: 'vi_VN', path: 'vi' },
  zh_CN: { htmlLang: 'zh-CN', ogLocale: 'zh_CN', path: 'zh-CN' },
  zh_TW: { htmlLang: 'zh-TW', ogLocale: 'zh_TW', path: 'zh-TW' }
};

await validateDocsLocales();

const template = await readFile(templatePath, 'utf8');
const localeFiles = (await readdir(i18nDir))
  .filter((file) => file.endsWith('.json'))
  .sort();
const locales = [
  DEFAULT_LOCALE,
  ...localeFiles
    .map((file) => path.basename(file, '.json'))
    .filter((locale) => locale !== DEFAULT_LOCALE)
];

for (const locale of locales) {
  const file = `${locale}.json`;
  if (locale === DEFAULT_LOCALE) continue;

  const meta = localeMeta[locale];
  if (!meta) throw new Error(`No docs locale metadata for ${locale}`);

  const messages = JSON.parse(await readFile(path.join(i18nDir, file), 'utf8'));
  const pagePath = path.join(docsDir, meta.path, 'index.html');
  const html = buildLocalizedPage(template, messages, locale, meta);

  await mkdir(path.dirname(pagePath), { recursive: true });
  await writeFile(pagePath, html);
}

await writeSitemap(locales);

console.log(`Generated ${localeFiles.length - 1} localized docs pages and sitemap.xml.`);

function buildLocalizedPage(source, messages, locale, meta) {
  const htmlLang = meta.htmlLang || locale;
  const pageUrl = getPageUrl(meta);
  let html = source;

  html = html.replace(
    /<html lang="en">/,
    `<html lang="${escapeHtmlAttribute(htmlLang)}"${meta.dir ? ` dir="${escapeHtmlAttribute(meta.dir)}"` : ''}>`
  );
  html = replaceDataI18nAttributes(html, messages);
  html = replaceDataI18nElements(html, messages, 'data-i18n', escapeHtml);
  html = replaceDataI18nElements(html, messages, 'data-i18n-html', String);
  html = rewriteHeadMetadata(html, messages, pageUrl, meta.ogLocale);
  html = rewriteStructuredData(html, messages, pageUrl);
  html = rewriteRelativeAssetPaths(html);

  return html;
}

function replaceDataI18nElements(html, messages, attributeName, formatter) {
  let result = '';
  let index = 0;
  const openTagPattern = new RegExp(`<([a-z][\\w:-]*)\\b[^>]*\\b${attributeName}="([^"]+)"[^>]*>`, 'gi');

  while (true) {
    openTagPattern.lastIndex = index;
    const match = openTagPattern.exec(html);
    if (!match) {
      result += html.slice(index);
      break;
    }

    const [openTag, tagName, key] = match;
    const contentStart = match.index + openTag.length;
    const close = findClosingTag(html, tagName, contentStart);
    const value = getMessage(messages, key);

    result += html.slice(index, match.index);
    result += openTag;
    result += formatter(value);
    result += html.slice(close.start, close.end);
    index = close.end;
  }

  return result;
}

function replaceDataI18nAttributes(html, messages) {
  return html.replace(/<([a-z][\w:-]*)\b([^>]*\bdata-i18n-attr="([^"]+)"[^>]*)>/gi, (match, tagName, attrs, spec) => {
    let nextAttrs = attrs;

    for (const entry of spec.split(';').map((part) => part.trim()).filter(Boolean)) {
      const [attributeName, key] = entry.split(':').map((part) => part.trim());
      if (!attributeName || !key) throw new Error(`Invalid data-i18n-attr entry: ${entry}`);

      const value = escapeHtmlAttribute(getMessage(messages, key));
      const attributePattern = new RegExp(`\\b${escapeRegExp(attributeName)}="[^"]*"`);
      if (attributePattern.test(nextAttrs)) {
        nextAttrs = nextAttrs.replace(attributePattern, `${attributeName}="${value}"`);
      } else {
        nextAttrs += ` ${attributeName}="${value}"`;
      }
    }

    return `<${tagName}${nextAttrs}>`;
  });
}

function findClosingTag(html, tagName, startIndex) {
  const tagPattern = new RegExp(`</?${escapeRegExp(tagName)}\\b[^>]*>`, 'gi');
  tagPattern.lastIndex = startIndex;
  let depth = 1;

  while (true) {
    const match = tagPattern.exec(html);
    if (!match) throw new Error(`Could not find closing tag for ${tagName}`);

    if (match[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) {
        return {
          end: tagPattern.lastIndex,
          start: match.index
        };
      }
    } else if (!match[0].endsWith('/>')) {
      depth += 1;
    }
  }
}

function rewriteHeadMetadata(html, messages, pageUrl, ogLocale) {
  return html
    .replace(/<link rel="canonical" href="[^"]+">/, `<link rel="canonical" href="${escapeHtmlAttribute(pageUrl)}">`)
    .replace(/<meta property="og:url" content="[^"]+">/, `<meta property="og:url" content="${escapeHtmlAttribute(pageUrl)}">`)
    .replace(/<meta property="og:locale" content="[^"]+">/, `<meta property="og:locale" content="${escapeHtmlAttribute(ogLocale)}">`)
    .replace(
      /"description": "Lightweight translation, mention, quote, profile, emoji, and command tools for YouTube live chat\."/,
      `"description": ${JSON.stringify(messages.meta.description)}`
    );
}

function rewriteStructuredData(html, messages, pageUrl) {
  return html.replace(
    /<script type="application\/ld\+json">\n([\s\S]*?)\n {4}<\/script>/,
    (_match, rawJson) => {
      const data = JSON.parse(rawJson);
      data.description = messages.meta.description;
      data.url = pageUrl;

      const json = JSON.stringify(data, null, 8)
        .split('\n')
        .map((line) => `      ${line}`)
        .join('\n');

      return `<script type="application/ld+json">\n${json}\n    </script>`;
    }
  );
}

function rewriteRelativeAssetPaths(html) {
  return html
    .replace(/\b(href|src)="assets\//g, '$1="../assets/')
    .replace(/\bhref="styles\.css/g, 'href="../styles.css');
}

async function writeSitemap(locales) {
  const pages = locales.map((locale) => {
    const meta = localeMeta[locale];
    if (!meta) throw new Error(`No docs locale metadata for ${locale}`);
    return {
      hreflang: meta.htmlLang || locale,
      url: getPageUrl(meta)
    };
  });

  const alternateLinks = pages
    .map((page) => `    <xhtml:link rel="alternate" hreflang="${escapeXmlAttribute(page.hreflang)}" href="${escapeXmlAttribute(page.url)}" />`)
    .join('\n');
  const xDefaultLink = `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXmlAttribute(getPageUrl(localeMeta[DEFAULT_LOCALE]))}" />`;
  const urls = pages
    .map((page) => [
      '  <url>',
      `    <loc>${escapeXml(page.url)}</loc>`,
      alternateLinks,
      xDefaultLink,
      '    <changefreq>weekly</changefreq>',
      '  </url>'
    ].join('\n'))
    .join('\n');

  await writeFile(sitemapPath, [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    urls,
    '</urlset>',
    ''
  ].join('\n'));
}

function getPageUrl(meta) {
  return `${SITE_URL}/${meta.path ? `${meta.path}/` : ''}`;
}

function getMessage(messages, key) {
  const value = key.split('.').reduce((current, part) => current?.[part], messages);
  if (typeof value !== 'string') throw new Error(`Missing docs i18n key: ${key}`);
  return value;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

function escapeXml(value) {
  return escapeHtml(value).replace(/'/g, '&apos;').replace(/"/g, '&quot;');
}

function escapeXmlAttribute(value) {
  return escapeXml(value);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
