/**
 * Chat input slash commands.
 *
 * Commands are intentionally conservative: text-producing commands complete
 * with Tab and never auto-send, while /set commands run on Enter. Unknown
 * slash-prefixed text is left to YouTube.
 */
import { LANGUAGE_OPTIONS, getLanguageLabel } from '../shared/languages';
import { QUOTE_LENGTH_OPTIONS, type Options, type TranslationDisplay } from '../shared/options';
import { cleanText } from '../shared/text';
import { showToast } from '../shared/toast';
import {
  findChatInput,
  getChatInputSnapshot,
  getChatInputText,
  replaceChatInput,
  replaceChatInputSnapshot,
  type ChatInputSnapshot
} from '../youtube/chatInput';
import { formatMentionText, formatQuoteText } from './reply';
import { getLatestMentionRecord } from './mentionsInbox';

type SaveOptions = (values: Partial<Options>) => void;

interface ParsedCommand {
  args: string;
  name: string;
  text: string;
}

const SEND_BUTTON_SELECTOR = [
  '#send-button',
  '#send-button button',
  'yt-button-renderer#send-button',
  'yt-icon-button#send-button',
  'button[aria-label="Send"]',
  'button[title="Send"]'
].join(',');

const TEXT_COMPLETION_COMMANDS = new Set(['mention', 'reply', 'quote', 'again', 'repeat', 'time', 'timeuntil']);
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

export function initChatCommands(saveOptions: SaveOptions): void {
  document.addEventListener('keydown', (event) => handleChatCommandKeydown(event, saveOptions), true);
  document.addEventListener('click', (event) => handleChatCommandSendClick(event, saveOptions), true);
}

function handleChatCommandKeydown(event: KeyboardEvent, saveOptions: SaveOptions): void {
  if (event.defaultPrevented || event.isComposing) return;
  if (event.key !== 'Tab' && event.key !== 'Enter') return;
  if (!isFromChatInput(event.target)) return;

  const inputText = getChatInputText();
  const parsed = parseCommand(inputText);
  if (!parsed) {
    if (event.key === 'Enter' && !event.shiftKey) rememberLastSentMessage(inputText);
    return;
  }

  if (parsed.text.startsWith('//')) {
    handleEscapedCommand(event, parsed.text);
    return;
  }

  if (event.key === 'Tab') {
    void completeTextCommand(event, parsed);
    return;
  }

  if (event.shiftKey) return;
  if (escapedSlashText && parsed.text === escapedSlashText) {
    escapedSlashText = '';
    rememberLastSentMessage(parsed.text);
    return;
  }

  if (TEXT_COMPLETION_COMMANDS.has(parsed.name)) {
    preventCommandEvent(event);
    showToast('Press Tab to complete this command.');
    return;
  }

  if (parsed.name.startsWith('set')) {
    executeSetCommand(event, parsed, saveOptions);
    return;
  }

  rememberLastSentMessage(parsed.text);
}

function handleChatCommandSendClick(event: MouseEvent, saveOptions: SaveOptions): void {
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

  if (TEXT_COMPLETION_COMMANDS.has(parsed.name)) {
    preventCommandEvent(event);
    showToast('Press Tab to complete this command.');
    return;
  }

  if (parsed.name.startsWith('set')) {
    executeSetCommand(event, parsed, saveOptions);
    return;
  }

  rememberLastSentMessage(parsed.text);
}

async function completeTextCommand(event: KeyboardEvent, parsed: ParsedCommand): Promise<void> {
  if (!TEXT_COMPLETION_COMMANDS.has(parsed.name)) return;
  preventCommandEvent(event);

  if (parsed.name === 'mention' || parsed.name === 'reply') {
    const latestMention = await getLatestMentionRecord();
    const text = latestMention ? formatMentionText(latestMention.authorName) : '';
    replaceCommandText(text, 'No mentions yet.');
    return;
  }

  if (parsed.name === 'quote') {
    const latestMention = await getLatestMentionRecord();
    const text = latestMention ? formatQuoteText(latestMention.authorName, latestMention.text) : '';
    replaceCommandText(text, 'No mentions yet.');
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

function executeSetCommand(event: Event, parsed: ParsedCommand, saveOptions: SaveOptions): void {
  preventCommandEvent(event);
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

function replaceLastSentMessage(): void {
  if (!lastSentMessage?.text && !lastSentMessage?.childNodes.length) {
    showToast('No previous message yet.');
    return;
  }

  if (!replaceChatInputSnapshot(lastSentMessage)) {
    showToast('Could not find the chat input.');
  }
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

  return `${timeZone.label} time: ${time}`;
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
