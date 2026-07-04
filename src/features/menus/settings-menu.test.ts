import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../../shared/options';
import { setOptions } from '../../shared/state';

const soundMocks = vi.hoisted(() => ({
  playAlertSoundPreview: vi.fn()
}));

vi.mock('../../shared/sounds/alert-sounds', () => soundMocks);

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
  });

  afterEach(() => {
    cleanupStaleSettingsMenuSurfaces();
    vi.restoreAllMocks();
  });

  it('adds translation and alert sound toggles to the native chat settings menu', () => {
    const saveOptions = vi.fn();
    const menu = createSettingsMenu();
    document.body.append(menu);
    configureSettingsMenu(saveOptions);

    enhanceSettingsMenu(menu);
    const items = menu.querySelectorAll<HTMLElement>('.ytcq-settings-item');

    expect(items).toHaveLength(2);
    expect(items[0].getAttribute('data-ytcq-setting')).toBe('targetLanguage');
    expect(items[0].querySelector('.ytcq-menu-label')?.textContent).toBe('Translate');
    expect(items[0].getAttribute('aria-checked')).toBe('false');
    expect(items[1].getAttribute('data-ytcq-setting')).toBe('sound');
    expect(items[1].querySelector('.ytcq-menu-label')?.textContent).toBe('Alert sounds');
    expect(items[1].getAttribute('aria-checked')).toBe('true');
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

  it('saves sound being disabled without starting the enable animation', () => {
    const saveOptions = vi.fn();
    const menu = createSettingsMenu();
    document.body.append(menu);
    configureSettingsMenu(saveOptions);
    setOptions({
      ...DEFAULT_OPTIONS,
      sound: true
    });

    enhanceSettingsMenu(menu);
    const soundIcon = menu.querySelector<HTMLElement>('[data-ytcq-setting="sound"] .ytcq-menu-icon')!;
    const readLayout = vi.spyOn(soundIcon, 'getBoundingClientRect');
    menu.querySelector<HTMLElement>('[data-ytcq-setting="sound"]')!.click();

    expect(saveOptions).toHaveBeenCalledWith({ sound: false });
    expect(soundMocks.playAlertSoundPreview).not.toHaveBeenCalled();
    expect(readLayout).not.toHaveBeenCalled();
  });

  it('saves translation being disabled without starting the enable animation', () => {
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
    const translateIcon = menu.querySelector<HTMLElement>('[data-ytcq-setting="targetLanguage"] .ytcq-translate-menu-icon')!;
    const readLayout = vi.spyOn(translateIcon, 'getBoundingClientRect');
    menu.querySelector<HTMLElement>('[data-ytcq-setting="targetLanguage"]')!.click();

    expect(saveOptions).toHaveBeenCalledWith({
      targetLanguage: ''
    });
    expect(readLayout).not.toHaveBeenCalled();
  });

  it('removes menu icon animation classes after the animation window', async () => {
    vi.useFakeTimers();
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
    const translateIcon = menu.querySelector<HTMLElement>('[data-ytcq-setting="targetLanguage"] .ytcq-translate-menu-icon')!;
    const soundIcon = menu.querySelector<HTMLElement>('[data-ytcq-setting="sound"] .ytcq-menu-icon')!;

    menu.querySelector<HTMLElement>('[data-ytcq-setting="targetLanguage"]')!.click();
    menu.querySelector<HTMLElement>('[data-ytcq-setting="sound"]')!.click();
    expect(translateIcon.classList.contains('ytcq-translation-pulse')).toBe(true);
    expect(soundIcon.classList.contains('ytcq-bell-ringing')).toBe(true);

    await vi.advanceTimersByTimeAsync(900);

    expect(translateIcon.classList.contains('ytcq-translation-pulse')).toBe(false);
    expect(soundIcon.classList.contains('ytcq-bell-ringing')).toBe(false);
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
    expect(menu.querySelectorAll('.ytcq-settings-item')).toHaveLength(2);

    cleanupStaleSettingsMenuSurfaces();
    expect(menu.querySelectorAll('.ytcq-settings-item')).toHaveLength(0);
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
