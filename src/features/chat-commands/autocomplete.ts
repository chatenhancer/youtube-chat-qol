/**
 * Chat command autocomplete.
 *
 * Finds the command or argument fragment at the caret, renders suggestions
 * above the input, and owns keyboard/pointer selection behavior.
 */
import { t } from '../../shared/i18n';
import { cleanText } from '../../shared/text';
import { showToast } from '../../shared/toast';
import {
  getChatInputTextSelection,
  replaceChatInputTextRange,
  type ChatInputTextSelection
} from '../../youtube/chat-input';
import { positionFloatingCardAboveInput } from './floating-card';
import { normalizeCommandToken } from './parser';
import type {
  ChatCommandDefinition,
  CommandAutocompleteContext,
  CommandAutocompleteOption,
  CommandAutocompleteState,
  CommandAutocompleteSuggestion
} from './types';

const ARGUMENT_AUTOCOMPLETE_LIMIT = 8;

interface ChatCommandAutocompleteOptions {
  commandByName: Map<string, ChatCommandDefinition>;
  commands: ChatCommandDefinition[];
  getCommandDescription: (command: ChatCommandDefinition) => string;
  isChatInputActive: () => boolean;
  isFromChatInput: (target: EventTarget | null) => boolean;
  preventCommandEvent: (event: Event) => void;
}

interface ChatCommandAutocomplete {
  close(): void;
  handleKeydown(event: KeyboardEvent): boolean;
  handlePointerDown(event: MouseEvent): void;
  scheduleUpdate(): void;
}

export function createCommandAutocomplete(options: ChatCommandAutocompleteOptions): ChatCommandAutocomplete {
  let activeCard: HTMLElement | null = null;
  let activeIndex = 0;
  let activeKey = '';
  let updateFrame = 0;

  const close = (): void => {
    if (updateFrame) {
      window.cancelAnimationFrame(updateFrame);
      updateFrame = 0;
    }

    activeCard?.remove();
    activeCard = null;
    activeIndex = 0;
    activeKey = '';
  };

  const getState = (): CommandAutocompleteState | null => {
    if (!options.isChatInputActive()) return null;

    const selection = getChatInputTextSelection();
    if (!selection) return null;

    const context = getContext(selection, options.commandByName);
    if (!context) return null;

    const suggestions = getSuggestions(context, options.commands, options.getCommandDescription);
    if (!suggestions.length) return null;
    if (shouldHideExactAutocomplete(suggestions, context)) return null;

    return {
      context,
      suggestions
    };
  };

  const render = (state: CommandAutocompleteState): void => {
    activeCard ||= createCommandAutocompleteCard();
    activeCard.replaceChildren();

    const list = document.createElement('div');
    list.className = 'ytcq-command-autocomplete-list';
    list.setAttribute('role', 'listbox');

    state.suggestions.forEach((suggestion, index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'ytcq-command-autocomplete-option';
      option.dataset.ytcqCommandAutocompleteIndex = String(index);
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(index === activeIndex));

      if (index === activeIndex) {
        option.classList.add('ytcq-command-autocomplete-option-active');
      }

      const name = document.createElement('span');
      name.className = 'ytcq-command-autocomplete-name';
      name.textContent = suggestion.label;

      const description = document.createElement('span');
      description.className = 'ytcq-command-autocomplete-description';
      description.textContent = suggestion.description;

      option.append(name, description);
      list.append(option);
    });

    activeCard.append(list);
    if (!activeCard.isConnected) document.body.append(activeCard);
    positionFloatingCardAboveInput(activeCard);
  };

  const accept = (state: CommandAutocompleteState): void => {
    const suggestion = state.suggestions[Math.min(activeIndex, state.suggestions.length - 1)];
    if (!suggestion) return;

    const nextText = getReplacementText(suggestion, state.context);
    const replaced = replaceChatInputTextRange(state.context.start, state.context.end, nextText);
    if (!replaced) showToast(t('couldNotFindChatInput'));
    close();
  };

  const update = (): void => {
    const state = getState();
    if (!state) {
      close();
      return;
    }

    const key = getStateKey(state);
    activeIndex = key === activeKey
      ? Math.min(activeIndex, state.suggestions.length - 1)
      : 0;
    activeKey = key;
    render(state);
  };

  const scheduleUpdate = (): void => {
    if (updateFrame) return;

    updateFrame = window.requestAnimationFrame(() => {
      updateFrame = 0;
      update();
    });
  };

  const handleKeydown = (event: KeyboardEvent): boolean => {
    if (!activeCard && !['Tab', 'Enter', 'ArrowDown', 'ArrowUp', 'Escape'].includes(event.key)) {
      return false;
    }

    if (event.key === 'Escape') {
      if (!activeCard) return false;
      options.preventCommandEvent(event);
      close();
      return true;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const state = getState();
      if (!state) return false;

      options.preventCommandEvent(event);
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      activeIndex = wrapIndex(activeIndex + direction, state.suggestions.length);
      render(state);
      return true;
    }

    if (event.key !== 'Tab' && (event.key !== 'Enter' || event.shiftKey)) return false;

    const state = getState();
    if (!state) {
      close();
      return false;
    }

    options.preventCommandEvent(event);
    accept(state);
    return true;
  };

  const handlePointerDown = (event: MouseEvent): void => {
    if (!activeCard) return;

    const target = event.target;
    const option = target instanceof Element
      ? target.closest<HTMLElement>('[data-ytcq-command-autocomplete-index]')
      : null;

    if (option && activeCard.contains(option)) {
      const index = Number(option.dataset.ytcqCommandAutocompleteIndex);
      if (Number.isInteger(index)) activeIndex = index;

      options.preventCommandEvent(event);
      const state = getState();
      if (state) accept(state);
      else close();
      return;
    }

    if (target instanceof Node && (activeCard.contains(target) || options.isFromChatInput(target))) return;
    close();
  };

  return {
    close,
    handleKeydown,
    handlePointerDown,
    scheduleUpdate
  };
}

