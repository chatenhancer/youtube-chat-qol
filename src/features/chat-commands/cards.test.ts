import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCommandCards } from './cards';
import type { ChatCommandDefinition } from './types';

vi.mock('../../youtube/chat-input', () => ({
  findChatInput: vi.fn(() => document.querySelector('[data-chat-input]'))
}));

describe('chat command cards', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('renders command help and closes from the close button', () => {
    const cards = createCommandCards();

    cards.showHelp([command('/time'), command('/quote')], () => 'Command description');

    const card = document.querySelector('.ytcq-command-help-card');
    expect(card).not.toBeNull();
    expect(card?.getAttribute('role')).toBe('dialog');
    expect([...document.querySelectorAll('dt')].map((node) => node.textContent)).toEqual(['/time', '/quote']);
    expect([...document.querySelectorAll('dd')].map((node) => node.textContent)).toEqual([
      'Command description',
      'Command description'
    ]);

    document.querySelector<HTMLButtonElement>('.ytcq-command-help-close')?.click();

    expect(document.querySelector('.ytcq-command-help-card')).toBeNull();
  });

  it('replaces the active card when opening watched keywords', () => {
    const cards = createCommandCards();
    cards.showHelp([command('/time')], () => 'Time command');

    cards.showWatchedKeywords(['launch', 'status update']);

    expect(document.querySelectorAll('.ytcq-command-help-card')).toHaveLength(1);
    expect(document.querySelector('.ytcq-command-help-card')?.textContent).toContain('"launch", "status update"');
  });

  it('shows the empty watched keyword state and closes on Escape', async () => {
    vi.useFakeTimers();
    const cards = createCommandCards();
    cards.showWatchedKeywords([]);
    await vi.runAllTimersAsync();

    expect(document.querySelector('.ytcq-command-help-card')?.textContent).toContain('No watched keywords yet.');

    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));

    expect(document.querySelector('.ytcq-command-help-card')).toBeNull();
  });

  it('closes on outside clicks after listener wiring', async () => {
    vi.useFakeTimers();
    const cards = createCommandCards();
    cards.showWatchedKeywords(['launch']);
    await vi.runAllTimersAsync();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(document.querySelector('.ytcq-command-help-card')).toBeNull();
  });
});

function command(helpLabel: string): ChatCommandDefinition {
  return {
    helpLabel,
    kind: 'text',
    names: [helpLabel.slice(1)],
    run: vi.fn()
  };
}
