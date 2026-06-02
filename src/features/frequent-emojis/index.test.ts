import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmojiUsage } from './types';

const insertMocks = vi.hoisted(() => ({
  insertEmojiIntoChat: vi.fn(() => true)
}));

vi.mock('./insert', () => insertMocks);

import {
  cleanupStaleFrequentEmojis,
  enhanceEmojiPicker,
  handleEmojiPickerClick,
  initFrequentEmojis,
  resetFrequentEmojis
} from './index';
import { handleFeatureMutations } from '../../content/lifecycle';

describe('frequent emoji feature entry points', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.useFakeTimers();
    chrome.storage.local.clear();
    vi.clearAllMocks();
    resetFrequentEmojis();
  });

  afterEach(() => {
    resetFrequentEmojis();
    vi.useRealTimers();
  });

  it('loads stored usage and renders a most-used row in existing emoji pickers', () => {
    chrome.storage.local.set({
      ytcqEmojiUsage: [emoji({
        count: 3,
        key: 'text:🙂',
        label: 'Slight smile',
        text: '🙂'
      })]
    });
    const picker = createPicker();
    document.body.append(picker);

    initFrequentEmojis();

    expect(picker.querySelector('.ytcq-frequent-emoji-label')?.textContent).toBe('MOST USED');
    expect(picker.querySelector<HTMLButtonElement>('.ytcq-frequent-emoji-button')?.textContent).toBe('🙂');
  });

  it('records native emoji picker selections and persists usage after a debounce', async () => {
    const picker = createPicker();
    const option = document.createElement('div');
    option.setAttribute('role', 'option');
    option.setAttribute('aria-label', 'Rocket');
    option.textContent = '🚀';
    picker.append(option);
    document.body.append(picker);

    initFrequentEmojis();
    option.dispatchEvent(new MouseEvent('click', {
      bubbles: true
    }));

    await vi.advanceTimersByTimeAsync(150);

    const saved = vi.mocked(chrome.storage.local.set).mock.calls.at(-1)?.[0] as {
      ytcqEmojiUsage?: EmojiUsage[];
    };
    expect(saved.ytcqEmojiUsage?.[0]).toMatchObject({
      count: 1,
      label: 'Rocket',
      text: '🚀'
    });
    expect(picker.querySelector<HTMLButtonElement>('.ytcq-frequent-emoji-button')?.textContent).toBe('🚀');
  });

  it('inserts frequent emojis without immediately removing the visible row', () => {
    chrome.storage.local.set({
      ytcqEmojiUsage: [emoji({
        count: 3,
        key: 'text:🙂',
        label: 'Slight smile',
        text: '🙂'
      })]
    });
    const picker = createPicker();
    document.body.append(picker);

    initFrequentEmojis();
    picker.querySelector<HTMLButtonElement>('.ytcq-frequent-emoji-button')!.click();

    expect(insertMocks.insertEmojiIntoChat).toHaveBeenCalledWith(expect.objectContaining({
      text: '🙂'
    }));
    expect(picker.querySelector('.ytcq-frequent-emoji-row')).not.toBeNull();

    cleanupStaleFrequentEmojis();
    expect(picker.querySelector('.ytcq-frequent-emoji-row')).toBeNull();
  });

  it('does not record clicks from the frequent row or variant parent emoji options', async () => {
    const picker = createPicker();
    const frequentRow = document.createElement('div');
    frequentRow.className = 'ytcq-frequent-emoji-row';
    const frequentOption = document.createElement('div');
    frequentOption.setAttribute('role', 'option');
    frequentOption.textContent = '🙂';
    frequentRow.append(frequentOption);
    const variantParent = document.createElement('div');
    variantParent.setAttribute('role', 'option');
    variantParent.setAttribute('aria-label', ':thumbs_up:');
    variantParent.textContent = '👍';
    picker.append(frequentRow, variantParent);
    document.body.append(picker);

    initFrequentEmojis();
    frequentOption.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    variantParent.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(150);

    expect(chrome.storage.local.set).not.toHaveBeenCalledWith(expect.objectContaining({
      ytcqEmojiUsage: expect.any(Array)
    }));
  });

  it('refreshes emoji pickers after the native emoji toggle is clicked', async () => {
    chrome.storage.local.set({
      ytcqEmojiUsage: [emoji({
        count: 2,
        key: 'text:🎉',
        label: 'Party',
        text: '🎉'
      })]
    });
    initFrequentEmojis();
    const toggle = document.createElement('button');
    toggle.id = 'emoji';
    toggle.className = 'style-scope yt-live-chat-message-input-renderer';
    document.body.append(toggle);
    const picker = createPicker();
    document.body.append(picker);

    handleEmojiPickerClick(new MouseEvent('click', { bubbles: true }));
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(50);

    expect(picker.querySelector('.ytcq-frequent-emoji-row')).not.toBeNull();
  });

  it('enhances picker nodes discovered by lifecycle mutations', () => {
    chrome.storage.local.set({
      ytcqEmojiUsage: [emoji({
        count: 2,
        key: 'text:🔥',
        label: 'Fire',
        text: '🔥'
      })]
    });
    initFrequentEmojis();
    const picker = createPicker();
    const child = document.createElement('div');
    picker.append(child);
    const wrapper = document.createElement('div');
    const nestedPicker = createPicker();
    wrapper.append(nestedPicker);

    handleFeatureMutations({
      addedElements: [picker, child, wrapper],
      changedMessages: [],
      mutations: []
    });

    expect(picker.querySelector('.ytcq-frequent-emoji-row')).not.toBeNull();
    expect(nestedPicker.querySelector('.ytcq-frequent-emoji-row')).not.toBeNull();
  });

  it('does not record frequent emoji usage when direct insertion fails', async () => {
    insertMocks.insertEmojiIntoChat.mockReturnValueOnce(false);
    chrome.storage.local.set({
      ytcqEmojiUsage: [emoji({
        count: 3,
        key: 'text:🙂',
        label: 'Slight smile',
        text: '🙂'
      })]
    });
    const picker = createPicker();
    document.body.append(picker);

    initFrequentEmojis();
    picker.querySelector<HTMLButtonElement>('.ytcq-frequent-emoji-button')!.click();
    await vi.advanceTimersByTimeAsync(150);

    expect(chrome.storage.local.set).not.toHaveBeenLastCalledWith(expect.objectContaining({
      ytcqEmojiUsage: [expect.objectContaining({ count: 4 })]
    }));
  });

  it('ignores non-HTMLElement picker enhancement requests and clears pending saves on reset', async () => {
    const option = document.createElement('div');
    option.setAttribute('role', 'option');
    option.textContent = '⭐';
    const picker = createPicker();
    picker.append(option);
    document.body.append(picker);
    initFrequentEmojis();
    enhanceEmojiPicker(document.createTextNode('not an element') as unknown as Element);

    option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    resetFrequentEmojis();
    await vi.advanceTimersByTimeAsync(150);

    expect(chrome.storage.local.set).not.toHaveBeenLastCalledWith(expect.objectContaining({
      ytcqEmojiUsage: [expect.objectContaining({ text: '⭐' })]
    }));
  });
});

function createPicker(): HTMLElement {
  const picker = document.createElement('yt-emoji-picker-renderer');
  const categories = document.createElement('div');
  categories.id = 'categories';
  picker.append(categories);
  return picker;
}

function emoji(overrides: Partial<EmojiUsage>): EmojiUsage {
  return {
    alt: '',
    count: 1,
    emojiId: '',
    key: 'text:🙂',
    label: 'Slight smile',
    lastUsed: 1,
    shortcut: '',
    src: '',
    text: '🙂',
    ...overrides
  };
}
