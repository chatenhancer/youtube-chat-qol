import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGamePanelShell } from './panel-shell';

describe('game panel shell', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 500
    });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 800
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('creates the shared floating panel structure and wires close actions', () => {
    const controller = new AbortController();
    const onClose = vi.fn();
    const shell = createGamePanelShell({
      ariaLabel: 'Replay Trivia panel',
      classNamePrefix: 'ytcq-replay-trivia',
      closeLabel: 'Close Replay Trivia',
      icon: document.createElement('span'),
      onClose,
      signal: controller.signal,
      subtitle: 'Round 1',
      title: 'Replay Trivia'
    });

    expect(shell.panel.parentElement).toBe(document.body);
    expect(shell.panel.getAttribute('role')).toBe('dialog');
    expect(shell.panel.getAttribute('aria-label')).toBe('Replay Trivia panel');
    expect(shell.titleElement.textContent).toBe('Replay Trivia');
    expect(shell.subtitleElement.textContent).toBe('Round 1');
    expect(shell.statusOverlay.element.parentElement).toBe(shell.body);
    expect(shell.statusOverlay.element.className).toContain('ytcq-replay-trivia-status');
    expect(shell.statusOverlay.element.hidden).toBe(true);

    shell.closeButton.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalledTimes(2);

    controller.abort();
    shell.closeButton.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('supports opt-in compact mode toggling', () => {
    const controller = new AbortController();
    const onCompactChange = vi.fn();
    const shell = createGamePanelShell({
      ariaLabel: 'Bounty Hunting panel',
      classNamePrefix: 'ytcq-bounty-hunting-game',
      closeLabel: 'Hide',
      icon: document.createElement('span'),
      onClose: vi.fn(),
      signal: controller.signal,
      subtitle: 'Player TEST',
      title: 'Bounty Hunting'
    });

    expect(shell.compactButton.hidden).toBe(true);
    expect(shell.panel.classList.contains('ytcq-game-panel-has-compact')).toBe(false);

    shell.setCompactModeEnabled({
      compactLabel: 'Minimize',
      expandLabel: 'Expand',
      onChange: onCompactChange
    });

    expect(shell.compactButton.hidden).toBe(false);
    expect(shell.compactButton.getAttribute('aria-label')).toBe('Minimize');
    expect(shell.compactButton.getAttribute('aria-pressed')).toBe('false');
    expect(shell.panel.classList.contains('ytcq-game-panel-has-compact')).toBe(true);

    shell.compactButton.click();

    expect(shell.isCompactMode()).toBe(true);
    expect(onCompactChange).toHaveBeenCalledWith(true);
    expect(shell.compactButton.getAttribute('aria-label')).toBe('Expand');
    expect(shell.compactButton.getAttribute('aria-pressed')).toBe('true');
    expect(shell.panel.classList.contains('ytcq-game-panel-compact')).toBe(true);

    shell.compactButton.click();

    expect(shell.isCompactMode()).toBe(false);
    expect(onCompactChange).toHaveBeenLastCalledWith(false);
    expect(shell.compactButton.getAttribute('aria-label')).toBe('Minimize');
    expect(shell.compactButton.getAttribute('aria-pressed')).toBe('false');
    expect(shell.panel.classList.contains('ytcq-game-panel-compact')).toBe(false);

    shell.setCompactModeEnabled(null);

    expect(shell.compactButton.hidden).toBe(true);
    expect(shell.panel.classList.contains('ytcq-game-panel-has-compact')).toBe(false);
  });

  it('keeps the panel at its current top-left position when compact mode changes content height', () => {
    const controller = new AbortController();
    let rect = createRect({
      bottom: 470,
      height: 420,
      left: 120,
      right: 471,
      top: 50,
      width: 351
    });
    const shell = createGamePanelShell({
      ariaLabel: 'Bounty Hunting panel',
      classNamePrefix: 'ytcq-bounty-hunting-game',
      closeLabel: 'Hide',
      icon: document.createElement('span'),
      onClose: vi.fn(),
      signal: controller.signal,
      subtitle: 'Player TEST',
      title: 'Bounty Hunting'
    });
    vi.spyOn(shell.panel, 'getBoundingClientRect').mockImplementation(() => rect);
    shell.setCompactModeEnabled({
      compactLabel: 'Minimize',
      expandLabel: 'Expand',
      onChange: () => {
        rect = createRect({
          bottom: 170,
          height: 120,
          left: 120,
          right: 471,
          top: 50,
          width: 351
        });
      }
    });

    shell.compactButton.click();

    expect(shell.panel.style.left).toBe('120px');
    expect(shell.panel.style.top).toBe('50px');
    expect(shell.panel.style.right).toBe('auto');
    expect(shell.panel.style.bottom).toBe('auto');
  });

  it('drags the panel while clamping it to the viewport', () => {
    const controller = new AbortController();
    const onClose = vi.fn();
    const shell = createGamePanelShell({
      ariaLabel: 'Chess panel',
      classNamePrefix: 'ytcq-chess',
      closeLabel: 'Close chess',
      icon: document.createElement('span'),
      onClose,
      signal: controller.signal,
      subtitle: 'White to move',
      title: 'Chess'
    });
    vi.spyOn(shell.panel, 'getBoundingClientRect').mockReturnValue(createRect({
      bottom: 240,
      height: 220,
      left: 100,
      right: 400,
      top: 20,
      width: 300
    }));
    shell.panel.setPointerCapture = vi.fn();
    shell.panel.releasePointerCapture = vi.fn();

    const down = createPointerEvent('pointerdown', {
      clientX: 150,
      clientY: 80,
      pointerId: 7
    });
    const preventDefault = vi.spyOn(down, 'preventDefault');
    shell.header.dispatchEvent(down);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(shell.panel.classList.contains('ytcq-chess-panel-dragging')).toBe(true);
    expect(shell.panel.style.left).toBe('100px');
    expect(shell.panel.style.top).toBe('20px');
    expect(shell.panel.style.right).toBe('auto');
    expect(shell.panel.style.bottom).toBe('auto');
    expect(shell.panel.setPointerCapture).toHaveBeenCalledWith(7);

    document.dispatchEvent(createPointerEvent('pointermove', {
      clientX: 2_000,
      clientY: -100,
      pointerId: 7
    }));
    expect(shell.panel.style.left).toBe('492px');
    expect(shell.panel.style.top).toBe('8px');

    document.dispatchEvent(createPointerEvent('pointerup', {
      clientX: 2_000,
      clientY: -100,
      pointerId: 7
    }));
    expect(shell.panel.classList.contains('ytcq-chess-panel-dragging')).toBe(false);
    expect(shell.panel.releasePointerCapture).toHaveBeenCalledWith(7);

    document.dispatchEvent(createPointerEvent('pointermove', {
      clientX: 300,
      clientY: 300,
      pointerId: 7
    }));
    expect(shell.panel.style.left).toBe('492px');
    expect(shell.panel.style.top).toBe('8px');
  });

  it('ignores drag starts from header buttons and handles narrow viewports', () => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 100
    });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 100
    });
    const controller = new AbortController();
    const shell = createGamePanelShell({
      ariaLabel: 'Replay Trivia panel',
      classNamePrefix: 'ytcq-replay-trivia',
      closeLabel: 'Close',
      icon: document.createElement('span'),
      onClose: vi.fn(),
      signal: controller.signal,
      subtitle: '',
      title: 'Replay Trivia'
    });
    vi.spyOn(shell.panel, 'getBoundingClientRect').mockReturnValue(createRect({
      bottom: 120,
      height: 160,
      left: 0,
      right: 160,
      top: 0,
      width: 160
    }));

    shell.closeButton.dispatchEvent(createPointerEvent('pointerdown', {
      clientX: 20,
      clientY: 20,
      pointerId: 1
    }));
    expect(shell.panel.classList.contains('ytcq-replay-trivia-panel-dragging')).toBe(false);

    shell.header.dispatchEvent(createPointerEvent('pointerdown', {
      clientX: 20,
      clientY: 20,
      pointerId: 1
    }));
    document.dispatchEvent(createPointerEvent('pointermove', {
      clientX: -1_000,
      clientY: -1_000,
      pointerId: 1
    }));

    expect(shell.panel.style.left).toBe('8px');
    expect(shell.panel.style.top).toBe('8px');
  });
});

function createRect(overrides: Partial<DOMRect>): DOMRect {
  return {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: overrides.left ?? 0,
    y: overrides.top ?? 0,
    toJSON: () => ({}),
    ...overrides
  } as DOMRect;
}

function createPointerEvent(type: string, options: {
  clientX: number;
  clientY: number;
  pointerId: number;
}): Event {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true
  });
  Object.defineProperties(event, {
    clientX: { value: options.clientX },
    clientY: { value: options.clientY },
    pointerId: { value: options.pointerId }
  });
  return event;
}
