/**
 * Chat input slash commands.
 *
 * Commands are intentionally conservative: known commands run with Tab and
 * never auto-send. Enter only blocks known commands from leaking into chat.
 * Unknown slash-prefixed text is left to YouTube.
 */
import { LANGUAGE_OPTIONS, getLanguageLabel } from '../shared/languages';
import { QUOTE_LENGTH_OPTIONS, type Options, type TranslationDisplay } from '../shared/options';
import { cleanText } from '../shared/text';
import { showToast } from '../shared/toast';
import {
  findChatInput,
  getChatInputSnapshot,
  getChatInputText,
  getChatInputTextSelection,
  replaceChatInput,
  replaceChatInputTextRange,
  replaceChatInputSnapshot,
  type ChatInputSnapshot,
  type ChatInputTextSelection
} from '../youtube/chatInput';
import { formatMentionText, formatQuoteText } from './reply';
import { getLatestMentionRecord } from './mentionsInbox';

type SaveOptions = (values: Partial<Options>) => void;

interface ParsedCommand {
  args: string;
  name: string;
  text: string;
}

interface InlineParsedCommand extends ParsedCommand {
  end: number;
  start: number;
}

const SEND_BUTTON_SELECTOR = [
  '#send-button',
  '#send-button button',
  'yt-button-renderer#send-button',
  'yt-icon-button#send-button',
  'button[aria-label="Send"]',
  'button[title="Send"]'
].join(',');

const TEXT_COMPLETION_COMMANDS = new Set(['help', 'mention', 'reply', 'quote', 'again', 'repeat', 'time', 'timeuntil']);
const INLINE_TEXT_COMPLETION_COMMANDS = new Set(['mention', 'reply', 'time', 'timeuntil']);
const SETTING_COMMANDS = new Set([
  'setmentionsound',
  'setopenchannelsinpopup',
  'setopenprofilesinpopup',
  'setquotelength',
  'settranslateto',
  'settranslationdisplay'
]);
const languageByCommandName = createLanguageCommandMap();
const timeZoneByCommandName = new Map<string, TimeZoneOption>([
  ['utc', { label: 'UTC', timeZone: 'UTC' }],
  ['tokyo', { label: 'Tokyo', timeZone: 'Asia/Tokyo' }],
  ['jst', { label: 'Tokyo', timeZone: 'Asia/Tokyo' }],
  ['seoul', { label: 'Seoul', timeZone: 'Asia/Seoul' }],
  ['kst', { label: 'Seoul', timeZone: 'Asia/Seoul' }],
  ['london', { label: 'London', timeZone: 'Europe/London' }],
  ['paris', { label: 'Paris', timeZone: 'Europe/Paris' }],
  ['madrid', { label: 'Madrid', timeZone: 'Europe/Madrid' }],
  ['newyork', { label: 'New York', timeZone: 'America/New_York' }],
  ['nyc', { label: 'New York', timeZone: 'America/New_York' }],
  ['et', { label: 'New York', timeZone: 'America/New_York' }],
  ['eastern', { label: 'New York', timeZone: 'America/New_York' }],
  ['losangeles', { label: 'Los Angeles', timeZone: 'America/Los_Angeles' }],
  ['la', { label: 'Los Angeles', timeZone: 'America/Los_Angeles' }],
  ['pt', { label: 'Los Angeles', timeZone: 'America/Los_Angeles' }],
  ['pacific', { label: 'Los Angeles', timeZone: 'America/Los_Angeles' }]
]);

interface TimeZoneOption {
  label: string;
  timeZone: string;
}

let lastSentMessage: ChatInputSnapshot | null = null;
let escapedSlashText = '';
let activeHelpCard: HTMLElement | null = null;
let activeHelpCardCleanup: (() => void) | null = null;

export function initChatCommands(saveOptions: SaveOptions): void {
  document.addEventListener('keydown', (event) => handleChatCommandKeydown(event, saveOptions), true);
  document.addEventListener('click', handleChatCommandSendClick, true);
}

