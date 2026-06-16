import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createGamePanelStatusOverlay,
  showGamePanelFeedbackBubble,
  toGamePanelStatusMessage
} from './panel-feedback';

describe('game panel feedback surfaces', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('prioritizes system messages and clears overlay owners independently', () => {
    const overlay = createGamePanelStatusOverlay({ classNamePrefix: 'ytcq-test-game' });
    document.body.append(overlay.element);

    expect(overlay.element.hidden).toBe(true);
    expect(overlay.has({ keyPrefix: 'check', owner: 'game' })).toBe(false);
    expect(overlay.isBlocking()).toBe(false);

    overlay.show(toGamePanelStatusMessage({
      key: 'check:game-1',
      message: 'Check',
      temporary: true,
      timeoutMs: 50
    }));
    expect(overlay.element.textContent).toBe('Check');
    expect(overlay.element.dataset.owner).toBe('game');
    expect(overlay.has({ keyPrefix: 'check', owner: 'game' })).toBe(true);
    expect(overlay.has({ keyPrefix: 'mate', owner: 'game' })).toBe(false);
    expect(overlay.isBlocking()).toBe(false);

    overlay.show({
      key: 'connection',
      message: 'Connection lost.',
      owner: 'system',
      temporary: false
    });
    expect(overlay.element.textContent).toBe('Connection lost.');
    expect(overlay.element.dataset.owner).toBe('system');
    expect(overlay.isBlocking()).toBe(true);

    overlay.show({
      key: 'connection',
      message: 'Still reconnecting.',
      owner: 'system',
      temporary: false
    });
    expect(overlay.element.textContent).toBe('Still reconnecting.');

    overlay.clear({ owner: 'system' });
    expect(overlay.element.textContent).toBe('Check');
    expect(overlay.element.dataset.owner).toBe('game');

    overlay.clear({ owner: 'game' });
    expect(overlay.element.hidden).toBe(true);
    expect(overlay.element.textContent).toBe('');
    expect(overlay.element.dataset.owner).toBeUndefined();
    expect(overlay.element.dataset.temporary).toBeUndefined();
  });

  it('expires temporary overlay messages with custom and default timeouts', () => {
    const overlay = createGamePanelStatusOverlay({ classNamePrefix: 'ytcq-test-game' });
    document.body.append(overlay.element);

    overlay.show(toGamePanelStatusMessage({
      key: 'short',
      message: 'Short status',
      temporary: true,
      timeoutMs: 25
    }));
    vi.advanceTimersByTime(24);
    expect(overlay.element.hidden).toBe(false);

    vi.advanceTimersByTime(1);
    expect(overlay.element.hidden).toBe(true);

    overlay.show(toGamePanelStatusMessage({
      key: 'default',
      message: 'Default status',
      temporary: true
    }));
    vi.advanceTimersByTime(1499);
    expect(overlay.element.hidden).toBe(false);

    vi.advanceTimersByTime(1);
    expect(overlay.element.hidden).toBe(true);
  });

  it('positions floating feedback bubbles and removes them after animation or timeout', () => {
    const click = new MouseEvent('click', {
      clientX: 12.6,
      clientY: 54.4
    });

    showGamePanelFeedbackBubble({
      className: 'ytcq-test-feedback',
      event: click,
      message: 'Choose your piece',
      timeoutMs: 30
    });

    const bubble = document.querySelector<HTMLElement>('.ytcq-test-feedback');
    expect(bubble?.textContent).toBe('Choose your piece');
    expect(bubble?.style.left).toBe('13px');
    expect(bubble?.style.top).toBe('54px');
    expect(bubble?.style.visibility).toBe('');

    bubble?.dispatchEvent(new Event('animationend'));
    expect(document.querySelector('.ytcq-test-feedback')).toBeNull();

    showGamePanelFeedbackBubble({
      className: 'ytcq-test-feedback',
      event: click,
      message: 'Invalid move',
      timeoutMs: 30
    });
    vi.advanceTimersByTime(30);
    expect(document.querySelector('.ytcq-test-feedback')).toBeNull();
  });
});
