import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderQuickEmojiPopover } from './quick-popover';
import type { EmojiUsage } from './types';

describe('quick emoji popover rendering', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('renders an accessible toolbar with reusable frequent emoji buttons', () => {
    const chooseEmoji = vi.fn();
    const wave = emoji({ key: 'wave', text: '👋' });
    const heart = emoji({
      alt: ':custom-heart:',
      key: 'heart',
      src: 'https://example.com/heart.png'
    });

    const popover = renderQuickEmojiPopover(null, [wave, heart], chooseEmoji)!;
    document.body.append(popover);

    expect(popover.getAttribute('role')).toBe('toolbar');
    expect(popover.getAttribute('aria-label')).toBe('MOST USED');
    expect(popover.style.getPropertyValue('--ytcq-quick-emoji-columns')).toBe('2');
    expect(popover.querySelectorAll('button')).toHaveLength(2);
    expect(Array.from(popover.querySelectorAll('button')).every((button) => !button.title)).toBe(
      true
    );
    expect(popover.querySelector('img')?.alt).toBe(':custom-heart:');
    expect(popover.querySelector<HTMLButtonElement>('button:last-child')?.textContent).toBe('👋');

    popover.querySelector<HTMLButtonElement>('button:last-child')?.click();
    expect(chooseEmoji).toHaveBeenCalledWith(wave);
  });

  it('reuses unchanged content, refreshes changed rankings, and removes empty popovers', () => {
    const chooseEmoji = vi.fn();
    const wave = emoji({ key: 'wave', text: '👋' });
    const popover = renderQuickEmojiPopover(null, [wave], chooseEmoji)!;
    const firstButton = popover.querySelector('button');

    expect(renderQuickEmojiPopover(popover, [wave], chooseEmoji)).toBe(popover);
    expect(popover.querySelector('button')).toBe(firstButton);

    renderQuickEmojiPopover(popover, [emoji({ ...wave, count: 2 })], chooseEmoji);
    expect(popover.querySelector('button')).not.toBe(firstButton);
    expect(popover.querySelector('button')?.title).toBe('');
    expect(popover.querySelector('button')?.getAttribute('aria-label')).toBe('👋 (2 uses)');

    document.body.append(popover);
    expect(renderQuickEmojiPopover(popover, [], chooseEmoji)).toBeNull();
    expect(popover.isConnected).toBe(false);
  });
});

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
