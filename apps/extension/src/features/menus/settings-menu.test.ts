import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../../shared/options';
import { SETTING_ICON_ANIMATIONS } from '../../shared/setting-icon-animations';
import { setOptions } from '../../shared/state';
import * as pictureInPicture from '../picture-in-picture/bridge';

const soundMocks = vi.hoisted(() => ({ playAlertSoundPreview: vi.fn() }));
vi.mock('../../shared/sounds/alert-sounds', () => soundMocks);
vi.mock('../lite-mode/bootstrap', () => ({ isSupportedLiteModePage: () => true }));

import { handleSettingsGridBoundaryKeyDown } from './settings-grid';
import { cleanupStaleSettingsMenuSurfaces, configureSettingsMenu, enhanceSettingsMenu, refreshSettingsMenus } from './settings-menu';

describe('chat settings grid', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    soundMocks.playAlertSoundPreview.mockClear();
    setOptions({ ...DEFAULT_OPTIONS });
    configureSettingsMenu(vi.fn());
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanupStaleSettingsMenuSurfaces();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('appends one accessible control group while preserving native menu items', () => {
    const { menu } = openMenu();
    const native = menu.querySelector('yt-live-chat-toggle-renderer');
    enhanceSettingsMenu(menu);
    expect(menu.querySelector('yt-live-chat-toggle-renderer')).toBe(native);
    expect(menu.querySelectorAll('.ytcq-settings-grid')).toHaveLength(1);
    expect(menu.querySelector('.ytcq-settings-grid')?.getAttribute('role')).toBe('group');
    const items = menu.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]');
    expect(Array.from(items, item => item.getAttribute('data-ytcq-setting')))
      .toEqual(['targetLanguage', 'sound', 'liteModeEnabled']);
    expect(Array.from(items, item => item.textContent)).toEqual(['Translate', 'Alert sounds', 'Lite mode']);
    expect(menu.querySelector('.ytcq-menu-toggle, [role="option"]')).toBeNull();
    expect(document.querySelector('.ytcq-settings-button')).toBeNull();
  });

  it('saves the existing translation and sound preferences while staying open', () => {
    const saveOptions = vi.fn();
    configureSettingsMenu(saveOptions);
    setOptions({ ...DEFAULT_OPTIONS, lastTranslationTarget: 'ja', sound: false });
    const { menu } = openMenu();
    menu.querySelector<HTMLElement>('[data-ytcq-setting="targetLanguage"]')!.click();
    menu.querySelector<HTMLElement>('[data-ytcq-setting="sound"]')!.click();
    expect(saveOptions).toHaveBeenNthCalledWith(1, { targetLanguage: 'ja', lastTranslationTarget: 'ja' });
    expect(saveOptions).toHaveBeenNthCalledWith(2, { sound: true });
    expect(soundMocks.playAlertSoundPreview).toHaveBeenCalledOnce();
    expect(menu.isConnected).toBe(true);
  });

  it('fills the unavailable PiP slot with a disabled tile that cannot activate', () => {
    const toggle = vi.spyOn(pictureInPicture, 'togglePictureInPicture');
    const { menu } = openMenu();
    const item = menu.querySelector<HTMLElement>('[data-ytcq-action="picture-in-picture"]')!;

    expect(menu.querySelectorAll('.ytcq-settings-grid .ytcq-settings-item')).toHaveLength(4);
    expect(item.textContent).toBe('Floating player');
    expect(item.getAttribute('aria-disabled')).toBe('true');
    expect(item.title).toBe('Not available in this browser or chat window.');
    item.click();
    key(item, 'Enter');
    key(item, ' ');
    expect(toggle).not.toHaveBeenCalled();
  });

  it('keeps PiP usable when the current chat supports it', () => {
    vi.spyOn(pictureInPicture, 'canTogglePictureInPicture').mockReturnValue(true);
    const toggle = vi.spyOn(pictureInPicture, 'togglePictureInPicture').mockImplementation(() => {});
    const { menu } = openMenu();
    const item = menu.querySelector<HTMLElement>('[data-ytcq-action="picture-in-picture"]')!;

    expect(item.hasAttribute('aria-disabled')).toBe(false);
    expect(item.title).toBe('Open video and chat in an always-on-top window.');
    item.click();
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('disables sound without playing the preview', () => {
    const saveOptions = vi.fn();
    configureSettingsMenu(saveOptions);
    const { menu } = openMenu();
    menu.querySelector<HTMLElement>('[data-ytcq-setting="sound"]')!.click();
    expect(saveOptions).toHaveBeenCalledWith({ sound: false });
    expect(soundMocks.playAlertSoundPreview).not.toHaveBeenCalled();
  });

  it.each([false, true])('animates only when enabling Lite mode, respecting reduced motion (%s)', reducedMotion => {
    vi.useFakeTimers();
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: reducedMotion } as MediaQueryList);
    const saveOptions = vi.fn();
    configureSettingsMenu(saveOptions);
    const { menu } = openMenu();
    const item = menu.querySelector<HTMLElement>('[data-ytcq-setting="liteModeEnabled"]')!;
    const icon = item.querySelector('.lite-mode-icon')!;
    expect(icon.classList.contains('ytcq-bolt-redraw')).toBe(false);
    item.click();
    expect(icon.classList.contains('ytcq-bolt-redraw')).toBe(!reducedMotion);
    expect(saveOptions).toHaveBeenLastCalledWith({ liteModeEnabled: true });
    setOptions({ ...DEFAULT_OPTIONS, liteModeEnabled: true });
    refreshSettingsMenus();
    expect(item.getAttribute('aria-checked')).toBe('true');
    vi.advanceTimersByTime(SETTING_ICON_ANIMATIONS.liteMode.durationMs);
    expect(icon.classList.contains('ytcq-bolt-redraw')).toBe(false);
    item.click();
    expect(saveOptions).toHaveBeenLastCalledWith({ liteModeEnabled: false });
    expect(icon.classList.contains('ytcq-bolt-redraw')).toBe(false);
  });

  it('disables translation and refreshes open rows from saved options', () => {
    const saveOptions = vi.fn();
    configureSettingsMenu(saveOptions);
    setOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'ko' });
    const { menu } = openMenu();
    const translate = menu.querySelector<HTMLElement>('[data-ytcq-setting="targetLanguage"]')!;
    translate.click();
    expect(saveOptions).toHaveBeenCalledWith({ targetLanguage: '' });
    setOptions({ ...DEFAULT_OPTIONS, targetLanguage: '', sound: false });
    refreshSettingsMenus();
    expect(translate.getAttribute('aria-checked')).toBe('false');
    expect(menu.querySelector('[data-ytcq-setting="sound"]')?.getAttribute('aria-checked')).toBe('false');
  });

  it.each(['ltr', 'rtl'])('supports grid keyboard navigation and returning to native items in %s', direction => {
    const { menu } = openMenu();
    const grid = menu.querySelector<HTMLElement>('.ytcq-settings-grid')!;
    grid.style.direction = direction;
    const rows = menu.querySelectorAll<HTMLElement>('.ytcq-settings-item');
    grid.focus();
    expect(document.activeElement).toBe(rows[0]);
    key(rows[0], direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight');
    expect(document.activeElement).toBe(rows[1]);
    key(rows[1], 'Home');
    expect(document.activeElement).toBe(rows[0]);
    key(rows[0], 'ArrowDown');
    expect(document.activeElement).toBe(rows[2]);
    key(rows[2], 'ArrowUp');
    expect(document.activeElement).toBe(rows[0]);
    key(rows[0], 'End');
    expect(document.activeElement).toBe(rows[3]);
    key(rows[3], 'ArrowDown');
    expect(document.activeElement).toBe(menu.querySelector('yt-live-chat-toggle-renderer'));
    rows[0].focus();
    key(rows[0], 'ArrowUp');
    expect(document.activeElement).toBe(menu.querySelector('yt-live-chat-toggle-renderer'));
  });

  it('bridges native keyboard navigation into the group when YouTube skips appended items', () => {
    const { menu } = openMenu();
    menu.addEventListener('keydown', handleSettingsGridBoundaryKeyDown, { capture: true });
    const native = menu.querySelector<HTMLElement>('yt-live-chat-toggle-renderer')!;
    native.focus();
    key(native, 'ArrowDown');
    expect(document.activeElement).toBe(menu.querySelector('.ytcq-settings-item'));
    native.focus();
    key(native, 'ArrowUp');
    expect(document.activeElement).toBe(menu.querySelector('.ytcq-settings-item:last-child'));
  });

  it('removes old injected submenu rows on reload while preserving native rows', () => {
    openMenu();
    const nativeMenu = document.querySelector('ytd-menu-popup-renderer')!;
    nativeMenu.className = 'ytcq-settings-expanded-menu ytcq-settings-submenu-open';
    nativeMenu.innerHTML = '<div id="items"><yt-live-chat-toggle-renderer></yt-live-chat-toggle-renderer><div class="ytcq-settings-item"></div></div>';
    cleanupStaleSettingsMenuSurfaces();
    expect(nativeMenu.querySelector('yt-live-chat-toggle-renderer')).not.toBeNull();
    expect(nativeMenu.className).toBe('');
    expect(document.querySelectorAll('.ytcq-settings-button, .ytcq-settings-menu, .ytcq-settings-item')).toHaveLength(0);
  });
});

function openMenu(): { menu: HTMLElement } {
  document.body.innerHTML = '<yt-live-chat-header-renderer><div id="live-chat-header-context-menu">'
    + '<button id="native-menu-button">More options</button></div></yt-live-chat-header-renderer>'
    + '<ytd-menu-popup-renderer><div id="items"><yt-live-chat-toggle-renderer tabindex="-1"></yt-live-chat-toggle-renderer></div></ytd-menu-popup-renderer>';
  const menu = document.querySelector<HTMLElement>('ytd-menu-popup-renderer')!;
  enhanceSettingsMenu(menu);
  return { menu };
}

function key(element: HTMLElement, value: string): void {
  element.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
}
