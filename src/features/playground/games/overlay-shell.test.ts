import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGameOverlayShell } from './overlay-shell';

describe('game overlay shell', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('creates a reusable overlay header and wires close actions', () => {
    const controller = new AbortController();
    const onClose = vi.fn();
    const shell = createGameOverlayShell({
      ariaLabel: 'Stick Around overlay',
      classNamePrefix: 'ytcq-stick-around',
      closeLabel: 'Hide',
      icon: document.createElement('span'),
      onClose,
      signal: controller.signal,
      subtitle: 'Live',
      title: 'Stick Around!'
    });

    expect(shell.root.parentElement).toBeNull();
    expect(shell.root.classList.contains('ytcq-game-overlay')).toBe(true);
    expect(shell.header.classList.contains('ytcq-game-overlay-header')).toBe(true);
    expect(shell.titleElement.textContent).toBe('Stick Around!');
    expect(shell.subtitleElement.textContent).toBe('Live');
    expect(shell.closeButton.getAttribute('aria-label')).toBe('Hide');
    expect(shell.closeButton.parentElement).toBe(shell.actions);
    expect(shell.statusOverlay.element.parentElement).toBe(shell.body);
    expect(shell.statusOverlay.element.className).toContain('ytcq-stick-around-status');
    expect(shell.statusOverlay.element.hidden).toBe(true);

    shell.closeButton.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalledTimes(2);

    controller.abort();
    shell.closeButton.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
