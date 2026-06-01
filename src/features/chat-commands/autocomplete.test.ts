import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommandAutocomplete } from './autocomplete';
import type { ChatCommandDefinition } from './types';
import {
  getChatInputTextSelection,
  replaceChatInputTextRange,
  type ChatInputTextSelection
} from '../../youtube/chat-input';

vi.mock('../../youtube/chat-input', () => ({
  findChatInput: vi.fn(() => document.querySelector('[data-chat-input]')),
  getChatInputTextSelection: vi.fn(),
  replaceChatInputTextRange: vi.fn(() => true)
}));

describe('chat command autocomplete', () => {
  let input: HTMLElement;
  let selection: ChatInputTextSelection | null;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    document.body.replaceChildren();
    input = document.createElement('div');
    input.dataset.chatInput = 'true';
    document.body.append(input);
    selection = null;
    vi.mocked(getChatInputTextSelection).mockImplementation(() => selection);
    vi.mocked(replaceChatInputTextRange).mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('accepts the best matching command alias with Tab', () => {
    selection = select('/t');
    const autocomplete = createAutocomplete();
    const event = keyEvent('Tab');

    expect(autocomplete.handleKeydown(event)).toBe(true);

    expect(replaceChatInputTextRange).toHaveBeenCalledWith(0, 2, '/time ');
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('renders command suggestions and accepts clicked options', async () => {
    selection = select('/tr');
    const autocomplete = createAutocomplete();

    autocomplete.scheduleUpdate();
    await vi.runAllTimersAsync();

    const card = document.querySelector('.ytcq-command-autocomplete-card');
    expect(card).not.toBeNull();
    expect([...document.querySelectorAll('.ytcq-command-autocomplete-name')]
      .map((node) => node.textContent)).toEqual(['/translate']);

    const option = document.querySelector<HTMLElement>('[data-ytcq-command-autocomplete-index="0"]');
    const pointerEvent = new MouseEvent('mousedown', { bubbles: true });
    option?.dispatchEvent(pointerEvent);
    autocomplete.handlePointerDown(pointerEvent);

    expect(replaceChatInputTextRange).toHaveBeenCalledWith(0, 3, '/translate ');
    expect(document.querySelector('.ytcq-command-autocomplete-card')).toBeNull();
  });

  it('cycles through suggestions with arrow keys before accepting', async () => {
    selection = select('/');
    const autocomplete = createAutocomplete();

    autocomplete.scheduleUpdate();
    await vi.runAllTimersAsync();
    autocomplete.handleKeydown(keyEvent('ArrowDown'));
    autocomplete.handleKeydown(keyEvent('ArrowDown'));
    autocomplete.handleKeydown(keyEvent('Tab'));

    expect(replaceChatInputTextRange).toHaveBeenCalledWith(0, 1, '/translate ');
  });

  it('suggests command arguments and replaces only the current argument fragment', () => {
    selection = select('/lang j');
    const autocomplete = createAutocomplete();

    autocomplete.handleKeydown(keyEvent('Tab'));

    expect(replaceChatInputTextRange).toHaveBeenCalledWith(6, 7, 'ja ');
  });

  it('hides exact argument suggestions unless a command opts out', async () => {
    selection = select('/lang ja');
    const autocomplete = createAutocomplete();

    autocomplete.scheduleUpdate();
    await vi.runAllTimersAsync();

    expect(document.querySelector('.ytcq-command-autocomplete-card')).toBeNull();
  });

  it('ignores inline context for whole-input-only commands', () => {
    selection = select('hello /quote');
    const autocomplete = createAutocomplete();

    expect(autocomplete.handleKeydown(keyEvent('Tab'))).toBe(false);
    expect(replaceChatInputTextRange).not.toHaveBeenCalled();
  });

  it('closes the rendered card with Escape', async () => {
    selection = select('/');
    const autocomplete = createAutocomplete();

    autocomplete.scheduleUpdate();
    await vi.runAllTimersAsync();
    expect(document.querySelector('.ytcq-command-autocomplete-card')).not.toBeNull();

    expect(autocomplete.handleKeydown(keyEvent('Escape'))).toBe(true);

    expect(document.querySelector('.ytcq-command-autocomplete-card')).toBeNull();
  });
});

function createAutocomplete(): ReturnType<typeof createCommandAutocomplete> {
  const commands = createCommands();
  return createCommandAutocomplete({
    commandByName: new Map(commands.flatMap((command) => command.names.map((name) => [name, command]))),
    commands,
    getCommandDescription: (command) => command.helpDescription || '',
    isChatInputActive: () => true,
    isFromChatInput: (target) => target instanceof Node && (
      target === document.querySelector('[data-chat-input]') ||
      Boolean(document.querySelector('[data-chat-input]')?.contains(target))
    ),
    preventCommandEvent: (event) => {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

function createCommands(): ChatCommandDefinition[] {
  return [
    {
      acceptsArguments: true,
      argumentOptions: () => [
        { aliases: ['japanese'], description: 'Japanese', label: 'ja - Japanese', value: 'ja' },
        { aliases: ['spanish'], description: 'Spanish', label: 'es - Spanish', value: 'es' }
      ],
      helpDescription: 'Set the language.',
      helpLabel: '/lang',
      kind: 'setting',
      names: ['lang'],
      run: vi.fn()
    },
    {
      acceptsArguments: true,
      helpDescription: 'Insert the current time.',
      helpLabel: '/time',
      inline: true,
      kind: 'text',
      names: ['time', 't'],
      run: vi.fn()
    },
    {
      acceptsArguments: true,
      helpDescription: 'Translate draft text.',
      helpLabel: '/translate',
      inline: true,
      kind: 'text',
      names: ['translate', 'tr'],
      run: vi.fn()
    },
    {
      helpDescription: 'Quote latest message.',
      helpLabel: '/quote',
      kind: 'text',
      names: ['quote', 'q'],
      run: vi.fn()
    }
  ];
}

function select(text: string): ChatInputTextSelection {
  return {
    selectionEnd: text.length,
    selectionStart: text.length,
    text
  };
}

function keyEvent(key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, key });
  vi.spyOn(event, 'preventDefault');
  vi.spyOn(event, 'stopPropagation');
  return event;
}
