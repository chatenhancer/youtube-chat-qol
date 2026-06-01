import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmojiUsage } from './types';

const insertMocks = vi.hoisted(() => ({
  insertEmojiIntoChat: vi.fn(() => true)
}));

vi.mock('./insert', () => insertMocks);

import {
  cleanupStaleFrequentEmojis,
  initFrequentEmojis,
  resetFrequentEmojis
} from './index';

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
