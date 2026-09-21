import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatThemeController } from './controller';
import * as appearance from './appearance';
import { APPLIED_CUSTOM_THEME_KEY, CUSTOM_THEMES_KEY, createCustomTheme } from '../../shared/custom-themes';
import aeroPreset from '../../assets/themes/aero.json';

describe('applied chat themes', () => {
  let controller: ReturnType<typeof createChatThemeController>;
  beforeEach(async () => {
    await chrome.storage.local.clear();
    document.documentElement.removeAttribute('dark');
    document.documentElement.removeAttribute('data-ytcq-chat-skin');
    vi.clearAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(aeroPreset)));
  });
  afterEach(() => {
    controller?.dispose();
    vi.restoreAllMocks();
  });

  it('renders preinstalled Aero through the stored custom theme without preview connections', async () => {
    controller = createChatThemeController();
    controller.apply('custom:aero');
    await vi.waitFor(() => expect(document.documentElement.dataset.ytcqChatSkin).toBe('custom'));
    expect(document.getElementById('ytcq-custom-theme-values')?.textContent).toContain('--ytcq-theme-header-background');
    expect(chrome.runtime.onConnect.addListener).not.toHaveBeenCalled();
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  it('uses the applied snapshot and ignores saved edits until they are applied', async () => {
    const derive = vi.spyOn(appearance, 'themeAppearance');
    const applied = { ...createCustomTheme(), name: 'Saved' };
    await chrome.storage.local.set({ [APPLIED_CUSTOM_THEME_KEY]: applied });
    controller = createChatThemeController();
    controller.apply(`custom:${applied.id}`);
    await vi.waitFor(() => expect(document.getElementById('ytcq-custom-theme-values')).not.toBeNull());
    const calculations = derive.mock.calls.length;
    controller.apply(`custom:${applied.id}`);
    controller.apply(`custom:${applied.id}`);
    expect(derive).toHaveBeenCalledTimes(calculations);
    const draft = structuredClone(applied);
    draft.surfaces.header.fill = 'solid';
    draft.surfaces.header.color = '#fa1234';
    const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls.at(-1)![0];
    listener({ [CUSTOM_THEMES_KEY]: { newValue: [draft] } }, 'local');
    expect(document.getElementById('ytcq-custom-theme-values')?.textContent).not.toContain('#fa1234');
    listener({ [APPLIED_CUSTOM_THEME_KEY]: { newValue: draft } }, 'local');
    expect(document.getElementById('ytcq-custom-theme-values')?.textContent).toContain('#fa1234');
    document.documentElement.setAttribute('dark', '');
    controller.apply(`custom:${applied.id}`);
    expect(document.documentElement.dataset.ytcqChatSkinTheme).toBe('dark');
    const afterDark = derive.mock.calls.length;
    document.documentElement.removeAttribute('dark');
    controller.apply(`custom:${applied.id}`);
    expect(document.documentElement.dataset.ytcqChatSkinTheme).toBe('light');
    expect(document.getElementById('ytcq-custom-theme-values')?.textContent).toContain('#fa1234');
    expect(derive).toHaveBeenCalledTimes(afterDark);
    controller.reset();
    expect(document.getElementById('ytcq-custom-theme-values')).toBeNull();
  });

  it('falls back when a synced selection has no local theme and removes stale CSS', () => {
    document.body.innerHTML = '<style id="ytcq-custom-theme-values">stale</style>';
    controller = createChatThemeController();
    controller.apply('custom:missing');
    expect(document.documentElement.hasAttribute('data-ytcq-chat-skin')).toBe(false);
    expect(document.getElementById('ytcq-custom-theme-values')).toBeNull();
  });
});
