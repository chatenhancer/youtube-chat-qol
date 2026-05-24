/**
 * Chat input slash commands.
 *
 * Commands are intentionally conservative: known commands run with Tab and
 * never auto-send. Enter only blocks known commands from leaking into chat.
 * Unknown slash-prefixed text is left to YouTube.
 */
import { LANGUAGE_OPTIONS, getLanguageLabel } from '../shared/languages';
import { getLocalizedLanguageLabel, t } from '../shared/i18n';
import { getTargetLanguageUpdate, QUOTE_LENGTH_OPTIONS, type Options, type TranslationDisplay } from '../shared/options';
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
} from '../youtube/chat-input';
import { formatMentionText, formatQuoteText } from './reply';
import { getLatestInboxRecord } from './inbox';

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

type ChatCommandKind = 'setting' | 'text';
type ChatCommandHandler = (parsed: ParsedCommand, context: ChatCommandContext) => void | Promise<void>;
type InlineChatCommandHandler = (parsed: InlineParsedCommand) => void | Promise<void>;
type MessageKey = Parameters<typeof t>[0];

interface ChatCommandContext {
  saveOptions: SaveOptions;
}

interface ChatCommandDefinition {
  helpDescriptionKey: MessageKey;
  helpLabel: string;
  hiddenAliases?: string[];
  inline?: boolean;
  kind: ChatCommandKind;
  names: string[];
  run: ChatCommandHandler;
  runInline?: InlineChatCommandHandler;
}

interface TimeZoneOption {
  label: string;
  timeZone: string;
}

interface ChatCommandTimeZone extends TimeZoneOption {
  aliases: string[];
}

const SEND_BUTTON_SELECTOR = [
  '#send-button',
  '#send-button button',
  'yt-button-renderer#send-button',
  'yt-icon-button#send-button',
  'button[aria-label="Send"]',
  'button[title="Send"]'
].join(',');

const CHAT_COMMAND_TIME_ZONES: ChatCommandTimeZone[] = [
  {
    aliases: ['utc'],
    label: 'UTC',
    timeZone: 'UTC'
  },
  {
    aliases: ['tokyo', 'jst'],
    label: 'Tokyo',
    timeZone: 'Asia/Tokyo'
  },
  {
    aliases: ['seoul', 'kst'],
    label: 'Seoul',
    timeZone: 'Asia/Seoul'
  },
  {
    aliases: ['london'],
    label: 'London',
    timeZone: 'Europe/London'
  },
  {
    aliases: ['paris'],
    label: 'Paris',
    timeZone: 'Europe/Paris'
  },
  {
    aliases: ['madrid'],
    label: 'Madrid',
    timeZone: 'Europe/Madrid'
  },
  {
    aliases: ['newyork', 'nyc', 'et', 'eastern'],
    label: 'New York',
    timeZone: 'America/New_York'
  },
  {
    aliases: ['losangeles', 'la', 'pt', 'pacific'],
    label: 'Los Angeles',
    timeZone: 'America/Los_Angeles'
  }
];

