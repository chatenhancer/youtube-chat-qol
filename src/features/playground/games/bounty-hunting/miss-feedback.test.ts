import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOUNTY_HUNTING_MISS_COOLDOWN_MS } from '../../../../shared/playground/bounty-hunting';
import { createBountyHuntingMissFeedback } from './miss-feedback';

describe('Bounty Hunting miss feedback', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });

  afterEach(() => {
    document.documentElement.classList.remove('ytcq-bounty-hunting-reloading');
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('follows the pointer, hides outside chat, and expires after one reload', async () => {
    const feedback = createBountyHuntingMissFeedback();
    const element = getMissFeedbackElement();

    expect(element.hidden).toBe(true);
    feedback.move(40, 50);
    feedback.syncUntil(Date.now() + BOUNTY_HUNTING_MISS_COOLDOWN_MS, {
      clientX: 40,
      clientY: 50
    });

    expect(feedback.isActive()).toBe(true);
    expect(element.hidden).toBe(false);
    expect(document.documentElement.classList).toContain('ytcq-bounty-hunting-reloading');
    expect(element.textContent).toBe('MISS! Reloading...');
    expect(element.querySelector('.ytcq-bounty-hunting-miss-countdown')).toBeNull();
    expect(element.style.left).toBe('52px');
    expect(element.style.top).toBe('50px');
    expect(
      element.style.getPropertyValue('--ytcq-bounty-hunting-reload-duration')
    ).toBe('5000ms');
    expect(element.classList).toContain('ytcq-bounty-hunting-reload-progress');
    expect(element.querySelector('.ytcq-bounty-hunting-miss-icon')).not.toBeNull();
    expect(element.querySelectorAll('clipPath')).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(element.classList).toContain('ytcq-bounty-hunting-reload-progress');

    document.documentElement.dispatchEvent(new MouseEvent('mouseleave'));
    expect(element.hidden).toBe(true);
    expect(document.documentElement.classList).toContain('ytcq-bounty-hunting-reloading');

    feedback.move(70, 80);
    expect(element.hidden).toBe(false);
    expect(element.style.left).toBe('82px');
    expect(element.style.top).toBe('80px');

    await vi.advanceTimersByTimeAsync(BOUNTY_HUNTING_MISS_COOLDOWN_MS - 1_000);

    expect(feedback.isActive()).toBe(false);
    expect(element.hidden).toBe(true);
    expect(element.textContent).toBe('');
    expect(element.classList).not.toContain('ytcq-bounty-hunting-reload-progress');
    expect(document.documentElement.classList).not.toContain('ytcq-bounty-hunting-reloading');
    feedback.destroy();
    expect(element.isConnected).toBe(false);
  });

  it('reconciles its fill to an absolute backend deadline', async () => {
    const feedback = createBountyHuntingMissFeedback();
    const element = getMissFeedbackElement();

    feedback.syncUntil(13_400);

    expect(feedback.isActive()).toBe(true);
    expect(element.hidden).toBe(true);
    expect(element.querySelector('.ytcq-bounty-hunting-miss-countdown')).toBeNull();
    expect(element.classList).toContain('ytcq-bounty-hunting-reload-progress');
    expect(
      element.style.getPropertyValue('--ytcq-bounty-hunting-reload-duration')
    ).toBe('3400ms');

    feedback.move(20, 30);
    expect(element.hidden).toBe(false);

    await vi.advanceTimersByTimeAsync(3_399);
    expect(feedback.isActive()).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    expect(feedback.isActive()).toBe(false);
    expect(element.hidden).toBe(true);
  });
});

function getMissFeedbackElement(): HTMLElement {
  return document.querySelector<HTMLElement>('.ytcq-bounty-hunting-miss-feedback')!;
}
