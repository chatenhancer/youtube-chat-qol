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
import { handleFeatureMutations } from '../../content/dispatcher';

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

  it('shows the quick emoji popover after hovering the native emoji button', async () => {
    chrome.storage.local.set({
      ytcqEmojiUsage: [
        emoji({
          count: 3,
          key: 'text:🙂',
          label: 'Slight smile',
          text: '🙂'
        })
      ]
    });
    const toggle = createEmojiToggle();
    initFrequentEmojis();

    toggle.dispatchEvent(
      new PointerEvent('pointerover', {
        bubbles: true,
        pointerType: 'mouse'
      })
    );
    await vi.advanceTimersByTimeAsync(149);
    expect(document.querySelector('.ytcq-quick-emoji-popover')).toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    const popover = document.querySelector<HTMLElement>('.ytcq-quick-emoji-popover');
    expect(popover?.getAttribute('role')).toBe('toolbar');
    expect(popover?.querySelector<HTMLButtonElement>('button')?.textContent).toBe('🙂');

    popover?.querySelector<HTMLButtonElement>('button')?.click();
    expect(insertMocks.insertEmojiIntoChat).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '🙂'
      })
    );

    await vi.advanceTimersByTimeAsync(150);
    expect(chrome.storage.local.set).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ytcqEmojiUsage: [expect.objectContaining({ count: 4 })]
      })
    );
  });

  it('keeps the quick popover fixed when usage refreshes after an insertion', async () => {
    chrome.storage.local.set({
      ytcqEmojiUsage: [emoji({ count: 3, text: '🙂' })]
    });
    const toggle = createEmojiToggle();
    const getToggleRect = vi
      .spyOn(toggle, 'getBoundingClientRect')
      .mockReturnValue(domRect({ bottom: 330, left: 260, right: 292, top: 298 }));
    initFrequentEmojis();
    toggle.dispatchEvent(
      new PointerEvent('pointerover', {
        bubbles: true,
        pointerType: 'mouse'
      })
    );
    await vi.advanceTimersByTimeAsync(150);
    const popover = document.querySelector<HTMLElement>('.ytcq-quick-emoji-popover')!;
    const initialPosition = { left: popover.style.left, top: popover.style.top };

    getToggleRect.mockReturnValue(domRect({ bottom: 230, left: 120, right: 152, top: 198 }));
    popover.querySelector<HTMLButtonElement>('.ytcq-frequent-emoji-button')?.click();

    expect({ left: popover.style.left, top: popover.style.top }).toEqual(initialPosition);
  });

  it('keeps the visible emoji order frozen until the popover is reopened', async () => {
    chrome.storage.local.set({
      ytcqEmojiUsage: [
        emoji({ count: 2, key: 'text:🔥', label: 'Fire', lastUsed: 2, text: '🔥' }),
        emoji({ count: 1, key: 'text:🙂', label: 'Smile', lastUsed: 1, text: '🙂' })
      ]
    });
    const toggle = createEmojiToggle();
    initFrequentEmojis();
    toggle.dispatchEvent(
      new PointerEvent('pointerover', {
        bubbles: true,
        pointerType: 'mouse'
      })
    );
    await vi.advanceTimersByTimeAsync(150);
    const popover = document.querySelector<HTMLElement>('.ytcq-quick-emoji-popover')!;
    expect(getQuickEmojiButtonTexts(popover)).toEqual(['🙂', '🔥']);

    popover.querySelector<HTMLButtonElement>('.ytcq-frequent-emoji-button')?.click();

    expect(getQuickEmojiButtonTexts(popover)).toEqual(['🙂', '🔥']);

    popover.dispatchEvent(
      new PointerEvent('pointerout', {
        bubbles: true,
        relatedTarget: document.body
      })
    );
    await vi.advanceTimersByTimeAsync(240);
    toggle.dispatchEvent(
      new PointerEvent('pointerover', {
        bubbles: true,
        pointerType: 'mouse'
      })
    );
    await vi.advanceTimersByTimeAsync(150);

    expect(
      getQuickEmojiButtonTexts(
        document.querySelector<HTMLElement>('.ytcq-quick-emoji-popover')!
      )
    ).toEqual(['🔥', '🙂']);
  });

  it('keeps the quick popover open across its surface and forgives a brief pointer slip', async () => {
    chrome.storage.local.set({
      ytcqEmojiUsage: [emoji({ text: '🙂' })]
    });
    const toggle = createEmojiToggle();
    initFrequentEmojis();
    toggle.dispatchEvent(
      new PointerEvent('pointerover', {
        bubbles: true,
        pointerType: 'mouse'
      })
    );
    await vi.advanceTimersByTimeAsync(150);
    const popover = document.querySelector<HTMLElement>('.ytcq-quick-emoji-popover')!;

    toggle.dispatchEvent(
      new PointerEvent('pointerout', {
        bubbles: true,
        relatedTarget: popover
      })
    );
    await vi.advanceTimersByTimeAsync(240);
    expect(popover.isConnected).toBe(true);

    popover.dispatchEvent(
      new PointerEvent('pointerout', {
        bubbles: true,
        relatedTarget: document.body
      })
    );
    await vi.advanceTimersByTimeAsync(100);
    popover.dispatchEvent(
      new PointerEvent('pointerover', {
        bubbles: true,
        pointerType: 'mouse',
        relatedTarget: document.body
      })
    );
    await vi.advanceTimersByTimeAsync(100);
    expect(popover.classList.contains('ytcq-quick-emoji-popover-closing')).toBe(false);

    popover.dispatchEvent(
      new PointerEvent('pointerout', {
        bubbles: true,
        relatedTarget: document.body
      })
    );
    await vi.advanceTimersByTimeAsync(139);
    expect(popover.isConnected).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(popover.classList.contains('ytcq-quick-emoji-popover-closing')).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(popover.isConnected).toBe(false);
  });

  it('closes the quick popover as soon as the native emoji toggle is pressed', async () => {
    chrome.storage.local.set({
      ytcqEmojiUsage: [emoji({ text: '🙂' })]
    });
    const toggle = createEmojiToggle();
    const icon = document.createElement('span');
    toggle.append(icon);
    initFrequentEmojis();
    toggle.dispatchEvent(
      new PointerEvent('pointerover', {
        bubbles: true,
        pointerType: 'mouse'
      })
    );
    await vi.advanceTimersByTimeAsync(150);
    const popover = document.querySelector<HTMLElement>('.ytcq-quick-emoji-popover')!;

    icon.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(popover.isConnected).toBe(false);
    expect(popover.classList.contains('ytcq-quick-emoji-popover-closing')).toBe(false);
    toggle.dispatchEvent(
      new PointerEvent('pointerover', {
        bubbles: true,
        pointerType: 'mouse'
      })
    );
    await vi.advanceTimersByTimeAsync(300);
    expect(document.querySelector('.ytcq-quick-emoji-popover')).toBeNull();
  });

  it('supports keyboard opening and Escape focus restoration', async () => {
    chrome.storage.local.set({
      ytcqEmojiUsage: [emoji({ text: '🙂' })]
    });
    const toggle = createEmojiToggle();
    initFrequentEmojis();
    toggle.focus();
    toggle.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'ArrowUp'
      })
    );

    const quickButton = document.querySelector<HTMLButtonElement>(
      '.ytcq-quick-emoji-popover .ytcq-frequent-emoji-button'
    );
    expect(document.activeElement).toBe(quickButton);

    quickButton?.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        key: 'Escape'
      })
    );
    expect(
      document
        .querySelector('.ytcq-quick-emoji-popover')
        ?.classList.contains('ytcq-quick-emoji-popover-closing')
    ).toBe(true);
    expect(document.activeElement).toBe(toggle);
    await vi.advanceTimersByTimeAsync(100);
    expect(document.querySelector('.ytcq-quick-emoji-popover')).toBeNull();
  });

  it('does not show the quick popover for touch hover events', async () => {
    chrome.storage.local.set({
      ytcqEmojiUsage: [emoji({ text: '🙂' })]
    });
    const toggle = createEmojiToggle();
    initFrequentEmojis();
    toggle.dispatchEvent(
      new PointerEvent('pointerover', {
        bubbles: true,
        pointerType: 'touch'
      })
    );
    await vi.advanceTimersByTimeAsync(150);

    expect(document.querySelector('.ytcq-quick-emoji-popover')).toBeNull();
  });

  it('does not open the quick popover from emoji nodes inside the full picker', async () => {
    chrome.storage.local.set({
      ytcqEmojiUsage: [emoji({ text: '🙂' })]
    });
    const toggle = createEmojiToggle();
    const picker = createPicker();
    const frequentRow = document.createElement('div');
    frequentRow.className = 'ytcq-frequent-emoji-row';
    const pickerEmoji = document.createElement('button');
    pickerEmoji.id = 'emoji';
    pickerEmoji.className = 'style-scope yt-live-chat-message-input-renderer';
    frequentRow.append(pickerEmoji);
    picker.querySelector('#categories')?.prepend(frequentRow);
    toggle.closest('#emoji-picker-button')?.append(picker);
    initFrequentEmojis();

    pickerEmoji.dispatchEvent(
      new PointerEvent('pointerover', {
        bubbles: true,
        pointerType: 'mouse'
      })
    );
    await vi.advanceTimersByTimeAsync(150);

    expect(document.querySelector('.ytcq-quick-emoji-popover')).toBeNull();
  });

  it('cancels a pending popover when the pointer leaves before it opens', async () => {
    chrome.storage.local.set({
      ytcqEmojiUsage: [emoji({ text: '🙂' })]
    });
    const toggle = createEmojiToggle();
    initFrequentEmojis();
    toggle.dispatchEvent(
      new PointerEvent('pointerover', {
        bubbles: true,
        pointerType: 'mouse'
      })
    );
    await vi.advanceTimersByTimeAsync(50);
    toggle.dispatchEvent(
      new PointerEvent('pointerout', {
        bubbles: true,
        relatedTarget: document.body
      })
    );
    await vi.advanceTimersByTimeAsync(240);

    expect(document.querySelector('.ytcq-quick-emoji-popover')).toBeNull();
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

  it('does not recreate frequent emoji rows from a pending refresh after cleanup', async () => {
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

    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    cleanupStaleFrequentEmojis();
    await vi.advanceTimersByTimeAsync(50);

    expect(picker.querySelector('.ytcq-frequent-emoji-row')).toBeNull();
    expect(document.querySelector('.ytcq-quick-emoji-popover')).toBeNull();
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
      mutations: []
    });

    expect(picker.querySelector('.ytcq-frequent-emoji-row')).not.toBeNull();
    expect(nestedPicker.querySelector('.ytcq-frequent-emoji-row')).not.toBeNull();
  });

  it('closes the quick popover when YouTube mounts its native emoji picker', async () => {
    chrome.storage.local.set({
      ytcqEmojiUsage: [emoji({ text: '🙂' })]
    });
    const toggle = createEmojiToggle();
    initFrequentEmojis();
    toggle.dispatchEvent(
      new PointerEvent('pointerover', {
        bubbles: true,
        pointerType: 'mouse'
      })
    );
    await vi.advanceTimersByTimeAsync(150);
    const popover = document.querySelector<HTMLElement>('.ytcq-quick-emoji-popover')!;
    const picker = createPicker();

    handleFeatureMutations({ addedElements: [picker], mutations: [] });

    expect(popover.isConnected).toBe(false);
    expect(popover.classList.contains('ytcq-quick-emoji-popover-closing')).toBe(false);
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

function createEmojiToggle(): HTMLButtonElement {
  const container = document.createElement('div');
  container.id = 'emoji-picker-button';
  const renderer = document.createElement('yt-live-chat-icon-toggle-button-renderer');
  renderer.id = 'emoji';
  renderer.className = 'style-scope yt-live-chat-message-input-renderer';
  const toggle = document.createElement('button');
  renderer.append(toggle);
  container.append(renderer);
  document.body.append(container);
  return toggle;
}

function getQuickEmojiButtonTexts(popover: HTMLElement): string[] {
  return Array.from(
    popover.querySelectorAll<HTMLButtonElement>('.ytcq-frequent-emoji-button')
  ).map((button) => button.textContent || '');
}

function domRect({
  bottom,
  left,
  right,
  top
}: {
  bottom: number;
  left: number;
  right: number;
  top: number;
}): DOMRect {
  return {
    bottom,
    height: bottom - top,
    left,
    right,
    top,
    width: right - left,
    x: left,
    y: top,
    toJSON: () => ({})
  };
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
