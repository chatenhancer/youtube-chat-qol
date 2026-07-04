import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clampMenuToViewport,
  closeMenu,
  createMenuActionItem,
  createMenuToggleItem
} from './common';

describe('shared menu DOM helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('creates accessible action menu items that trigger by click and keyboard', () => {
    const onClick = vi.fn();
    const item = createMenuActionItem({
      action: 'quote',
      className: 'custom-menu-item',
      iconPath: 'M0 0h24v24H0z',
      label: 'Quote',
      onClick
    });

    expect(item.dataset.ytcqManaged).toBe('true');
    expect(item.getAttribute('role')).toBe('menuitem');
    expect(item.getAttribute('data-ytcq-action')).toBe('quote');
    expect(item.querySelector('.ytcq-menu-label')?.textContent).toBe('Quote');

    item.click();
    item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    item.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('keeps action item titles and ignores unrelated keyboard keys', () => {
    const onClick = vi.fn();
    const item = createMenuActionItem({
      action: 'mark-user',
      iconPath: 'M0 0h24v24H0z',
      label: 'Mark',
      onClick,
      title: 'Marked on stream'
    });

    expect(item.title).toBe('Marked on stream');
    expect(item.querySelector<HTMLElement>('.ytcq-paper-item')?.title).toBe('Marked on stream');

    item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('creates toggle menu items with checked state and toggle chrome', () => {
    const item = createMenuToggleItem({
      checked: true,
      iconPath: 'M0 0h24v24H0z',
      label: 'Alert sounds',
      onClick: vi.fn(),
      setting: 'sound'
    });

    expect(item.getAttribute('aria-checked')).toBe('true');
    expect(item.getAttribute('data-ytcq-setting')).toBe('sound');
    expect(item.querySelector('.ytcq-menu-toggle')).not.toBeNull();
  });

  it('closes YouTube menus through an Escape keyboard event', () => {
    const listener = vi.fn();
    document.addEventListener('keydown', listener);

    closeMenu();

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      key: 'Escape'
    }));
    document.removeEventListener('keydown', listener);
  });

  it('nudges overflowing menus back into the viewport', async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 200 });
    const menu = document.createElement('div');
    menu.style.left = '260px';
    vi.spyOn(menu, 'getBoundingClientRect').mockReturnValue(rect({
      left: 260,
      top: 170,
      width: 90,
      height: 80
    }));

    clampMenuToViewport(menu);
    await vi.runAllTimersAsync();

    expect(menu.style.left).toBe('222px');
    expect(menu.style.getPropertyValue('--ytcq-context-shift-y')).toBe('-58px');
  });

  it('nudges menus away from the top and left viewport edges', async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 200 });
    const menu = document.createElement('div');
    vi.spyOn(menu, 'getBoundingClientRect').mockReturnValue(rect({
      left: -20,
      top: -10,
      width: 90,
      height: 80
    }));

    clampMenuToViewport(menu);
    await vi.runAllTimersAsync();

    expect(menu.style.left).toBe('8px');
    expect(menu.style.getPropertyValue('--ytcq-context-shift-y')).toBe('18px');
  });
});

function rect({
  left,
  top,
  width,
  height
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({})
  } as DOMRect;
}
