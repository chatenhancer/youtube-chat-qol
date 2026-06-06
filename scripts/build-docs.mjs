import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import contact from '../src/shared/contact.json' with { type: 'json' };
import { validateDocsLocales } from './validate-docs-locales.mjs';

const SITE_URL = 'https://chatenhancer.com';
const DEFAULT_LOCALE = 'en';
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = path.join(rootDir, 'docs');
const siteOutputDir = path.join(rootDir, 'dist', 'docs');
const i18nDir = path.join(docsDir, 'i18n');
const templatePath = path.join(docsDir, 'index.html');
const stylePath = path.join(docsDir, 'styles.css');
const videosDir = path.join(docsDir, 'videos');
const generatedComment = createGeneratedComment();

const localeMeta = {
  ar: { dir: 'rtl', label: 'العربية', ogLocale: 'ar_AR', path: 'ar' },
  de: { label: 'Deutsch', ogLocale: 'de_DE', path: 'de' },
  en: { label: 'English', ogLocale: 'en_US', path: '' },
  es: { label: 'Español', ogLocale: 'es_ES', path: 'es' },
  fa: { dir: 'rtl', label: 'فارسی', ogLocale: 'fa_IR', path: 'fa' },
  fr: { label: 'Français', ogLocale: 'fr_FR', path: 'fr' },
  he: { dir: 'rtl', label: 'עברית', ogLocale: 'he_IL', path: 'he' },
  hi: { label: 'हिन्दी', ogLocale: 'hi_IN', path: 'hi' },
  id: { label: 'Bahasa Indonesia', ogLocale: 'id_ID', path: 'id' },
  it: { label: 'Italiano', ogLocale: 'it_IT', path: 'it' },
  ja: { label: '日本語', ogLocale: 'ja_JP', path: 'ja' },
  ko: { label: '한국어', ogLocale: 'ko_KR', path: 'ko' },
  nl: { label: 'Nederlands', ogLocale: 'nl_NL', path: 'nl' },
  pl: { label: 'Polski', ogLocale: 'pl_PL', path: 'pl' },
  pt: { label: 'Português', ogLocale: 'pt_BR', path: 'pt' },
  ru: { label: 'Русский', ogLocale: 'ru_RU', path: 'ru' },
  th: { label: 'ไทย', ogLocale: 'th_TH', path: 'th' },
  tr: { label: 'Türkçe', ogLocale: 'tr_TR', path: 'tr' },
  uk: { label: 'Українська', ogLocale: 'uk_UA', path: 'uk' },
  vi: { label: 'Tiếng Việt', ogLocale: 'vi_VN', path: 'vi' },
  zh_CN: { htmlLang: 'zh-CN', label: '中文（简体）', ogLocale: 'zh_CN', path: 'zh-CN' },
  zh_TW: { htmlLang: 'zh-TW', label: '中文（繁體）', ogLocale: 'zh_TW', path: 'zh-TW' }
};

await validateDocsLocales();
const docsAssetVersions = {
  styles: await getFileAssetVersion(stylePath)
};
const docsConfig = await createDocsConfig();
await prepareSiteOutput();
const localeFiles = (await readdir(i18nDir))
  .filter((file) => file.endsWith('.json'))
  .sort();
const locales = [
  DEFAULT_LOCALE,
  ...localeFiles
    .map((file) => path.basename(file, '.json'))
    .filter((locale) => locale !== DEFAULT_LOCALE)
];
const sourceTemplate = await readFile(templatePath, 'utf8');
const template = injectLanguageOptions(
  injectAlternateLinks(applyDocsAssetVersions(sourceTemplate, docsAssetVersions), locales),
  locales
);
let siteIndex = injectDocsConfig(template, docsConfig);
if (process.env.YTCQ_DOCS_STAMP_SOURCE === '1') {
  siteIndex = addGeneratedHtmlComment(siteIndex);
}
await writeFile(path.join(siteOutputDir, 'index.html'), siteIndex);

for (const locale of locales) {
  const file = `${locale}.json`;
  if (locale === DEFAULT_LOCALE) continue;

  const meta = localeMeta[locale];
  if (!meta) throw new Error(`No docs locale metadata for ${locale}`);

  const messages = JSON.parse(await readFile(path.join(i18nDir, file), 'utf8'));
  const sitePagePath = path.join(siteOutputDir, meta.path, 'index.html');
  const html = injectDocsConfig(
    buildLocalizedPage(template, messages, locale, meta),
    createLocalizedDocsConfig(docsConfig)
  );

  await mkdir(path.dirname(sitePagePath), { recursive: true });
  await writeFile(sitePagePath, html);
}

await writeSitemap(locales, path.join(siteOutputDir, 'sitemap.xml'));

console.log(`Generated dist/docs Pages output with ${localeFiles.length - 1} localized pages and sitemap.xml.`);

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
  html = addGeneratedHtmlComment(html);

  return html;
}

