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

  it('keeps the card open for inside clicks and non-Escape keys', async () => {
    vi.useFakeTimers();
    const cards = createCommandCards();
    cards.showWatchedKeywords(['launch']);
    await vi.runAllTimersAsync();

    document.querySelector<HTMLElement>('.ytcq-command-help-card')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }));

    expect(document.querySelector('.ytcq-command-help-card')).not.toBeNull();
  });

  it('repositions on resize while open and closes idempotently', async () => {
    vi.useFakeTimers();
    const input = document.createElement('div');
    input.dataset.chatInput = 'true';
    document.body.append(input);
    const cards = createCommandCards();

    cards.showWatchedKeywords(['launch']);
    const card = document.querySelector<HTMLElement>('.ytcq-command-help-card')!;
    card.getBoundingClientRect = () => ({
      bottom: 120,
      height: 80,
      left: 0,
      right: 200,
      top: 40,
      width: 200,
      x: 0,
      y: 40,
      toJSON: () => ({})
    });
    await vi.runAllTimersAsync();
    window.dispatchEvent(new Event('resize'));
    cards.close();
    cards.close();

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
