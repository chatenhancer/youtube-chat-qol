import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleFeatureMutations } from '../../content/dispatcher';
import { DEFAULT_OPTIONS } from '../../shared/options';
import { setOptions } from '../../shared/state';

const soundMocks = vi.hoisted(() => ({ playAlertSoundPreview: vi.fn() }));
vi.mock('../../shared/sounds/alert-sounds', () => soundMocks);
vi.mock('../lite-mode/bootstrap', () => ({ isSupportedLiteModePage: () => true }));

import { configureSettingsMenu, refreshSettingsMenus } from './settings-menu';
import { cleanupSettingsButton, wireSettingsButton } from './settings-button';

describe('dedicated chat settings menu', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    soundMocks.playAlertSoundPreview.mockClear();
    setOptions({ ...DEFAULT_OPTIONS });
    configureSettingsMenu(vi.fn());
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanupSettingsButton();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('opens the quick settings directly from one outline-logo button', () => {
    const { button, menu } = openMenu();
    expect(button.title).toBe('Chat Enhancer');
    expect(button.querySelector('svg [fill="none"]')).not.toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(menu.getAttribute('role')).toBe('menu');
    expect(menu.querySelector('[data-ytcq-action="settings-back"]')).toBeNull();
    const items = menu.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]');
    expect(Array.from(items, item => item.getAttribute('data-ytcq-setting')))
      .toEqual(['targetLanguage', 'sound', 'liteModeEnabled']);
    expect(Array.from(items, item => item.textContent)).toEqual(['Translate', 'Alert sounds', 'Lite mode']);
    expect(document.activeElement).toBe(items[0]);
    expect(document.querySelector('ytd-menu-popup-renderer .ytcq-settings-item')).toBeNull();
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
    vi.advanceTimersByTime(600);
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

  it.each(['ltr', 'rtl'])('supports keyboard opening, navigation, Escape and Tab in %s', direction => {
    const { button, menu } = openMenu();
    button.style.direction = direction;
    const rows = menu.querySelectorAll<HTMLElement>('.ytcq-settings-item');
    key(rows[0], 'ArrowDown');
    expect(document.activeElement).toBe(rows[1]);
    key(rows[1], 'End');
    expect(document.activeElement).toBe(rows[2]);
    key(rows[2], 'Home');
    expect(document.activeElement).toBe(rows[0]);
    key(rows[0], 'ArrowUp');
    expect(document.activeElement).toBe(rows[2]);
    key(rows[2], 'Escape');
    expect(menu.isConnected).toBe(false);
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    key(button, 'ArrowUp');
    const reopened = document.querySelector<HTMLElement>('.ytcq-settings-menu')!;
    const last = reopened.querySelector<HTMLElement>('.ytcq-settings-item:last-child')!;
    expect(document.activeElement).toBe(last);
    key(last, 'Tab');
    expect(reopened.isConnected).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it('closes on the trigger, outside clicks and focus moving outside', () => {
    const { button, menu } = openMenu();
    button.click();
    expect(menu.isConnected).toBe(false);
    button.click();
    document.querySelector<HTMLButtonElement>('#native-menu-button')!.click();
    expect(document.querySelector('.ytcq-settings-menu')).toBeNull();
    button.click();
    document.querySelector<HTMLButtonElement>('#native-menu-button')!.focus();
    expect(document.querySelector('.ytcq-settings-menu')).toBeNull();
  });

  it('does not duplicate buttons and rewires a replaced YouTube header', async () => {
    vi.useFakeTimers();
    const { button, menu } = openMenu();
    wireSettingsButton();
    expect(document.querySelectorAll('.ytcq-settings-button')).toHaveLength(1);
    expect(document.querySelector('.ytcq-settings-button')).toBe(button);
    const header = document.querySelector('yt-live-chat-header-renderer')!;
    const replacement = header.cloneNode(false) as HTMLElement;
    header.replaceWith(replacement);
    handleFeatureMutations({ addedElements: [replacement], mutations: [] });
    await vi.runAllTimersAsync();
    expect(menu.isConnected).toBe(false);
    expect(replacement.querySelectorAll('.ytcq-settings-button')).toHaveLength(1);
    expect(replacement.querySelector('.ytcq-settings-button')).not.toBe(button);
  });

  it('removes old injected submenu rows on reload while preserving native rows', () => {
    openMenu();
    const nativeMenu = document.querySelector('ytd-menu-popup-renderer')!;
    nativeMenu.className = 'ytcq-settings-expanded-menu ytcq-settings-submenu-open';
    nativeMenu.innerHTML = '<div id="items"><yt-live-chat-toggle-renderer></yt-live-chat-toggle-renderer><div class="ytcq-settings-item"></div></div>';
    cleanupSettingsButton();
    expect(nativeMenu.querySelector('yt-live-chat-toggle-renderer')).not.toBeNull();
    expect(nativeMenu.className).toBe('');
    expect(document.querySelectorAll('.ytcq-settings-button, .ytcq-settings-menu, .ytcq-settings-item')).toHaveLength(0);
  });
});

function openMenu(): { button: HTMLButtonElement; menu: HTMLElement } {
  document.body.innerHTML = '<yt-live-chat-header-renderer><div id="live-chat-header-context-menu">'
    + '<button id="native-menu-button">More options</button></div></yt-live-chat-header-renderer>'
    + '<ytd-menu-popup-renderer><div id="items"><yt-live-chat-toggle-renderer></yt-live-chat-toggle-renderer></div></ytd-menu-popup-renderer>';
  wireSettingsButton();
  const button = document.querySelector<HTMLButtonElement>('.ytcq-settings-button')!;
  button.click();
  return { button, menu: document.querySelector<HTMLElement>('.ytcq-settings-menu')! };
}

function key(element: HTMLElement, value: string): void {
  element.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
}
