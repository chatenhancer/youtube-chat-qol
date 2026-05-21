/*
 * Synchronizes public command reference docs from src/shared/chatCommands.json.
 *
 * The extension help card imports the same JSON, so README and the landing page
 * stay aligned with the app behavior when this script runs during builds.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import commandReference from '../src/shared/chatCommands.json' with { type: 'json' };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readmePath = path.join(root, 'README.md');
const docsPath = path.join(root, 'docs', 'index.html');
const markerStart = '<!-- chat-commands:start -->';
const markerEnd = '<!-- chat-commands:end -->';

export async function syncCommandDocs() {
  await Promise.all([
    syncReadmeCommands(),
    syncDocsCommands()
  ]);
}

async function syncReadmeCommands() {
  const original = await readFile(readmePath, 'utf8');
  const section = createReadmeCommandSection();
  const next = replaceBetweenHeadings(original, '## Chat Commands', '## Screenshots', section);
  if (next !== original) await writeFile(readmePath, next);
}

async function syncDocsCommands() {
  const original = await readFile(docsPath, 'utf8');
  const block = indent(createDocsCommandBlock(), 10);
  const next = replaceMarkedBlock(original, block) || replaceDocsCommandBlock(original, block);
  if (next !== original) await writeFile(docsPath, next);
}

function createReadmeCommandSection() {
  return [
    '## Chat Commands',
    '',
    markerStart,
    '',
    commandReference.intro,
    '',
    commandReference.inlineSummary,
    '',
    ...commandReference.groups.flatMap((group) => [
      `### ${group.title}`,
      '',
      ...group.commands.flatMap(createReadmeCommandLines),
      ''
    ]),
    `Use \`//\` to send a literal slash command, such as \`${commandReference.escapeExample}\`.`,
    '',
    markerEnd,
    '',
    ''
  ].join('\n');
}

function createDocsCommandBlock() {
  return [
    markerStart,
    '<div class="command-notes" aria-label="Command usage notes">',
    '  <p>',
    `    <strong>Inline commands:</strong> ${formatHtmlCodeList(getInlineCommands())} can expand inside a sentence.`,
    '  </p>',
    '  <p>',
    `    <strong>Whole-input commands:</strong> ${formatHtmlCodeList(getWholeInputCommands())} should be the only text in the input.`,
    '  </p>',
    '</div>',
    '',
    '<div class="command-groups">',
    ...commandReference.groups.flatMap((group) => createDocsCommandGroup(group)),
    '</div>',
    markerEnd
  ].join('\n');
}

function createDocsCommandGroup(group) {
  return [
    '  <article class="command-group">',
    `    <h3>${escapeHtml(group.title)}</h3>`,
    '    <dl class="command-list">',
    ...group.commands.flatMap(createDocsCommandLines),
    '    </dl>',
    '  </article>'
  ];
}

function createReadmeCommandLines(command) {
  const lines = [
    `- ${formatMarkdownExamples(command.examples)} + \`Tab\`: ${command.readmeDescription}`
  ];
  const note = getMarkdownCommandNote(command);
  if (note) lines.push(`  ${note}`);
  return lines;
}

function createDocsCommandLines(command) {
  return [
    '      <div>',
    `        <dt>${formatHtmlCommandExamples(command.examples)}</dt>`,
    `        <dd>${escapeHtml(command.docsDescription)}${getHtmlCommandNote(command)}</dd>`,
    '      </div>'
  ];
}

function getMarkdownCommandNote(command) {
  if (command.names.includes('time')) {
    return `Supported aliases: ${formatMarkdownInlineList(getTimeAliases())}.`;
  }

  if (command.names.includes('timeuntil')) {
    return `Accepted formats: ${formatMarkdownInlineList(commandReference.timeUntilFormats)}.`;
  }

  return '';
}

function getHtmlCommandNote(command) {
  if (command.names.includes('time')) {
    return `<br><span class="command-detail">Supported aliases: ${formatHtmlCodeList(getTimeAliases())}.</span>`;
  }

  if (command.names.includes('timeuntil')) {
    return `<br><span class="command-detail">Accepted formats: ${formatHtmlCodeList(commandReference.timeUntilFormats)}.</span>`;
  }

  return '';
}

function replaceBetweenHeadings(value, startHeading, endHeading, replacement) {
  const start = value.indexOf(startHeading);
  const end = value.indexOf(endHeading, start);
  if (start === -1 || end === -1) {
    throw new Error(`Could not find ${startHeading} section in README.md`);
  }

  return `${value.slice(0, start)}${replacement}${value.slice(end)}`;
}

function replaceMarkedBlock(value, replacement) {
  const start = value.indexOf(markerStart);
  const end = value.indexOf(markerEnd, start);
  if (start === -1 || end === -1) return '';
  const lineStart = value.lastIndexOf('\n', start) + 1;

  return `${value.slice(0, lineStart)}${replacement}${value.slice(end + markerEnd.length)}`;
}

function replaceDocsCommandBlock(value, replacement) {
  const startNeedle = '          <div class="command-notes" aria-label="Command usage notes">';
  const endNeedle = '\n        </div>\n      </section>';
  const start = value.indexOf(startNeedle);
  const end = value.indexOf(endNeedle, start);
  if (start === -1 || end === -1) {
    throw new Error('Could not find command section content in docs/index.html');
  }

  return `${value.slice(0, start)}${replacement}${value.slice(end)}`;
}

function getInlineCommands() {
  return commandReference.groups
    .flatMap((group) => group.commands)
    .filter((command) => command.inline)
    .flatMap((command) => command.examples.map((example) => example.split(/\s+/)[0]))
    .filter((value, index, values) => values.indexOf(value) === index);
}

function getWholeInputCommands() {
  const wholeInput = commandReference.groups
    .flatMap((group) => group.commands)
    .filter((command) => command.kind === 'text' && command.wholeInput)
    .flatMap((command) => command.examples.map((example) => example.split(/\s+/)[0]));

  return [...wholeInput, 'all /set... commands']
    .filter((value, index, values) => values.indexOf(value) === index);
}

function getTimeAliases() {
  return commandReference.timeZones.flatMap((zone) => zone.aliases);
}

function formatMarkdownExamples(examples) {
  return examples.map((example) => `\`${example}\``).join(' or ');
}

function formatMarkdownInlineList(values) {
  return values.map((value) => `\`${value}\``).join(', ').replace(/, ([^,]*)$/, ', and $1');
}

function formatHtmlCodeList(values) {
  return values
    .map(formatHtmlCodeValue)
    .join(', ')
    .replace(/, ([^,]*)$/, ', and $1');
}

function formatHtmlCommandExamples(values) {
  return values.map((value) => `<code>${escapeHtml(value)}</code>`).join(' or ');
}

function formatHtmlCodeValue(value) {
  if (value === 'all /set... commands') return 'all <code>/set...</code> commands';
  return `<code>${escapeHtml(value)}</code>`;
}

function indent(value, spaces) {
  const prefix = ' '.repeat(spaces);
  return value.split('\n').map((line) => line ? `${prefix}${line}` : '').join('\n');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await syncCommandDocs();
}