function handleChatCommandKeydown(event: KeyboardEvent, saveOptions: SaveOptions): void {
  if (event.defaultPrevented || event.isComposing) return;
  if (event.key !== 'Tab' && event.key !== 'Enter') return;
  if (!isFromChatInput(event.target)) return;

  const inputSelection = getChatInputTextSelection();
  const inputText = inputSelection?.text || getChatInputText();
  const parsed = parseCommand(inputText);
  if (!parsed) {
    if (event.key === 'Tab' && inputSelection) {
      const inlineParsed = parseInlineTextCommand(inputSelection);
      if (inlineParsed) {
        void executeInlineTextCommand(event, inlineParsed);
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) rememberLastSentMessage(inputText);
    return;
  }

  if (parsed.text.startsWith('//')) {
    handleEscapedCommand(event, parsed.text);
    return;
  }

  if (event.key === 'Tab') {
    void executeTabCommand(event, parsed, saveOptions);
    return;
  }

  if (event.shiftKey) return;
  if (escapedSlashText && parsed.text === escapedSlashText) {
    escapedSlashText = '';
    rememberLastSentMessage(parsed.text);
    return;
  }

  if (isKnownCommand(parsed.name)) {
    preventCommandEvent(event);
    showToast('Press Tab to run this command.');
    return;
  }

  rememberLastSentMessage(parsed.text);
}

function handleChatCommandSendClick(event: MouseEvent): void {
  if (event.defaultPrevented || !isSendButtonClick(event.target)) return;

  const text = getChatInputText();
  const parsed = parseCommand(text);
  if (!parsed) {
    rememberLastSentMessage(text);
    return;
  }

  if (parsed.text.startsWith('//')) {
    handleEscapedCommand(event, parsed.text);
    return;
  }

  if (escapedSlashText && parsed.text === escapedSlashText) {
    escapedSlashText = '';
    rememberLastSentMessage(parsed.text);
    return;
  }

  if (isKnownCommand(parsed.name)) {
    preventCommandEvent(event);
    showToast('Press Tab to run this command.');
    return;
  }

  rememberLastSentMessage(parsed.text);
}

async function executeTabCommand(event: KeyboardEvent, parsed: ParsedCommand, saveOptions: SaveOptions): Promise<void> {
  if (!isKnownCommand(parsed.name)) return;
  preventCommandEvent(event);

  if (SETTING_COMMANDS.has(parsed.name)) {
    executeSetCommand(parsed, saveOptions);
    return;
  }

  if (parsed.name === 'help') {
    replaceChatInput('');
    showChatCommandHelp();
    return;
  }

  if (parsed.name === 'mention' || parsed.name === 'reply') {
    replaceCommandText(await getMentionCommandText(), 'No mentions yet.');
    return;
  }

  if (parsed.name === 'quote') {
    replaceCommandText(await getQuoteCommandText(), 'No mentions yet.');
    return;
  }

  if (parsed.name === 'again' || parsed.name === 'repeat') {
    replaceLastSentMessage();
    return;
  }

  if (parsed.name === 'time') {
    replaceCommandText(formatTime(parsed.args), 'Unknown timezone.');
    return;
  }

  if (parsed.name === 'timeuntil') {
    replaceCommandText(formatTimeUntil(parsed.args), 'Could not read that time.');
  }
}

async function executeInlineTextCommand(event: KeyboardEvent, parsed: InlineParsedCommand): Promise<void> {
  preventCommandEvent(event);

  if (parsed.name === 'mention' || parsed.name === 'reply') {
    replaceInlineCommandText(await getMentionCommandText(), parsed, 'No mentions yet.');
    return;
  }

  if (parsed.name === 'time') {
    replaceInlineCommandText(formatTime(parsed.args), parsed, 'Unknown timezone.');
    return;
  }

  if (parsed.name === 'timeuntil') {
    replaceInlineCommandText(formatTimeUntil(parsed.args), parsed, 'Could not read that time.');
  }
}

function executeSetCommand(parsed: ParsedCommand, saveOptions: SaveOptions): void {
  if (parsed.name === 'settranslateto') {
    executeSetTranslateToCommand(parsed, saveOptions);
    return;
  }

  if (parsed.name === 'settranslationdisplay') {
    executeSetTranslationDisplayCommand(parsed, saveOptions);
    return;
  }

  if (parsed.name === 'setquotelength') {
    executeSetQuoteLengthCommand(parsed, saveOptions);
    return;
  }

  if (parsed.name === 'setmentionsound') {
    executeBooleanSetCommand(parsed, saveOptions, 'mentionSound', 'Mention sound');
    return;
  }

  if (parsed.name === 'setopenchannelsinpopup' || parsed.name === 'setopenprofilesinpopup') {
    executeBooleanSetCommand(parsed, saveOptions, 'openProfilesInPopup', 'Open channels in popup');
    return;
  }

  showToast('Unknown setting command.');
}

function executeSetTranslateToCommand(parsed: ParsedCommand, saveOptions: SaveOptions): void {
  const targetLanguage = getTranslateCommandTarget(parsed.args);
  if (targetLanguage === null) {
    showToast('Unknown translation language.');
    return;
  }

  saveOptions({ targetLanguage });
  replaceChatInput('');
  showToast(targetLanguage ? `Translate to ${getLanguageLabel(targetLanguage)}.` : 'Translation off.');
}

function executeSetTranslationDisplayCommand(parsed: ParsedCommand, saveOptions: SaveOptions): void {
  const display = getTranslationDisplayCommandTarget(parsed.args);
  if (!display) {
    showToast('Use replace or below.');
    return;
  }

  saveOptions({ translationDisplay: display });
  replaceChatInput('');
  showToast(display === 'replace' ? 'Translations replace messages.' : 'Translations show below messages.');
}

function executeSetQuoteLengthCommand(parsed: ParsedCommand, saveOptions: SaveOptions): void {
  const quoteMaxLength = Number(cleanText(parsed.args));
  if (!QUOTE_LENGTH_OPTIONS.some((value) => value === quoteMaxLength)) {
    showToast(`Use quote length ${QUOTE_LENGTH_OPTIONS.join(', ')}.`);
    return;
  }

  saveOptions({ quoteMaxLength });
  replaceChatInput('');
  showToast(`Quote length ${quoteMaxLength}.`);
}

function executeBooleanSetCommand(
  parsed: ParsedCommand,
  saveOptions: SaveOptions,
  option: 'mentionSound' | 'openProfilesInPopup',
  label: string
): void {
  const value = getBooleanCommandTarget(parsed.args);
  if (value === null) {
    showToast('Use on or off.');
    return;
  }

  saveOptions({ [option]: value });
  replaceChatInput('');
  showToast(`${label} ${value ? 'on' : 'off'}.`);
}

function replaceCommandText(text: string, emptyMessage: string): void {
  if (!text) {
    showToast(emptyMessage);
    return;
  }

  if (!replaceChatInput(text)) {
    showToast('Could not find the chat input.');
  }
}

function replaceInlineCommandText(text: string, parsed: InlineParsedCommand, emptyMessage: string): void {
  if (!text) {
    showToast(emptyMessage);
    return;
  }

  if (!replaceChatInputTextRange(parsed.start, parsed.end, text)) {
    showToast('Could not find the chat input.');
  }
}

function replaceLastSentMessage(): void {
  if (!lastSentMessage?.text && !lastSentMessage?.childNodes.length) {
    showToast('No previous message yet.');
    return;
  }

  if (!replaceChatInputSnapshot(lastSentMessage)) {
    showToast('Could not find the chat input.');
  }
}

function showChatCommandHelp(): void {
  closeChatCommandHelp();

  const card = document.createElement('section');
  card.className = 'ytcq-command-help-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Chat commands');

  const header = document.createElement('div');
  header.className = 'ytcq-command-help-header';

  const title = document.createElement('div');
  title.className = 'ytcq-command-help-title';
  title.textContent = 'Chat commands';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'ytcq-command-help-close';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.append(createCloseIcon());
  closeButton.addEventListener('click', closeChatCommandHelp);

  header.append(title, closeButton);

  const hint = document.createElement('p');
  hint.className = 'ytcq-command-help-hint';
  hint.textContent = 'Type a command, then press Tab.';

  const list = document.createElement('dl');
  list.className = 'ytcq-command-help-list';

  getHelpRows().forEach(([command, description]) => {
    const term = document.createElement('dt');
    term.textContent = command;

    const details = document.createElement('dd');
    details.textContent = description;

    list.append(term, details);
  });

  card.append(header, hint, list);
  document.body.append(card);
  activeHelpCard = card;
  positionHelpCard(card);

  const handleOutsideClick = (event: MouseEvent): void => {
    if (activeHelpCard?.contains(event.target as Node)) return;
    closeChatCommandHelp();
  };
  const handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') closeChatCommandHelp();
  };
  const handleResize = (): void => {
    if (activeHelpCard) positionHelpCard(activeHelpCard);
  };

  activeHelpCardCleanup = () => {
    document.removeEventListener('click', handleOutsideClick, true);
    document.removeEventListener('keydown', handleKeydown, true);
    window.removeEventListener('resize', handleResize, true);
  };

  window.setTimeout(() => {
    document.addEventListener('click', handleOutsideClick, true);
    document.addEventListener('keydown', handleKeydown, true);
    window.addEventListener('resize', handleResize, true);
  }, 0);
}