const CHAT_COMMANDS: ChatCommandDefinition[] = [
  {
    helpDescriptionKey: 'commandHelpMention',
    helpLabel: '/mention, /reply',
    inline: true,
    kind: 'text',
    names: ['mention', 'reply'],
    run: async () => replaceCommandText(await getMentionCommandText(), t('noInboxMessagesYet')),
    runInline: async (parsed) => replaceInlineCommandText(
      await getMentionCommandText(),
      parsed,
      t('noInboxMessagesYet')
    )
  },
  {
    helpDescriptionKey: 'commandHelpQuote',
    helpLabel: '/quote',
    kind: 'text',
    names: ['quote'],
    run: async () => replaceCommandText(await getQuoteCommandText(), t('noInboxMessagesYet'))
  },
  {
    helpDescriptionKey: 'commandHelpRepeat',
    helpLabel: '/again, /repeat',
    kind: 'text',
    names: ['again', 'repeat'],
    run: () => replaceLastSentMessage()
  },
  {
    helpDescriptionKey: 'commandHelpTime',
    helpLabel: '/time utc',
    inline: true,
    kind: 'text',
    names: ['time'],
    run: (parsed) => replaceCommandText(formatTime(parsed.args), t('unknownTimezone')),
    runInline: (parsed) => replaceInlineCommandText(formatTime(parsed.args), parsed, t('unknownTimezone'))
  },
  {
    helpDescriptionKey: 'commandHelpTimeUntil',
    helpLabel: '/timeuntil 7:45pm',
    inline: true,
    kind: 'text',
    names: ['timeuntil'],
    run: (parsed) => replaceCommandText(formatTimeUntil(parsed.args), t('couldNotReadTime')),
    runInline: (parsed) => replaceInlineCommandText(formatTimeUntil(parsed.args), parsed, t('couldNotReadTime'))
  },
  {
    helpDescriptionKey: 'commandHelpOpenHelp',
    helpLabel: '/help',
    kind: 'text',
    names: ['help'],
    run: () => {
      replaceChatInput('');
      showChatCommandHelp();
    }
  },
  {
    helpDescriptionKey: 'commandHelpSetTranslateTo',
    helpLabel: '/settranslateto english/off',
    kind: 'setting',
    names: ['settranslateto'],
    run: (parsed, { saveOptions }) => executeSetTranslateToCommand(parsed, saveOptions)
  },
  {
    helpDescriptionKey: 'commandHelpSetTranslationDisplay',
    helpLabel: '/settranslationdisplay replace/below',
    kind: 'setting',
    names: ['settranslationdisplay'],
    run: (parsed, { saveOptions }) => executeSetTranslationDisplayCommand(parsed, saveOptions)
  },
  {
    helpDescriptionKey: 'commandHelpSetQuoteLength',
    helpLabel: '/setquotelength 120',
    kind: 'setting',
    names: ['setquotelength'],
    run: (parsed, { saveOptions }) => executeSetQuoteLengthCommand(parsed, saveOptions)
  },
  {
    helpDescriptionKey: 'commandHelpSetSound',
    helpLabel: '/setsound on/off',
    kind: 'setting',
    names: ['setsound'],
    run: (parsed, { saveOptions }) => executeBooleanSetCommand(parsed, saveOptions, 'sound', t('inboxSound'))
  },
  {
    helpDescriptionKey: 'commandHelpSetOpenChannelsInPopup',
    helpLabel: '/setopenchannelsinpopup on/off',
    hiddenAliases: ['setopenprofilesinpopup'],
    kind: 'setting',
    names: ['setopenchannelsinpopup'],
    run: (parsed, { saveOptions }) => executeBooleanSetCommand(
      parsed,
      saveOptions,
      'openProfilesInPopup',
      t('openChannelsInPopup')
    )
  }
];

const COMMAND_BY_NAME = createCommandMap(CHAT_COMMANDS);
const INLINE_COMMANDS = new Set(CHAT_COMMANDS.filter((command) => command.inline).flatMap((command) => command.names));
const languageByCommandName = createLanguageCommandMap();
const timeZoneByCommandName = createTimeZoneCommandMap();

let lastSentMessage: ChatInputSnapshot | null = null;
let escapedSlashText = '';
let activeHelpCard: HTMLElement | null = null;
let activeHelpCardCleanup: (() => void) | null = null;

export function initChatCommands(saveOptions: SaveOptions): void {
  document.addEventListener('keydown', (event) => handleChatCommandKeydown(event, saveOptions), true);
  document.addEventListener('click', handleChatCommandSendClick, true);
}

export function resetChatCommandsState(): void {
  lastSentMessage = null;
  escapedSlashText = '';
  closeChatCommandHelp();
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
    showToast(t('pressTabToRunCommand'));
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
    showToast(t('pressTabToRunCommand'));
    return;
  }

  rememberLastSentMessage(parsed.text);
}

async function executeTabCommand(event: KeyboardEvent, parsed: ParsedCommand, saveOptions: SaveOptions): Promise<void> {
  const command = COMMAND_BY_NAME.get(parsed.name);
  if (!command) return;
  preventCommandEvent(event);
  await command.run(parsed, { saveOptions });
}

async function executeInlineTextCommand(event: KeyboardEvent, parsed: InlineParsedCommand): Promise<void> {
  const command = COMMAND_BY_NAME.get(parsed.name);
  if (!command?.runInline) return;
  preventCommandEvent(event);
  await command.runInline(parsed);
}

function executeSetTranslateToCommand(parsed: ParsedCommand, saveOptions: SaveOptions): void {
  const targetLanguage = getTranslateCommandTarget(parsed.args);
  if (targetLanguage === null) {
    showToast(t('unknownTranslationLanguage'));
    return;
  }

  saveOptions(getTargetLanguageUpdate(targetLanguage));
  replaceChatInput('');
  showToast(targetLanguage
    ? t('translateToLanguage', { language: getLocalizedLanguageLabel(targetLanguage) || getLanguageLabel(targetLanguage) })
    : t('translateOff'));
}

function executeSetTranslationDisplayCommand(parsed: ParsedCommand, saveOptions: SaveOptions): void {
  const display = getTranslationDisplayCommandTarget(parsed.args);
  if (!display) {
    showToast(t('useReplaceOrBelow'));
    return;
  }

  saveOptions({ translationDisplay: display });
  replaceChatInput('');
  showToast(display === 'replace' ? t('translationsReplaceMessages') : t('translationsShowBelowMessages'));
}

