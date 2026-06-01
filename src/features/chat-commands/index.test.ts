import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ChatCommandDefinition,
  ChatCommandRuntime
} from './types';

const chatState = vi.hoisted(() => ({
  input: null as HTMLElement | null,
  selection: null as {
    selectionEnd: number;
    selectionStart: number;
    text: string;
  } | null,
  text: ''
}));

const commandState = vi.hoisted(() => ({
  runtime: null as ChatCommandRuntime | null
}));

const chatInputMocks = vi.hoisted(() => ({
  findChatInput: vi.fn(() => chatState.input),
  getChatInputSnapshot: vi.fn(() => ({
    childNodes: [],
    text: chatState.text
  })),
  getChatInputText: vi.fn(() => chatState.text),
  getChatInputTextSelection: vi.fn(() => chatState.selection),
  replaceChatInput: vi.fn((text: string) => {
    chatState.text = text;
    return true;
  }),
  replaceChatInputSnapshot: vi.fn(() => true),
  replaceChatInputTextRange: vi.fn((start: number, end: number, text: string) => {
    chatState.text = `${chatState.text.slice(0, start)}${text}${chatState.text.slice(end)}`;
    return true;
  })
}));

const autocompleteMocks = vi.hoisted(() => ({
  close: vi.fn(),
  handleKeydown: vi.fn(() => false),
  handlePointerDown: vi.fn(),
  scheduleUpdate: vi.fn()
}));

const cardsMocks = vi.hoisted(() => ({
  close: vi.fn(),
  showHelp: vi.fn(),
  showWatchedKeywords: vi.fn()
}));

const toastMocks = vi.hoisted(() => ({
  clearToast: vi.fn(),
  showToast: vi.fn()
}));

vi.mock('../../youtube/chat-input', () => chatInputMocks);
vi.mock('./autocomplete', () => ({
  createCommandAutocomplete: vi.fn(() => autocompleteMocks)
}));
vi.mock('./cards', () => ({
  createCommandCards: vi.fn(() => cardsMocks)
}));
vi.mock('./commands', () => ({
  createChatCommands: vi.fn((runtime: ChatCommandRuntime) => {
    commandState.runtime = runtime;
    return [
      {
        helpLabel: '/help',
        kind: 'text',
        names: ['help'],
        run: () => runtime.showCommandHelp()
      },
      {
        helpLabel: '/again',
        kind: 'text',
        names: ['again'],
        run: () => runtime.replaceLastSentMessage()
      },
      {
        helpLabel: '/mention',
        inline: true,
        kind: 'text',
        names: ['mention'],
        run: () => undefined,
        runInline: (parsed) => runtime.replaceInlineCommandText('@LatestUser ', parsed, 'No mention available.')
      }
    ] satisfies ChatCommandDefinition[];
  })
}));
vi.mock('../../shared/toast', () => toastMocks);

import {
  cleanupStaleChatCommandSurfaces,
  initChatCommands,
  resetChatCommandsState
} from './index';

describe('chat commands entrypoint', () => {
  let documentListeners: Partial<Record<string, EventListener[]>>;
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
    documentListeners = {};
    addEventListenerSpy = vi.spyOn(document, 'addEventListener').mockImplementation((type, listener) => {
      const key = String(type);
      documentListeners[key] ||= [];
      documentListeners[key]?.push(listener as EventListener);
    });
    chatState.input = document.createElement('div');
    chatState.input.id = 'input';
    chatState.text = '';
    chatState.selection = null;
    document.body.append(chatState.input);
  });

  afterEach(() => {
    resetChatCommandsState();
    addEventListenerSpy.mockRestore();
    document.body.replaceChildren();
  });

  it('runs known whole-input commands with Tab and blocks Enter leakage', () => {
    const saveOptions = vi.fn();
    initChatCommands(saveOptions);
    chatState.text = '/help';

    dispatchDocumentEvent('keydown', keydown('Tab'));
    dispatchDocumentEvent('keydown', keydown('Enter'));

    expect(cardsMocks.showHelp).toHaveBeenCalledOnce();
    expect(toastMocks.showToast).toHaveBeenCalledWith('Press Tab to run this command.');
  });

  it('expands inline-capable commands at the chat input caret', () => {
    initChatCommands(vi.fn());
    chatState.text = 'hello /mention';
    chatState.selection = {
      selectionEnd: chatState.text.length,
      selectionStart: chatState.text.length,
      text: chatState.text
    };

    dispatchDocumentEvent('keydown', keydown('Tab'));

    expect(chatInputMocks.replaceChatInputTextRange).toHaveBeenCalledWith(6, 14, '@LatestUser ');
    expect(chatState.text).toBe('hello @LatestUser ');
  });

  it('remembers sent messages and restores them with /again', () => {
    initChatCommands(vi.fn());
    chatState.text = 'previous message';
    dispatchDocumentEvent('keydown', keydown('Enter'));
    chatState.text = '/again';

    dispatchDocumentEvent('keydown', keydown('Tab'));

    expect(chatInputMocks.replaceChatInputSnapshot).toHaveBeenCalledWith({
      childNodes: [],
      text: 'previous message'
    });
  });

  it('lets escaped slash commands send after replacing the double slash', () => {
    initChatCommands(vi.fn());
    chatState.text = '//help';
    const firstEnter = keydown('Enter');

    dispatchDocumentEvent('keydown', firstEnter);
    expect(chatState.text).toBe('/help');
    expect(toastMocks.showToast).toHaveBeenCalledWith('Press Enter again to send.');

    const secondEnter = keydown('Enter');
    dispatchDocumentEvent('keydown', secondEnter);
    expect(secondEnter.defaultPrevented).toBe(false);
  });

  it('cleans command cards and resets command state', () => {
    document.body.innerHTML = `
      <div class="ytcq-command-autocomplete-card"></div>
      <div class="ytcq-command-help-card"></div>
    `;
    cleanupStaleChatCommandSurfaces();
    expect(document.querySelector('.ytcq-command-autocomplete-card')).toBeNull();
    expect(document.querySelector('.ytcq-command-help-card')).toBeNull();

    commandState.runtime?.showWatchedKeywordsCard(['alpha']);
    resetChatCommandsState();

    expect(cardsMocks.showWatchedKeywords).toHaveBeenCalledWith(['alpha']);
    expect(cardsMocks.close).toHaveBeenCalled();
    expect(autocompleteMocks.close).toHaveBeenCalled();
  });

  function dispatchDocumentEvent(type: string, event: Event): void {
    Object.defineProperty(event, 'target', {
      configurable: true,
      value: chatState.input
    });
    documentListeners[type]?.forEach((listener) => listener(event));
  }
});

function keydown(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key
  });
}