function closeChatCommandHelp(): void {
  activeHelpCardCleanup?.();
  activeHelpCardCleanup = null;
  activeHelpCard?.remove();
  activeHelpCard = null;
}

function getHelpRows(): Array<[string, string]> {
  return [
    ['/help', 'Show this list.'],
    ['/mention, /reply', 'Mention the author of your newest saved mention.'],
    ['/quote', 'Quote your newest saved mention.'],
    ['/again, /repeat', 'Restore your last sent message.'],
    ['/time utc', 'Insert the current time.'],
    ['/timeuntil 7:45pm', 'Insert the time remaining until a local time.'],
    ['/settranslateto english/off', 'Set the translation language.'],
    ['/settranslationdisplay replace/below', 'Set how translations are shown.'],
    ['/setquotelength 120', 'Set the quote length.'],
    ['/setmentionsound on/off', 'Set mention sound.'],
    ['/setopenchannelsinpopup on/off', 'Set channel popup behavior.']
  ];
}

function positionHelpCard(card: HTMLElement): void {
  const input = findChatInput();
  const inputRect = input?.getBoundingClientRect();
  const margin = 8;
  const cardRect = card.getBoundingClientRect();
  const width = cardRect.width;
  const height = cardRect.height;
  const fallbackLeft = window.innerWidth - width - margin;
  const fallbackTop = window.innerHeight - height - margin;
  const preferredLeft = inputRect ? inputRect.left : fallbackLeft;
  const preferredTop = inputRect ? inputRect.top - height - margin : fallbackTop;
  const maxLeft = window.innerWidth - width - margin;
  const maxTop = window.innerHeight - height - margin;

  card.style.left = `${Math.max(margin, Math.min(Math.round(preferredLeft), maxLeft))}px`;
  card.style.top = `${Math.max(margin, Math.min(Math.round(preferredTop), maxTop))}px`;
}

