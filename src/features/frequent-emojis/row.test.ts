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
    expect(row?.querySelector<HTMLButtonElement>('button')?.title).toBe('👋 (1 use)');
    expect(row?.querySelector('img')?.alt).toBe(':custom-heart:');
  });

  it('shows usage counts in frequent emoji button tooltips', () => {
    const picker = createPicker();

    renderFrequentEmojiRow(picker, [
      emoji({ key: 'single', label: 'single emoji', count: 1 }),
      emoji({ key: 'multi', label: 'multi emoji', count: 3 })
    ], vi.fn());

    const buttons = picker.querySelectorAll<HTMLButtonElement>('.ytcq-frequent-emoji-button');
    expect(buttons[0].title).toBe('single emoji (1 use)');
    expect(buttons[0].getAttribute('aria-label')).toBe('single emoji (1 use)');
    expect(buttons[1].title).toBe('multi emoji (3 uses)');
    expect(buttons[1].getAttribute('aria-label')).toBe('multi emoji (3 uses)');
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

  it('supports mouse-only and keyboard activation paths', () => {
    const picker = createPicker();
    const chooseEmoji = vi.fn();
    const usage = emoji({ key: 'wave', text: '👋' });
    renderFrequentEmojiRow(picker, [usage], chooseEmoji);
    const button = picker.querySelector<HTMLButtonElement>('.ytcq-frequent-emoji-button')!;

    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    button.click();
    button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }));
    button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));

    expect(chooseEmoji).toHaveBeenCalledTimes(3);
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

  it('moves an existing row back to the first position when YouTube changes the picker content', () => {
    const picker = createPicker();
    const usage = emoji({ key: 'wave', text: '👋' });
    renderFrequentEmojiRow(picker, [usage], vi.fn());
    const row = picker.querySelector('.ytcq-frequent-emoji-row')!;
    const categories = picker.querySelector('#categories')!;
    categories.appendChild(row);

    renderFrequentEmojiRow(picker, [emoji({ ...usage, count: 2 })], vi.fn());

    expect(categories.firstElementChild).toBe(row);
  });

  it('chooses the best available row host when YouTube picker containers vary', () => {
    const nonSearchPicker = document.createElement('yt-emoji-picker-renderer');
    const nonSearchCategory = document.createElement('yt-emoji-picker-category-renderer');
    nonSearchPicker.append(nonSearchCategory);
    const searchOnlyPicker = document.createElement('yt-emoji-picker-renderer');
    const searchCategory = document.createElement('yt-emoji-picker-category-renderer');
    searchCategory.id = 'search-category';
    searchOnlyPicker.append(searchCategory);
    const barePicker = document.createElement('yt-emoji-picker-renderer');

    renderFrequentEmojiRow(nonSearchPicker, [emoji({ key: 'one', text: '1' })], vi.fn());
    renderFrequentEmojiRow(searchOnlyPicker, [emoji({ key: 'two', text: '2' })], vi.fn());
    renderFrequentEmojiRow(barePicker, [emoji({ key: 'three', text: '3' })], vi.fn());

    expect(nonSearchCategory.firstElementChild?.classList.contains('ytcq-frequent-emoji-row')).toBe(true);
    expect(searchCategory.firstElementChild?.classList.contains('ytcq-frequent-emoji-row')).toBe(true);
    expect(barePicker.firstElementChild?.classList.contains('ytcq-frequent-emoji-row')).toBe(true);
  });

  it('uses fallback labels for incomplete emoji records', () => {
    const picker = createPicker();

    renderFrequentEmojiRow(picker, [
      emoji({ key: 'unknown' }),
      emoji({ key: 'image-text', src: 'https://example.com/text.png', text: 'text fallback' }),
      emoji({ key: 'image-label', label: 'label fallback', src: 'https://example.com/label.png' })
    ], vi.fn());

    const buttons = picker.querySelectorAll<HTMLButtonElement>('.ytcq-frequent-emoji-button');
    const images = picker.querySelectorAll<HTMLImageElement>('img');
    expect(buttons[0].title).toBe('Emoji (1 use)');
    expect(images[0].alt).toBe('text fallback');
    expect(images[1].alt).toBe('label fallback');
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