function executeSetQuoteLengthCommand(parsed: ParsedCommand, saveOptions: SaveOptions): void {
  const quoteMaxLength = Number(cleanText(parsed.args));
  if (!QUOTE_LENGTH_OPTIONS.some((value) => value === quoteMaxLength)) {
    showToast(t('useQuoteLength', { lengths: QUOTE_LENGTH_OPTIONS.join(', ') }));
    return;
  }

  saveOptions({ quoteMaxLength });
  replaceChatInput('');
  showToast(t('quoteLength', { count: quoteMaxLength }));
}

function executeBooleanSetCommand(
  parsed: ParsedCommand,
  saveOptions: SaveOptions,
  option: 'openProfilesInPopup' | 'sound',
  label: string
): void {
  const value = getBooleanCommandTarget(parsed.args);
  if (value === null) {
    showToast(t('useOnOrOff'));
    return;
  }

  saveOptions({ [option]: value });
  replaceChatInput('');
  showToast(t('settingState', { label, state: value ? t('stateOn') : t('stateOff') }));
}

function replaceCommandText(text: string, emptyMessage: string): void {
  if (!text) {
    showToast(emptyMessage);
    return;
  }

  if (!replaceChatInput(text)) {
    showToast(t('couldNotFindChatInput'));
  }
}

function replaceInlineCommandText(text: string, parsed: InlineParsedCommand, emptyMessage: string): void {
  if (!text) {
    showToast(emptyMessage);
    return;
  }

  if (!replaceChatInputTextRange(parsed.start, parsed.end, text)) {
    showToast(t('couldNotFindChatInput'));
  }
}

function replaceLastSentMessage(): void {
  if (!lastSentMessage?.text && !lastSentMessage?.childNodes.length) {
    showToast(t('noPreviousMessageYet'));
    return;
  }

  if (!replaceChatInputSnapshot(lastSentMessage)) {
    showToast(t('couldNotFindChatInput'));
  }
}

function showChatCommandHelp(): void {
  closeChatCommandHelp();

  const card = document.createElement('section');
  card.className = 'ytcq-command-help-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', t('chatCommands'));

  const header = document.createElement('div');
  header.className = 'ytcq-command-help-header';

  const title = document.createElement('div');
  title.className = 'ytcq-command-help-title';
  title.textContent = t('chatCommands');

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'ytcq-command-help-close';
  closeButton.setAttribute('aria-label', t('close'));
  closeButton.append(createCloseIcon());
  closeButton.addEventListener('click', closeChatCommandHelp);

  header.append(title, closeButton);

  const hint = document.createElement('p');
  hint.className = 'ytcq-command-help-hint';
  hint.textContent = t('commandHelpHint');

  const list = document.createElement('dl');
  list.className = 'ytcq-command-help-list';

  CHAT_COMMANDS.forEach((command) => {
    const term = document.createElement('dt');
    term.textContent = command.helpLabel;

    const details = document.createElement('dd');
    details.textContent = t(command.helpDescriptionKey);

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
  showToast(t('pressEnterAgainToSend'));
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
    if (parsed && INLINE_COMMANDS.has(parsed.name)) {
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
  const latestInboxMessage = await getLatestInboxRecord();
  return latestInboxMessage ? formatMentionText(latestInboxMessage.authorName) : '';
}

async function getQuoteCommandText(): Promise<string> {
  const latestInboxMessage = await getLatestInboxRecord();
  return latestInboxMessage ? formatQuoteText(latestInboxMessage.authorName, latestInboxMessage.text) : '';
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

function createTimeZoneCommandMap(): Map<string, TimeZoneOption> {
  const map = new Map<string, TimeZoneOption>();
  CHAT_COMMAND_TIME_ZONES.forEach(({ aliases, label, timeZone }) => {
    aliases.forEach((alias) => {
      map.set(normalizeCommandToken(alias), { label, timeZone });
    });
  });
  return map;
}

function createCommandMap(commands: ChatCommandDefinition[]): Map<string, ChatCommandDefinition> {
  const map = new Map<string, ChatCommandDefinition>();
  commands.forEach((command) => {
    [...command.names, ...(command.hiddenAliases || [])].forEach((name) => {
      map.set(name, command);
    });
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

  if (hours) parts.push(t('timeHours', { count: hours }));
  if (minutes) parts.push(t('timeMinutes', { count: minutes }));
  if (includeSeconds && (seconds || !parts.length)) parts.push(t('timeSeconds', { count: seconds }));
  if (!includeSeconds && !parts.length) return t('lessThanOneMinute');
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
  return COMMAND_BY_NAME.has(name);
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
