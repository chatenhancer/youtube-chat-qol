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
  options: null as { isChatInputActive: () => boolean } | null,
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
  createCommandAutocomplete: vi.fn((options: { isChatInputActive: () => boolean }) => {
    autocompleteMocks.options = options;
    return autocompleteMocks;
  })
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
        helpDescriptionKey: 'commandHelpMention',
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
    cleanupStaleChatCommandSurfaces();
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
    const getDescription = cardsMocks.showHelp.mock.calls[0]?.[1] as (command: ChatCommandDefinition) => string;
    expect(getDescription({
      helpDescriptionKey: 'commandHelpMention',
      helpLabel: '/mention',
      kind: 'text',
      names: ['mention'],
      run: vi.fn()
    })).toContain('Mention');
    expect(toastMocks.showToast).toHaveBeenCalledWith('Press Tab to run this command.');
  });

  it('ignores composing, prevented, and outside key events', () => {
    initChatCommands(vi.fn());
    chatState.text = '/help';
    const prevented = keydown('Tab');
    prevented.preventDefault();

    dispatchDocumentEvent('keydown', prevented);
    dispatchDocumentEvent('keydown', keydown('Tab', { isComposing: true }));
    dispatchDocumentEvent('keydown', keydown('Tab'), document.createElement('button'));

    expect(cardsMocks.showHelp).not.toHaveBeenCalled();
  });

  it('lets unknown slash commands pass through unchanged', () => {
    initChatCommands(vi.fn());
    chatState.text = '/unknown';
    const tab = keydown('Tab');
    const enter = keydown('Enter');

    dispatchDocumentEvent('keydown', tab);
    dispatchDocumentEvent('keydown', enter);

    expect(tab.defaultPrevented).toBe(false);
    expect(enter.defaultPrevented).toBe(false);
    expect(toastMocks.showToast).not.toHaveBeenCalled();
  });

  it('does not block Shift Enter for known commands', () => {
    initChatCommands(vi.fn());
    chatState.text = '/help';
    const enter = keydown('Enter', { shiftKey: true });

    dispatchDocumentEvent('keydown', enter);

    expect(enter.defaultPrevented).toBe(false);
    expect(toastMocks.showToast).not.toHaveBeenCalled();
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

  it('lets autocomplete own keydown handling before command execution', () => {
    autocompleteMocks.handleKeydown.mockReturnValueOnce(true);
    initChatCommands(vi.fn());
    chatState.text = '/help';

    dispatchDocumentEvent('keydown', keydown('Tab'));

    expect(cardsMocks.showHelp).not.toHaveBeenCalled();
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

  it('reports when restoring a previous message cannot write to the composer', () => {
    initChatCommands(vi.fn());
    chatState.text = 'previous message';
    dispatchDocumentEvent('keydown', keydown('Enter'));
    chatState.text = '/again';
    chatInputMocks.replaceChatInputSnapshot.mockReturnValueOnce(false);

    dispatchDocumentEvent('keydown', keydown('Tab'));

    expect(toastMocks.showToast).toHaveBeenCalledWith('Could not find the chat input.');
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

  it('lets escaped slash commands send from the send button after the first replacement click', () => {
    initChatCommands(vi.fn());
    const sendButton = document.createElement('button');
    sendButton.id = 'send-button';
    document.body.append(sendButton);
    chatState.text = '//help';
    const firstClick = mouseEvent('click');

    dispatchDocumentEvent('click', firstClick, sendButton);
    expect(firstClick.defaultPrevented).toBe(true);
    expect(chatState.text).toBe('/help');

    const secondClick = mouseEvent('click');
    dispatchDocumentEvent('click', secondClick, sendButton);
    expect(secondClick.defaultPrevented).toBe(false);
  });

  it('applies the same command blocking rules to send button clicks', () => {
    initChatCommands(vi.fn());
    const sendButton = document.createElement('button');
    sendButton.id = 'send-button';
    document.body.append(sendButton);
    chatState.text = '/help';
    const knownClick = mouseEvent('click');

    dispatchDocumentEvent('click', knownClick, sendButton);

    expect(knownClick.defaultPrevented).toBe(true);
    expect(toastMocks.showToast).toHaveBeenCalledWith('Press Tab to run this command.');

    toastMocks.showToast.mockClear();
    chatState.text = '/unknown';
    const unknownClick = mouseEvent('click');
    dispatchDocumentEvent('click', unknownClick, sendButton);
    expect(unknownClick.defaultPrevented).toBe(false);
    expect(toastMocks.showToast).not.toHaveBeenCalled();
  });

  it('remembers ordinary send-button text for repeat commands', () => {
    initChatCommands(vi.fn());
    const sendButton = document.createElement('button');
    sendButton.id = 'send-button';
    document.body.append(sendButton);
    chatState.text = 'ordinary message';

    dispatchDocumentEvent('click', mouseEvent('click'), sendButton);
    chatState.text = '/again';
    dispatchDocumentEvent('keydown', keydown('Tab'));

    expect(chatInputMocks.replaceChatInputSnapshot).toHaveBeenCalledWith({
      childNodes: [],
      text: 'ordinary message'
    });
  });

  it('reports chat input active state through the autocomplete runtime options', () => {
    initChatCommands(vi.fn());

    expect(autocompleteMocks.options?.isChatInputActive()).toBe(false);

    chatState.input!.tabIndex = 0;
    chatState.input?.focus();
    expect(autocompleteMocks.options?.isChatInputActive()).toBe(true);

    chatState.input = null;
    expect(autocompleteMocks.options?.isChatInputActive()).toBe(false);
  });

  it('updates autocomplete from input and selection activity', () => {
    initChatCommands(vi.fn());

    dispatchDocumentEvent('input', new InputEvent('input', { bubbles: true }));
    dispatchDocumentEvent('selectionchange', new Event('selectionchange'));
    dispatchDocumentEvent('mousedown', mouseEvent('mousedown'));

    expect(autocompleteMocks.scheduleUpdate).toHaveBeenCalledTimes(2);
    expect(autocompleteMocks.handlePointerDown).toHaveBeenCalledOnce();
  });

  it('shows useful runtime errors when command replacement helpers cannot write', () => {
    initChatCommands(vi.fn());

    commandState.runtime?.replaceCommandText('', 'Empty command output.');
    commandState.runtime?.replaceInlineCommandText('', {
      args: '',
      end: 5,
      name: 'mention',
      start: 0,
      text: '/mention'
    }, 'Empty inline output.');
    chatInputMocks.replaceChatInput.mockReturnValueOnce(false);
    commandState.runtime?.replaceCommandText('replacement', 'Empty command output.');
    chatInputMocks.replaceChatInputTextRange.mockReturnValueOnce(false);
    commandState.runtime?.replaceInlineCommandText('inline', {
      args: '',
      end: 5,
      name: 'mention',
      start: 0,
      text: '/mention'
    }, 'Empty inline output.');
    commandState.runtime?.replaceLastSentMessage();

    expect(toastMocks.showToast).toHaveBeenCalledWith('Empty command output.');
    expect(toastMocks.showToast).toHaveBeenCalledWith('Empty inline output.');
    expect(toastMocks.showToast).toHaveBeenCalledWith('Could not find the chat input.');
    expect(toastMocks.showToast).toHaveBeenCalledWith('No previous message yet.');
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

  function dispatchDocumentEvent(type: string, event: Event, target: EventTarget = chatState.input!): void {
    Object.defineProperty(event, 'target', {
      configurable: true,
      value: target
    });
    documentListeners[type]?.forEach((listener) => listener(event));
  }
});

function keydown(key: string, options: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key,
    ...options
  });
}

function mouseEvent(type: string): MouseEvent {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true
  });
}
