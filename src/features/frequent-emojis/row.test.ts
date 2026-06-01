import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderFrequentEmojiRow } from './row';
import type { EmojiUsage } from './types';

describe('frequent emoji row rendering', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('renders top emoji buttons at the start of the picker category host', () => {
    const picker = createPicker();
    const chooseEmoji = vi.fn();

    renderFrequentEmojiRow(picker, [
      emoji({ key: 'wave', text: '👋' }),
      emoji({ alt: ':custom-heart:', key: 'heart', src: 'https://example.com/heart.png' })
    ], chooseEmoji);

    const row = picker.querySelector<HTMLElement>('.ytcq-frequent-emoji-row');
    expect(row).toBe(picker.querySelector('#categories')?.firstElementChild);
    expect(row?.querySelector('.ytcq-frequent-emoji-label')?.textContent).toBe('MOST USED');
    expect(row?.querySelectorAll('button')).toHaveLength(2);
    expect(row?.querySelector('img')?.alt).toBe(':custom-heart:');
  });

  it('activates an emoji once for pointer and click pairs', () => {
    const picker = createPicker();
    const chooseEmoji = vi.fn();
    const usage = emoji({ key: 'wave', text: '👋' });
    renderFrequentEmojiRow(picker, [usage], chooseEmoji);
    const button = picker.querySelector<HTMLButtonElement>('.ytcq-frequent-emoji-button')!;

    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    button.click();

    expect(chooseEmoji).toHaveBeenCalledTimes(1);
    expect(chooseEmoji).toHaveBeenCalledWith(usage);
  });

  it('reuses unchanged rows and removes empty rows', () => {
    const picker = createPicker();
    const usage = emoji({ key: 'wave', text: '👋' });

    renderFrequentEmojiRow(picker, [usage], vi.fn());
    const row = picker.querySelector('.ytcq-frequent-emoji-row');
    renderFrequentEmojiRow(picker, [usage], vi.fn());
    expect(picker.querySelector('.ytcq-frequent-emoji-row')).toBe(row);

    renderFrequentEmojiRow(picker, [], vi.fn());
    expect(picker.querySelector('.ytcq-frequent-emoji-row')).toBeNull();
  });
});

function createPicker(): HTMLElement {
  const picker = document.createElement('yt-emoji-picker-renderer');
  const categories = document.createElement('div');
  categories.id = 'categories';
  categories.append(document.createElement('div'));
  picker.append(categories);
  document.body.append(picker);
  return picker;
}

function emoji(overrides: Partial<EmojiUsage>): EmojiUsage {
  return {
    alt: '',
    count: 1,
    emojiId: '',
    key: 'emoji',
    label: '',
    lastUsed: 1,
    shortcut: '',
    src: '',
    text: '',
    ...overrides
  };
}