function createGeneratedComment() {
  const source = process.env.YTCQ_DOCS_BUILD_SHA
    ? `; source=${process.env.YTCQ_DOCS_BUILD_SHA}`
    : '';

  return `<!-- ytcq-docs-generated: ${new Date().toISOString()}${source} -->`;
}

function addGeneratedHtmlComment(html) {
  const withoutOldComment = html.replace(/\n?<!-- ytcq-docs-generated: [\s\S]*? -->\n?/g, '\n');
  return withoutOldComment.replace(/^<!doctype html>\n/i, `<!doctype html>\n${generatedComment}\n`);
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
    .replace(/<meta property="og:locale" content="[^"]+">/, `<meta property="og:locale" content="${escapeHtmlAttribute(ogLocale)}">`);
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

function applyDocsAssetVersions(html, versions) {
  return html
    .replace(
      /\bhref="styles\.css(?:\?v=[^"]*)?"/,
      `href="styles.css?v=${escapeHtmlAttribute(versions.styles)}"`
    );
}

function injectLanguageOptions(html, locales) {
  const options = locales.map((locale) => {
    const meta = localeMeta[locale];
    if (!meta?.label) throw new Error(`No docs locale label for ${locale}`);

    const value = meta.path ? `/${meta.path}/` : '/';
    return `<option value="${escapeHtmlAttribute(value)}">${escapeHtml(meta.label)}</option>`;
  }).join('\n            ');

  return html.replace(
    /(<select\b[^>]*\bdata-language-switcher\b[^>]*>)[\s\S]*?(<\/select>)/,
    `$1\n            ${options}\n          $2`
  );
}

function injectAlternateLinks(html, locales) {
  const alternateLinks = locales.map((locale) => {
    const meta = localeMeta[locale];
    if (!meta) throw new Error(`No docs locale metadata for ${locale}`);

    const hreflang = meta.htmlLang || locale;
    return `<link rel="alternate" hreflang="${escapeHtmlAttribute(hreflang)}" href="${escapeHtmlAttribute(getPageUrl(meta))}">`;
  });
  alternateLinks.push(
    `<link rel="alternate" hreflang="x-default" href="${escapeHtmlAttribute(getPageUrl(localeMeta[DEFAULT_LOCALE]))}">`
  );

  return html.replace('    <!-- docs-alternate-links -->', `    ${alternateLinks.join('\n    ')}`);
}

function injectDocsConfig(html, config) {
  const json = JSON.stringify(config).replace(/</g, '\\u003c');
  return html.replace(
    /<script type="application\/json" data-docs-config>[\s\S]*?<\/script>/,
    `<script type="application/json" data-docs-config>${json}</script>`
  );
}

function createLocalizedDocsConfig(config) {
  return {
    ...config,
    ...(config.walkthrough ? { walkthrough: `../${config.walkthrough}` } : {})
  };
}

async function writeSitemap(locales, outputPath) {
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

  await writeFile(outputPath, [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    urls,
    '</urlset>',
    ''
  ].join('\n'));
}

async function prepareSiteOutput() {
  await rm(siteOutputDir, { recursive: true, force: true });
  await mkdir(siteOutputDir, { recursive: true });

  for (const fileName of ['.nojekyll', 'CNAME', 'robots.txt', 'styles.css']) {
    await cp(path.join(docsDir, fileName), path.join(siteOutputDir, fileName));
  }

  for (const directoryName of ['assets', 'badges', 'videos']) {
    const sourceDir = path.join(docsDir, directoryName);
    const targetDir = path.join(siteOutputDir, directoryName);
    await cp(sourceDir, targetDir, {
      recursive: true,
      filter: (source) => !['.DS_Store', 'contact.js', 'video.js'].includes(path.basename(source))
    }).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
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

async function createDocsConfig() {
  const walkthroughFileName = await findLatestWalkthroughVideo();
  return {
    supportEmail: contact.supportEmail,
    ...(walkthroughFileName ? { walkthrough: `videos/${walkthroughFileName}` } : {})
  };
}

function getAssetVersion(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 8);
}

async function getFileAssetVersion(filePath) {
  return getAssetVersion(await readFile(filePath));
}

async function findLatestWalkthroughVideo() {
  const entries = await readdir(videosDir).catch(() => []);
  const candidates = entries.filter((entry) => /^chat-enhancer-walkthrough-[a-f0-9]{8}\.mp4$/.test(entry));
  if (!candidates.length) return '';

  const files = await Promise.all(candidates.map(async (fileName) => {
    const fileStat = await stat(path.join(videosDir, fileName));
    return { fileName, mtimeMs: fileStat.mtimeMs };
  }));

  files.sort((first, second) => second.mtimeMs - first.mtimeMs || first.fileName.localeCompare(second.fileName));
  return files[0].fileName;
}