function createCloseIcon(): SVGSVGElement {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('focusable', 'false');
  icon.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4Z');
  icon.append(path);

  return icon;
}

function handleEscapedCommand(event: Event, text: string): void {
  preventCommandEvent(event);
  const nextText = text.slice(1);
  escapedSlashText = nextText;
  replaceChatInput(nextText);
  showToast('Press Enter again to send.');
}

function parseCommand(value: string): ParsedCommand | null {
  const text = cleanText(value);
  if (!text.startsWith('/')) return null;
  if (text.startsWith('//')) {
    return {
      args: '',
      name: '',
      text
    };
  }

  const match = /^\/([^\s/]+)(?:\s+([\s\S]*))?$/.exec(text);
  if (!match) return null;

  return {
    args: cleanText(match[2] || ''),
    name: match[1].toLowerCase(),
    text
  };
}

function parseInlineTextCommand(selection: ChatInputTextSelection): InlineParsedCommand | null {
  if (selection.selectionStart !== selection.selectionEnd) return null;

  return parseInlineTextCommandAt(selection.text, selection.selectionStart) ||
    parseInlineTextCommandAt(selection.text, selection.text.length);
}

function parseInlineTextCommandAt(text: string, end: number): InlineParsedCommand | null {
  const beforeCaret = text.slice(0, end);
  for (let start = beforeCaret.lastIndexOf('/'); start >= 0; start = beforeCaret.lastIndexOf('/', start - 1)) {
    if (start > 0 && !/\s/.test(beforeCaret[start - 1])) continue;
    if (beforeCaret[start + 1] === '/') continue;

    const parsed = parseCommand(beforeCaret.slice(start));
    if (parsed && INLINE_TEXT_COMPLETION_COMMANDS.has(parsed.name)) {
      return {
        ...parsed,
        end,
        start
      };
    }
  }

  return null;
}

async function getMentionCommandText(): Promise<string> {
  const latestMention = await getLatestMentionRecord();
  return latestMention ? formatMentionText(latestMention.authorName) : '';
}

async function getQuoteCommandText(): Promise<string> {
  const latestMention = await getLatestMentionRecord();
  return latestMention ? formatQuoteText(latestMention.authorName, latestMention.text) : '';
}

function getTranslateCommandTarget(value: string): string | null {
  const normalized = normalizeCommandToken(value);
  if (!normalized) return null;
  if (normalized === 'off') return '';
  return languageByCommandName.get(normalized) ?? null;
}