function getContext(
  selection: ChatInputTextSelection,
  commandByName: Map<string, ChatCommandDefinition>
): CommandAutocompleteContext | null {
  if (selection.selectionStart !== selection.selectionEnd) return null;

  const end = selection.selectionStart;
  const beforeCaret = selection.text.slice(0, end);
  const start = beforeCaret.lastIndexOf('/');
  if (start < 0) return null;
  if (start > 0 && !/\s/.test(beforeCaret[start - 1])) return null;
  if (beforeCaret[start + 1] === '/') return null;

  const commandText = beforeCaret.slice(start);
  const inline = selection.text.slice(0, start).trim().length > 0;
  const commandMatch = /^\/([^\s/]*)([\s\S]*)$/.exec(commandText);
  if (!commandMatch) return null;

  const fragment = commandMatch[1];
  const argsText = commandMatch[2];
  if (!argsText) {
    return {
      end,
      fragment,
      inline,
      kind: 'command',
      start
    };
  }

  const command = commandByName.get(fragment.toLowerCase());
  if (!command || (inline && !command.inline)) return null;
  if (!argsText.startsWith(' ')) return null;

  const argumentStart = getCurrentArgumentStart(selection.text, start + 1 + fragment.length, end);
  if (argumentStart === null) return null;

  return {
    command,
    end,
    fragment: selection.text.slice(argumentStart, end),
    inline,
    kind: 'argument',
    start: argumentStart
  };
}

function getCurrentArgumentStart(text: string, argsStart: number, end: number): number | null {
  const argsBeforeCaret = text.slice(argsStart, end);
  const currentArgumentStart = argsBeforeCaret.search(/\S[^\s]*$/);
  const start = currentArgumentStart >= 0 ? argsStart + currentArgumentStart : end;
  if (cleanText(text.slice(argsStart, start))) return null;
  return start;
}

function getSuggestions(
  context: CommandAutocompleteContext,
  commands: ChatCommandDefinition[],
  getCommandDescription: (command: ChatCommandDefinition) => string
): CommandAutocompleteSuggestion[] {
  if (context.kind === 'argument') return getArgumentSuggestions(context);

  const fragment = context.fragment.toLowerCase();
  const visibleCommands = context.inline ? commands.filter((command) => command.inline) : commands;
  const suggestions: CommandAutocompleteSuggestion[] = [];

  visibleCommands.forEach((command) => {
    if (!command.names.some((name) => name.startsWith(fragment))) return;
    suggestions.push({
      aliases: command.names,
      command,
      description: getAutocompleteDescription(command, getCommandDescription),
      label: `/${command.names[0]}`,
      value: command.names[0]
    });
  });

  return sortSuggestions(suggestions, fragment);
}

