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

  it('does nothing when the chat input is inactive or selection is unavailable', () => {
    selection = select('/t');
    expect(createAutocomplete({ isChatInputActive: () => false }).handleKeydown(keyEvent('Tab'))).toBe(false);

    selection = null;
    expect(createAutocomplete().handleKeydown(keyEvent('Tab'))).toBe(false);
  });

  it('ignores non-collapsed selections and malformed argument contexts', () => {
    const autocomplete = createAutocomplete();

    selection = {
      selectionEnd: 2,
      selectionStart: 1,
      text: '/t'
    };
    expect(autocomplete.handleKeydown(keyEvent('Tab'))).toBe(false);

    selection = select('/time\t');
    expect(autocomplete.handleKeydown(keyEvent('Tab'))).toBe(false);

    selection = select('/missing arg');
    expect(autocomplete.handleKeydown(keyEvent('Tab'))).toBe(false);
  });

  it('ignores non-command slash contexts', () => {
    const autocomplete = createAutocomplete();

    selection = select('https://example.test/path');
    expect(autocomplete.handleKeydown(keyEvent('Tab'))).toBe(false);

    selection = select('//literal');
    expect(autocomplete.handleKeydown(keyEvent('Tab'))).toBe(false);

    selection = {
      selectionEnd: 2,
      selectionStart: 0,
      text: '/t'
    };
    expect(autocomplete.handleKeydown(keyEvent('Tab'))).toBe(false);
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

  it('closes when a clicked option no longer has a valid autocomplete state', async () => {
    selection = select('/tr');
    const autocomplete = createAutocomplete();

    autocomplete.scheduleUpdate();
    await vi.runAllTimersAsync();
    const option = document.querySelector<HTMLElement>('[data-ytcq-command-autocomplete-index="0"]');
    const pointerEvent = new MouseEvent('mousedown', { bubbles: true });
    Object.defineProperty(pointerEvent, 'target', {
      configurable: true,
      value: option
    });
    selection = null;

    autocomplete.handlePointerDown(pointerEvent);

    expect(replaceChatInputTextRange).not.toHaveBeenCalled();
    expect(document.querySelector('.ytcq-command-autocomplete-card')).toBeNull();
  });

  it('cancels a scheduled update when autocomplete closes before the next frame', async () => {
    selection = select('/');
    const autocomplete = createAutocomplete();
    const cancelAnimationFrameSpy = vi.spyOn(window, 'cancelAnimationFrame');

    autocomplete.scheduleUpdate();
    autocomplete.close();
    await vi.runAllTimersAsync();

    expect(cancelAnimationFrameSpy).toHaveBeenCalled();
    expect(document.querySelector('.ytcq-command-autocomplete-card')).toBeNull();
  });

  it('accepts an open suggestion with Enter but not Shift Enter', async () => {
    selection = select('/');
    const autocomplete = createAutocomplete();

    autocomplete.scheduleUpdate();
    await vi.runAllTimersAsync();
    expect(autocomplete.handleKeydown(keyEvent('Enter', { shiftKey: true }))).toBe(false);
    expect(autocomplete.handleKeydown(keyEvent('Enter'))).toBe(true);

    expect(replaceChatInputTextRange).toHaveBeenCalledWith(0, 1, '/lang ');
  });

  it('shows feedback when accepting a suggestion cannot update the composer', () => {
    selection = select('/t');
    vi.mocked(replaceChatInputTextRange).mockReturnValue(false);
    const autocomplete = createAutocomplete();

    expect(autocomplete.handleKeydown(keyEvent('Tab'))).toBe(true);

    expect(document.querySelector('.ytcq-toast')?.textContent).toBe('Could not find the chat input.');
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

  it('wraps upward through suggestions with arrow keys', async () => {
    selection = select('/');
    const autocomplete = createAutocomplete();

    autocomplete.scheduleUpdate();
    await vi.runAllTimersAsync();
    autocomplete.handleKeydown(keyEvent('ArrowUp'));
    autocomplete.handleKeydown(keyEvent('Tab'));

    expect(replaceChatInputTextRange).toHaveBeenCalledWith(0, 1, '/watch ');
  });

  it('suggests command arguments and replaces only the current argument fragment', () => {
    selection = select('/lang j');
    const autocomplete = createAutocomplete();

    autocomplete.handleKeydown(keyEvent('Tab'));

    expect(replaceChatInputTextRange).toHaveBeenCalledWith(6, 7, 'ja ');
  });

  it('does not suggest a second argument for single-argument commands', () => {
    selection = select('/lang es j');
    const autocomplete = createAutocomplete();

    expect(autocomplete.handleKeydown(keyEvent('Tab'))).toBe(false);

    expect(replaceChatInputTextRange).not.toHaveBeenCalled();
  });

  it('hides exact argument suggestions unless a command opts out', async () => {
    selection = select('/lang ja');
    const autocomplete = createAutocomplete();

    autocomplete.scheduleUpdate();
    await vi.runAllTimersAsync();

    expect(document.querySelector('.ytcq-command-autocomplete-card')).toBeNull();
  });

  it('hides exact command suggestions for commands that do not need arguments', async () => {
    selection = select('/quote');
    const autocomplete = createAutocomplete();

    autocomplete.scheduleUpdate();
    await vi.runAllTimersAsync();

    expect(document.querySelector('.ytcq-command-autocomplete-card')).toBeNull();
  });

  it('keeps exact argument suggestions when a command opts out of hiding them', async () => {
    selection = select('/watch alpha');
    const autocomplete = createAutocomplete();

    autocomplete.scheduleUpdate();
    await vi.runAllTimersAsync();

    expect(document.querySelector('.ytcq-command-autocomplete-card')).not.toBeNull();
    expect(document.querySelector('.ytcq-command-autocomplete-name')?.textContent).toBe('alpha');
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

  it('keeps the card open for input clicks and closes it for outside clicks', async () => {
    selection = select('/');
    const autocomplete = createAutocomplete();

    autocomplete.scheduleUpdate();
    await vi.runAllTimersAsync();
    const inputEvent = new MouseEvent('mousedown', { bubbles: true });
    Object.defineProperty(inputEvent, 'target', {
      configurable: true,
      value: input
    });
    autocomplete.handlePointerDown(inputEvent);
    expect(document.querySelector('.ytcq-command-autocomplete-card')).not.toBeNull();

    const outside = document.createElement('button');
    document.body.append(outside);
    const outsideEvent = new MouseEvent('mousedown', { bubbles: true });
    Object.defineProperty(outsideEvent, 'target', {
      configurable: true,
      value: outside
    });
    autocomplete.handlePointerDown(outsideEvent);
    expect(document.querySelector('.ytcq-command-autocomplete-card')).toBeNull();
  });

  it('keeps the card open when clicking inside the card but outside an option', async () => {
    selection = select('/');
    const autocomplete = createAutocomplete();

    autocomplete.scheduleUpdate();
    await vi.runAllTimersAsync();
    const card = document.querySelector<HTMLElement>('.ytcq-command-autocomplete-card')!;
    const cardEvent = new MouseEvent('mousedown', { bubbles: true });
    Object.defineProperty(cardEvent, 'target', {
      configurable: true,
      value: card
    });

    autocomplete.handlePointerDown(cardEvent);

    expect(document.querySelector('.ytcq-command-autocomplete-card')).not.toBeNull();
  });

  it('limits argument suggestions to the first eight matches', async () => {
    const manyOptionsCommand: ChatCommandDefinition = {
      acceptsArguments: true,
      argumentOptions: () => Array.from({ length: 10 }, (_value, index) => ({
        description: `Option ${index}`,
        label: `option-${index}`,
        value: `option-${index}`
      })),
      helpDescription: 'Many options.',
      helpLabel: '/many',
      kind: 'setting',
      names: ['many'],
      run: vi.fn()
    };
    selection = select('/many ');
    const autocomplete = createAutocomplete({
      commandByName: new Map([['many', manyOptionsCommand]]),
      commands: [manyOptionsCommand]
    });

    autocomplete.scheduleUpdate();
    await vi.runAllTimersAsync();

    expect(document.querySelectorAll('.ytcq-command-autocomplete-option')).toHaveLength(8);
  });

  it('returns false for unrelated keys when no card is open', () => {
    selection = select('/');
    const autocomplete = createAutocomplete();

    expect(autocomplete.handleKeydown(keyEvent('a'))).toBe(false);
    expect(autocomplete.handleKeydown(keyEvent('Enter', { shiftKey: true }))).toBe(false);
  });
});

function createAutocomplete(overrides: Partial<Parameters<typeof createCommandAutocomplete>[0]> = {}): ReturnType<typeof createCommandAutocomplete> {
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
    },
    ...overrides
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
    },
    {
      acceptsArguments: true,
      argumentOptions: () => [
        { description: 'Alpha keyword', label: 'alpha', value: 'alpha' }
      ],
      helpDescription: 'Watch a keyword.',
      helpLabel: '/watch',
      hideExactArgumentAutocomplete: false,
      kind: 'text',
      names: ['watch', 'w'],
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

function keyEvent(key: string, options: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, key, ...options });
  vi.spyOn(event, 'preventDefault');
  vi.spyOn(event, 'stopPropagation');
  return event;
}
