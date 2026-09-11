import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../../shared/options';
import { setOptions } from '../../shared/state';
import { handleSettingsSubmenuKeyDown } from './settings-submenu';

const soundMocks = vi.hoisted(() => ({
  playAlertSoundPreview: vi.fn()
}));

vi.mock('../../shared/sounds/alert-sounds', () => soundMocks);
vi.mock('../lite-mode/bootstrap', () => ({ isSupportedLiteModePage: () => true }));

import {
  cleanupStaleSettingsMenuSurfaces,
  configureSettingsMenu,
  enhanceSettingsMenu,
  refreshSettingsMenus
} from './settings-menu';

describe('chat settings menu integration', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    soundMocks.playAlertSoundPreview.mockClear();
    setOptions({ ...DEFAULT_OPTIONS });
    vi.useRealTimers();
    window.addEventListener('keydown', handleSettingsSubmenuKeyDown, { capture: true });
  });

  afterEach(() => {
    window.removeEventListener('keydown', handleSettingsSubmenuKeyDown, { capture: true });
    cleanupStaleSettingsMenuSurfaces();
    vi.restoreAllMocks();
  });

  it('groups quick settings under one Chat Enhancer entry', () => {
    const saveOptions = vi.fn();
    const menu = createSettingsMenu();
    document.body.append(menu);
    configureSettingsMenu(saveOptions);

    enhanceSettingsMenu(menu);
    const entry = menu.querySelector<HTMLElement>('[data-ytcq-action="chat-enhancer"]')!;
    expect(entry.textContent).toBe('Chat Enhancer');
    expect(entry.getAttribute('aria-expanded')).toBe('false');
    entry.click();
    expect(entry.getAttribute('aria-expanded')).toBe('true');
    const items = menu.querySelectorAll<HTMLElement>('[data-ytcq-setting]');

    expect(items).toHaveLength(3);
    expect(items[0].getAttribute('data-ytcq-setting')).toBe('targetLanguage');
    expect(items[0].querySelector('.ytcq-menu-label')?.textContent).toBe('Translate');
    expect(items[0].getAttribute('aria-checked')).toBe('false');
    expect(items[1].getAttribute('data-ytcq-setting')).toBe('sound');
    expect(items[1].querySelector('.ytcq-menu-label')?.textContent).toBe('Alert sounds');
    expect(items[1].getAttribute('aria-checked')).toBe('true');
    expect(items[2].getAttribute('data-ytcq-setting')).toBe('liteModeEnabled');
    expect(items[2].getAttribute('aria-checked')).toBe('false');
  });

  it('saves translation and sound changes from toggle clicks', () => {
    const saveOptions = vi.fn();
    const menu = createSettingsMenu();
    document.body.append(menu);
    configureSettingsMenu(saveOptions);
    setOptions({
      ...DEFAULT_OPTIONS,
      lastTranslationTarget: 'ja',
      sound: false
    });

    enhanceSettingsMenu(menu);
    menu.querySelector<HTMLElement>('[data-ytcq-action="chat-enhancer"]')!.click();
    const translateItem = menu.querySelector<HTMLElement>('[data-ytcq-setting="targetLanguage"]')!;
    const soundItem = menu.querySelector<HTMLElement>('[data-ytcq-setting="sound"]')!;
    translateItem.click();
    soundItem.click();

    expect(saveOptions).toHaveBeenNthCalledWith(1, {
      targetLanguage: 'ja',
      lastTranslationTarget: 'ja'
    });
    expect(saveOptions).toHaveBeenNthCalledWith(2, { sound: true });
    expect(soundMocks.playAlertSoundPreview).toHaveBeenCalledOnce();
  });

  it('disables sound without playing the preview', () => {
    const saveOptions = vi.fn();
    const menu = createSettingsMenu();
    document.body.append(menu);
    configureSettingsMenu(saveOptions);
    setOptions({
      ...DEFAULT_OPTIONS,
      sound: true
    });

    enhanceSettingsMenu(menu);
    menu.querySelector<HTMLElement>('[data-ytcq-action="chat-enhancer"]')!.click();
    menu.querySelector<HTMLElement>('[data-ytcq-setting="sound"]')!.click();

    expect(saveOptions).toHaveBeenCalledWith({ sound: false });
    expect(soundMocks.playAlertSoundPreview).not.toHaveBeenCalled();
  });

  it('uses the existing Lite mode preference for both directions', () => {
    const saveOptions = vi.fn();
    const menu = createSettingsMenu();
    document.body.append(menu);
    configureSettingsMenu(saveOptions);
    enhanceSettingsMenu(menu);
    menu.querySelector<HTMLElement>('[data-ytcq-action="chat-enhancer"]')!.click();
    const item = menu.querySelector<HTMLElement>('[data-ytcq-setting="liteModeEnabled"]')!;
    item.click();
    expect(saveOptions).toHaveBeenLastCalledWith({ liteModeEnabled: true });
    setOptions({ ...DEFAULT_OPTIONS, liteModeEnabled: true });
    refreshSettingsMenus();
    expect(item.getAttribute('aria-checked')).toBe('true');
    item.click();
    expect(saveOptions).toHaveBeenLastCalledWith({ liteModeEnabled: false });
  });

  it('disables translation from its menu toggle', () => {
    const saveOptions = vi.fn();
    const menu = createSettingsMenu();
    document.body.append(menu);
    configureSettingsMenu(saveOptions);
    setOptions({
      ...DEFAULT_OPTIONS,
      targetLanguage: 'ja',
      lastTranslationTarget: 'ja'
    });

    enhanceSettingsMenu(menu);
    menu.querySelector<HTMLElement>('[data-ytcq-action="chat-enhancer"]')!.click();
    menu.querySelector<HTMLElement>('[data-ytcq-setting="targetLanguage"]')!.click();

    expect(saveOptions).toHaveBeenCalledWith({
      targetLanguage: ''
    });
  });

  it('refreshes existing menu labels and checked state from current options', () => {
    const menu = createSettingsMenu();
    document.body.append(menu);
    enhanceSettingsMenu(menu);

    setOptions({
      ...DEFAULT_OPTIONS,
      targetLanguage: 'ko',
      sound: false
    });
    refreshSettingsMenus();

    expect(menu.querySelector('[data-ytcq-setting="targetLanguage"]')?.getAttribute('aria-checked')).toBe('true');
    expect(menu.querySelector('[data-ytcq-setting="sound"]')?.getAttribute('aria-checked')).toBe('false');
  });

  it('ignores malformed existing setting rows while refreshing', () => {
    const malformed = document.createElement('div');
    malformed.className = 'ytcq-settings-item';
    malformed.setAttribute('data-ytcq-setting', 'sound');
    const unknown = document.createElement('div');
    unknown.className = 'ytcq-settings-item';
    unknown.setAttribute('data-ytcq-setting', 'unknown');
    const label = document.createElement('span');
    label.className = 'ytcq-menu-label';
    label.textContent = 'Unknown setting';
    unknown.append(label);
    document.body.append(malformed);
    document.body.append(unknown);

    expect(() => refreshSettingsMenus()).not.toThrow();
    expect(label.textContent).toBe('Unknown setting');
  });

  it('does not duplicate controls and can clean them up', () => {
    const menu = createSettingsMenu();
    document.body.append(menu);

    enhanceSettingsMenu(menu);
    enhanceSettingsMenu(menu);
    expect(menu.querySelectorAll('[data-ytcq-action="chat-enhancer"]')).toHaveLength(1);
    expect(menu.querySelectorAll('[data-ytcq-setting]')).toHaveLength(3);

    cleanupStaleSettingsMenuSurfaces();
    expect(menu.querySelectorAll('.ytcq-settings-item')).toHaveLength(0);
  });

  it.each(['ltr', 'rtl'])('supports keyboard navigation and preserves native rows in %s', (direction) => {
    const menu = createSettingsMenu();
    menu.style.direction = direction;
    document.body.append(menu);
    const native = menu.querySelector('yt-live-chat-toggle-renderer');
    enhanceSettingsMenu(menu);
    const entry = menu.querySelector<HTMLElement>('[data-ytcq-action="chat-enhancer"]')!;
    const translate = menu.querySelector<HTMLElement>('[data-ytcq-setting="targetLanguage"]')!;
    const sound = menu.querySelector<HTMLElement>('[data-ytcq-setting="sound"]')!;
    const key = (item: HTMLElement, value: string): void => {
      item.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
    };
    key(entry, direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight');
    expect(document.activeElement).toBe(translate.querySelector('.ytcq-paper-item'));
    key(translate, 'ArrowDown');
    expect(document.activeElement).toBe(sound.querySelector('.ytcq-paper-item'));
    const nativeEscape = vi.fn();
    menu.addEventListener('keydown', nativeEscape);
    key(sound, 'Escape');
    expect(nativeEscape).not.toHaveBeenCalled();
    expect(entry.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(entry.querySelector('.ytcq-paper-item'));
    expect(menu.querySelector('yt-live-chat-toggle-renderer')).toBe(native);
    entry.click();
    menu.querySelector<HTMLElement>('[data-ytcq-action="settings-back"]')!.click();
    expect(entry.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(entry.querySelector('.ytcq-paper-item'));
  });

  it('ignores menus without item lists or with existing extension controls', () => {
    const withoutItems = document.createElement('ytd-menu-popup-renderer');
    const withExistingItem = createSettingsMenu();
    withExistingItem.querySelector('#items')!.append(document.createElement('div'));
    withExistingItem.querySelector('#items div')!.className = 'ytcq-settings-item';

    enhanceSettingsMenu(withoutItems);
    enhanceSettingsMenu(withExistingItem);

    expect(withoutItems.querySelector('.ytcq-settings-item')).toBeNull();
    expect(withExistingItem.querySelectorAll('.ytcq-settings-item')).toHaveLength(1);
  });
});

function createSettingsMenu(): HTMLElement {
  const menu = document.createElement('ytd-menu-popup-renderer');
  menu.innerHTML = `
    <div id="items">
      <yt-live-chat-toggle-renderer></yt-live-chat-toggle-renderer>
    </div>
  `;
  return menu;
}
