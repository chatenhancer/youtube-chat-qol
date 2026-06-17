/**
 * Chat input slash commands.
 *
 * Commands are intentionally conservative: known commands run with Tab and
 * never auto-send. Enter only blocks known commands from leaking into chat.
 * Unknown slash-prefixed text is left to YouTube.
 */
import { t } from '../../shared/i18n';
import { cleanText } from '../../shared/text';
import { showToast } from '../../shared/toast';
import {
  findChatInput,
  getChatInputSnapshot,
  getChatInputText,
  getChatInputTextSelection,
  replaceChatInput,
  replaceChatInputTextRange,
  replaceChatInputSnapshot,
  type ChatInputSnapshot
} from '../../youtube/chat-input';
import { SEND_BUTTON_SELECTOR } from '../../youtube/selectors';
import { createCommandAutocomplete } from './autocomplete';
import { createCommandCards } from './cards';
import { createChatCommands } from './commands';
import { registerFeatureLifecycle } from '../../content/lifecycle';
import { parseCommand, parseInlineTextCommand } from './parser';
import type {
  ChatCommandDefinition,
  ChatCommandRuntime,
  InlineParsedCommand,
  ParsedCommand,
  SaveOptions
} from './types';

let lastSentMessage: ChatInputSnapshot | null = null;
let escapedSlashText = '';
let saveOptionsCallback: SaveOptions = () => {};
let commandListeners = new AbortController();
const commandCards = createCommandCards();

const commandRuntime: ChatCommandRuntime = {
  clearInput: () => replaceChatInput(''),
  replaceCommandText,
  replaceInlineCommandText,
  replaceLastSentMessage,
  showCommandHelp: showChatCommandHelp,
  showWatchedKeywordsCard
};

const CHAT_COMMANDS = createChatCommands(commandRuntime);
const COMMAND_BY_NAME = createCommandMap(CHAT_COMMANDS);
const INLINE_COMMANDS = new Set(CHAT_COMMANDS.filter((command) => command.inline).flatMap((command) => command.names));
const commandAutocomplete = createCommandAutocomplete({
  commandByName: COMMAND_BY_NAME,
  commands: CHAT_COMMANDS,
  getCommandDescription,
  isChatInputActive,
  isFromChatInput,
  preventCommandEvent
});

registerFeatureLifecycle({
  page: {
    init: ({ saveOptions }) => initChatCommands(saveOptions),
    cleanupStale: cleanupStaleChatCommandSurfaces,
    reset: resetChatCommandsState
  }
});

export function initChatCommands(saveOptions: SaveOptions): void {
  saveOptionsCallback = saveOptions;
  const options = { capture: true, signal: commandListeners.signal };
  document.addEventListener('keydown', handleChatCommandKeydownEvent, options);
  document.addEventListener('input', handleChatCommandInput, options);
  document.addEventListener('selectionchange', commandAutocomplete.scheduleUpdate, options);
  document.addEventListener('mousedown', commandAutocomplete.handlePointerDown, options);
  document.addEventListener('click', handleChatCommandSendClick, options);
  window.addEventListener('resize', commandAutocomplete.scheduleUpdate, options);
}

export function resetChatCommandsState(): void {
  lastSentMessage = null;
  escapedSlashText = '';
  closeChatCommandHelp();
  commandAutocomplete.close();
}

export function cleanupStaleChatCommandSurfaces(): void {
  commandListeners.abort();
  commandListeners = new AbortController();
  closeChatCommandHelp();
  commandAutocomplete.close();
  document.querySelectorAll('.ytcq-command-autocomplete-card, .ytcq-command-help-card')
    .forEach((surface) => surface.remove());
}

function handleChatCommandKeydownEvent(event: KeyboardEvent): void {
  handleChatCommandKeydown(event, saveOptionsCallback);
}

function handleChatCommandKeydown(event: KeyboardEvent, saveOptions: SaveOptions): void {
  if (event.defaultPrevented || event.isComposing) return;
  if (!isFromChatInput(event.target)) return;

  if (commandAutocomplete.handleKeydown(event)) return;

  if (event.key !== 'Tab' && event.key !== 'Enter') return;

  const inputSelection = getChatInputTextSelection();
  const inputText = inputSelection?.text || getChatInputText();
  const parsed = parseCommand(inputText);
  if (!parsed) {
    if (event.key === 'Tab' && inputSelection) {
      const inlineParsed = parseInlineTextCommand(inputSelection, INLINE_COMMANDS);
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
  commandAutocomplete.close();
  await command.run(parsed, { saveOptions });
}

async function executeInlineTextCommand(event: KeyboardEvent, parsed: InlineParsedCommand): Promise<void> {
  const command = COMMAND_BY_NAME.get(parsed.name);
  if (!command?.runInline) return;
  preventCommandEvent(event);
  commandAutocomplete.close();
  await command.runInline(parsed);
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
  commandAutocomplete.close();
  commandCards.showHelp(CHAT_COMMANDS, getCommandDescription);
}

function closeChatCommandHelp(): void {
  commandCards.close();
}

function getCommandDescription(command: ChatCommandDefinition): string {
  return command.helpDescription || (command.helpDescriptionKey ? t(command.helpDescriptionKey) : '');
}

function handleChatCommandInput(event: Event): void {
  if (!isFromChatInput(event.target)) return;
  commandAutocomplete.scheduleUpdate();
}

function handleEscapedCommand(event: Event, text: string): void {
  preventCommandEvent(event);
  const nextText = text.slice(1);
  escapedSlashText = nextText;
  replaceChatInput(nextText);
  showToast(t('pressEnterAgainToSend'));
}

function showWatchedKeywordsCard(keywords: string[]): void {
  commandAutocomplete.close();
  commandCards.showWatchedKeywords(keywords);
}

function createCommandMap(commands: ChatCommandDefinition[]): Map<string, ChatCommandDefinition> {
  const map = new Map<string, ChatCommandDefinition>();
  commands.forEach((command) => {
    command.names.forEach((name) => {
      map.set(name, command);
    });
  });
  return map;
}

function isFromChatInput(target: EventTarget | null): boolean {
  const input = findChatInput();
  if (!input || !(target instanceof Node)) return false;
  return input === target || input.contains(target);
}

function isChatInputActive(): boolean {
  return isFromChatInput(document.activeElement);
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