function getAutocompleteDescription(
  command: ChatCommandDefinition,
  getCommandDescription: (command: ChatCommandDefinition) => string
): string {
  const aliases = command.names.slice(1).map((name) => `/${name}`);
  const description = getCommandDescription(command);
  return aliases.length ? `${aliases.join(', ')} · ${description}` : description;
}

function sortSuggestions(
  suggestions: CommandAutocompleteSuggestion[],
  fragment: string
): CommandAutocompleteSuggestion[] {
  if (!fragment) return suggestions;

  return [...suggestions].sort((first, second) => {
    const firstExact = isExactCommandSuggestion(first, fragment);
    const secondExact = isExactCommandSuggestion(second, fragment);
    if (firstExact !== secondExact) return firstExact ? -1 : 1;
    return 0;
  });
}

function getArgumentSuggestions(context: CommandAutocompleteContext): CommandAutocompleteSuggestion[] {
  const command = context.command;
  if (!command) return [];

  const fragment = normalizeCommandToken(context.fragment);
  return getArgumentOptions(command)
    .filter((option) => matchesArgumentOption(option, fragment))
    .slice(0, ARGUMENT_AUTOCOMPLETE_LIMIT)
    .map((option) => ({
      ...option,
      command
    }));
}

function getArgumentOptions(command: ChatCommandDefinition): CommandAutocompleteOption[] {
  return command.argumentOptions?.() || [];
}

function matchesArgumentOption(
  option: CommandAutocompleteOption,
  normalizedFragment: string
): boolean {
  if (!normalizedFragment) return true;

  return [option.value, option.label, ...(option.aliases || [])].some((value) => {
    return normalizeCommandToken(value).startsWith(normalizedFragment);
  });
}

function isExactSuggestion(
  suggestion: CommandAutocompleteSuggestion,
  context: CommandAutocompleteContext
): boolean {
  if (!context.fragment) return false;
  if (context.kind === 'command') {
    return isExactCommandSuggestion(suggestion, context.fragment.toLowerCase());
  }

  const normalizedFragment = normalizeCommandToken(context.fragment);
  return [suggestion.value, suggestion.label, ...(suggestion.aliases || [])].some((value) => {
    return normalizeCommandToken(value) === normalizedFragment;
  });
}

function shouldHideExactAutocomplete(
  suggestions: CommandAutocompleteSuggestion[],
  context: CommandAutocompleteContext
): boolean {
  const exactSuggestions = suggestions.filter((suggestion) => isExactSuggestion(suggestion, context));
  if (!exactSuggestions.length) return false;

  if (context.kind === 'command') {
    if (exactSuggestions.some((suggestion) => runsWithoutArgument(suggestion, context))) {
      return true;
    }

    return exactSuggestions.length === suggestions.length &&
      exactSuggestions.every((suggestion) => !needsArgumentSpace(suggestion.command));
  }

  return context.command?.hideExactArgumentAutocomplete !== false;
}

function isExactCommandSuggestion(suggestion: CommandAutocompleteSuggestion, fragment: string): boolean {
  return [suggestion.value, ...(suggestion.aliases || [])].some((value) => value === fragment);
}

function runsWithoutArgument(
  suggestion: CommandAutocompleteSuggestion,
  context: CommandAutocompleteContext
): boolean {
  return Boolean(suggestion.command.runWithoutArgumentNames?.includes(context.fragment.toLowerCase()));
}

function getStateKey(state: CommandAutocompleteState): string {
  return [
    state.context.kind,
    state.context.inline ? 'inline' : 'whole',
    state.context.start,
    state.context.fragment
  ].join(':');
}

function getReplacementText(suggestion: CommandAutocompleteSuggestion, context: CommandAutocompleteContext): string {
  if (context.kind === 'argument') return `${suggestion.value} `;
  return `/${suggestion.value}${needsArgumentSpace(suggestion.command) ? ' ' : ''}`;
}

function createCommandAutocompleteCard(): HTMLElement {
  const card = document.createElement('section');
  card.className = 'ytcq-command-autocomplete-card';
  card.setAttribute('aria-label', t('chatCommands'));
  return card;
}

function needsArgumentSpace(command: ChatCommandDefinition): boolean {
  return command.kind === 'setting' || Boolean(command.acceptsArguments);
}

function wrapIndex(index: number, length: number): number {
  if (!length) return 0;
  return (index + length) % length;
}