function getTranslationDisplayCommandTarget(value: string): TranslationDisplay | null {
  const normalized = normalizeCommandToken(value);
  if (normalized === 'replace') return 'replace';
  if (normalized === 'below' || normalized === 'showbelow') return 'below';
  return null;
}

function getBooleanCommandTarget(value: string): boolean | null {
  const normalized = normalizeCommandToken(value);
  if (['on', 'true', 'yes', 'enabled'].includes(normalized)) return true;
  if (['off', 'false', 'no', 'disabled'].includes(normalized)) return false;
  return null;
}

function createLanguageCommandMap(): Map<string, string> {
  const map = new Map<string, string>();
  LANGUAGE_OPTIONS.forEach(([value, label]) => {
    map.set(normalizeCommandToken(value), value);
    map.set(normalizeCommandToken(label), value);
  });
  return map;
}

function normalizeCommandToken(value: string): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/[()[\]]/g, '')
    .replace(/[\s_-]+/g, '');
}

function formatTime(value: string): string {
  const timeZone = timeZoneByCommandName.get(normalizeCommandToken(value));
  if (!timeZone) return '';

  const time = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timeZone.timeZone,
    timeZoneName: 'short'
  }).format(new Date());

  return time;
}

function formatTimeUntil(value: string): string {
  const parsed = parseLocalTime(value);
  if (!parsed) return '';

  const target = getNextLocalTime(parsed);
  const diffMs = target.getTime() - Date.now();
  return formatDuration(diffMs, parsed.hasSeconds);
}

function parseLocalTime(value: string): {
  hasSeconds: boolean;
  hour: number;
  meridiem: 'am' | 'pm' | '';
  minute: number;
  second: number;
} | null {
  const match = /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?$/i.exec(cleanText(value));
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const second = Number(match[3] || 0);
  const meridiem = (match[4] || '').toLowerCase() as 'am' | 'pm' | '';

  if (minute > 59 || second > 59) return null;
  if (meridiem && (hour < 1 || hour > 12)) return null;
  if (!meridiem && hour > 23) return null;

  return {
    hasSeconds: match[3] !== undefined,
    hour,
    meridiem,
    minute,
    second
  };
}

function getNextLocalTime(parsed: {
  hour: number;
  meridiem: 'am' | 'pm' | '';
  minute: number;
  second: number;
}): Date {
  const candidates = getCandidateHours(parsed).map((hour) => createCandidateTime(hour, parsed.minute, parsed.second));
  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates[0];
}

function getCandidateHours(parsed: { hour: number; meridiem: 'am' | 'pm' | '' }): number[] {
  if (parsed.meridiem === 'am') return [parsed.hour === 12 ? 0 : parsed.hour];
  if (parsed.meridiem === 'pm') return [parsed.hour === 12 ? 12 : parsed.hour + 12];
  if (parsed.hour === 0) return [0];
  if (parsed.hour < 12) return [parsed.hour, parsed.hour + 12];
  if (parsed.hour === 12) return [0, 12];
  return [parsed.hour];
}

function createCandidateTime(hour: number, minute: number, second: number): Date {
  const now = new Date();
  const candidate = new Date(now);
  candidate.setHours(hour, minute, second, 0);
  if (candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

function formatDuration(diffMs: number, includeSeconds: boolean): string {
  const totalSeconds = Math.max(0, Math.ceil(diffMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];

  if (hours) parts.push(`${hours} hrs`);
  if (minutes) parts.push(`${minutes} min`);
  if (includeSeconds && (seconds || !parts.length)) parts.push(`${seconds} sec`);
  if (!includeSeconds && !parts.length) return 'less than 1 min';
  return parts.join(' ');
}

function isFromChatInput(target: EventTarget | null): boolean {
  const input = findChatInput();
  if (!input || !(target instanceof Node)) return false;
  return input === target || input.contains(target);
}

function isSendButtonClick(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(SEND_BUTTON_SELECTOR));
}

function isKnownCommand(name: string): boolean {
  return TEXT_COMPLETION_COMMANDS.has(name) || SETTING_COMMANDS.has(name);
}

function rememberLastSentMessage(value: string): void {
  const snapshot = getChatInputSnapshot();
  const text = cleanText(snapshot?.text || value);
  if (snapshot && text) {
    lastSentMessage = snapshot;
  }
}

function preventCommandEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}
