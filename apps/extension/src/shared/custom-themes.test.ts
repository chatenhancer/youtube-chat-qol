import { beforeEach, describe, expect, it, vi } from 'vitest';
import aeroPreset from '../assets/themes/aero.json';
import { normalizeOptions } from './options';
import {
  APPLIED_CUSTOM_THEME_KEY, CUSTOM_THEMES_KEY, MAX_THEME_GIF_BYTES, MAX_THEME_IMAGE_LENGTH, applyCustomTheme, createCustomTheme,
  deleteCustomTheme, loadCustomThemes, normalizeCustomTheme, normalizeCustomThemes,
  normalizeThemeImage, saveCustomTheme, selectedTheme, selectedThemeId
} from './custom-themes';

describe('custom themes', () => {
  beforeEach(async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(aeroPreset)));
    await chrome.storage.local.clear();
    await chrome.storage.sync.clear();
  });

  it('preserves built-in selections and validates custom IDs', () => {
    for (const chatSkin of ['system', 'custom:aero', 'custom:theme-1']) {
      expect(normalizeOptions({ chatSkin }).chatSkin).toBe(chatSkin);
    }
    expect(normalizeOptions({ chatSkin: 'custom:bad"]{}' }).chatSkin).toBe('system');
  });

  it('keeps Aero selected after upgrading without rewriting existing preferences', async () => {
    const options = { chatSkin: 'aero', sound: false, targetLanguage: 'ja' };
    await chrome.storage.sync.set(options);
    const [aero] = await loadCustomThemes();
    expect(normalizeOptions(options)).toMatchObject({ ...options, chatSkin: 'custom:aero' });
    expect(selectedThemeId(options.chatSkin)).toBe(aero.id);
    expect(selectedTheme(options.chatSkin, null, aero)).toEqual(aero);
    expect(selectedTheme('custom:aero', null, aero)).toEqual(aero);
    expect(await chrome.storage.sync.get(null)).toEqual(options);
  });

  it('retains one bundled font for the whole theme', async () => {
    const theme = { ...createCustomTheme(), name: 'Shared font' };
    theme.font = 'playful';
    await saveCustomTheme(theme);
    expect((await loadCustomThemes()).find(item => item.id === theme.id)).toEqual(theme);
    const malformed = { ...theme, font: 'https://example.com/font.ttf' };
    expect(normalizeCustomTheme(malformed)?.font).toBe('default');
  });

  it('normalizes malformed fields and excludes external images and executable formats', () => {
    const theme = createCustomTheme();
    theme.radius = Infinity;
    theme.shadow = 1000;
    theme.accent = 'red; background: url(https://example.com)';
    theme.surfaces.header.image = 'https://example.com/image.png';
    theme.surfaces.chat.image = 'data:image/svg+xml;base64,PHN2Zz4=';
    theme.surfaces.chat.darkImage = 'data:image/svg+xml;base64,PHN2Zz4=';
    const result = normalizeCustomTheme(theme)!;
    expect(result.radius).toBe(12);
    expect(normalizeCustomTheme({ ...theme, finish: 'glass' })?.radius).toBe(4);
    expect(normalizeCustomTheme({ ...theme, finish: 'glass', radius: 9 })?.radius).toBe(9);
    expect(result.shadow).toBe(100);
    expect(result.accent).toBe('#3ea6ff');
    expect(result.surfaces.header.image).toBe('');
    expect(result.surfaces.chat.image).toBe('');
    expect(result.surfaces.chat.darkImage).toBe('');
    expect(normalizeCustomTheme({ ...theme, version: 2 })).toBeNull();
    expect(normalizeCustomTheme(null)).toBeNull();
  });

  it('saves edits separately from the applied snapshot', async () => {
    const theme = createCustomTheme();
    theme.name = 'Ocean';
    await saveCustomTheme(theme);
    expect(await chrome.storage.sync.get('chatSkin')).toEqual({});
    await applyCustomTheme(theme);
    const oldColor = theme.surfaces.header.color;
    // Simulate crossing the browser storage serialization boundary.
    const edited = structuredClone(theme);
    edited.surfaces.header.color = '#0088aa';
    await saveCustomTheme(edited);
    expect((await loadCustomThemes()).find(item => item.id === theme.id)?.surfaces.header.color).toBe('#0088aa');
    const applied = (await chrome.storage.local.get(APPLIED_CUSTOM_THEME_KEY))[APPLIED_CUSTOM_THEME_KEY];
    expect(applied.surfaces.header.color).toBe(oldColor);
  });

  it('preserves GIF data in saved and applied backgrounds and avatar frames', async () => {
    const image = 'data:image/gif;base64,R0lGODlhAQABAIAAACAwRGBAYCH/C05FVFNDQVBFMi4wAwEAAAAh+QQAMgAAACwAAAAAAQABAAACAkQBACH5BAAyAAAALAAAAAABAAEAAAICTAEAOw==';
    const theme = { ...createCustomTheme(), name: 'Animated', avatarFrame: image };
    for (const surface of Object.values(theme.surfaces)) {
      surface.fill = 'image';
      surface.image = surface.darkImage = image;
    }
    await saveCustomTheme(theme);
    await applyCustomTheme(theme);
    expect((await loadCustomThemes()).find(item => item.id === theme.id)).toEqual(theme);
    expect((await chrome.storage.local.get(APPLIED_CUSTOM_THEME_KEY))[APPLIED_CUSTOM_THEME_KEY]).toEqual(theme);
  });

  it('allows larger GIFs while retaining the static-image limit and bounding animated data', () => {
    const payload = 'A'.repeat(MAX_THEME_IMAGE_LENGTH);
    expect(normalizeThemeImage(`data:image/gif;base64,${payload}`)).toBe(`data:image/gif;base64,${payload}`);
    expect(normalizeThemeImage(`data:image/png;base64,${payload}`)).toBe('');
    expect(normalizeThemeImage(`data:image/gif;base64,${'A'.repeat(Math.ceil(MAX_THEME_GIF_BYTES / 3) * 4 + 4)}`)).toBe('');
  });

  it('deletes an applied theme and keeps other themes', async () => {
    const first = { ...createCustomTheme(), name: 'First' };
    const second = { ...createCustomTheme(), name: 'Second' };
    await saveCustomTheme(first);
    await saveCustomTheme(second);
    await applyCustomTheme(first);
    await deleteCustomTheme(first.id);
    expect(await chrome.storage.sync.get('chatSkin')).toEqual({ chatSkin: 'system' });
    expect(await chrome.storage.local.get(APPLIED_CUSTOM_THEME_KEY)).toEqual({});
    expect((await loadCustomThemes()).map(theme => theme.id)).toEqual(['aero', second.id]);
    expect(normalizeCustomThemes([second, second, {}, null])).toHaveLength(1);
    expect((await chrome.storage.local.get(CUSTOM_THEMES_KEY))[CUSTOM_THEMES_KEY]).toHaveLength(2);
  });

  it('installs Aero locally once, protects it, and saves editable copies under new names', async () => {
    const [aero] = await loadCustomThemes();
    expect(fetch).toHaveBeenCalledWith('chrome-extension://test/themes/aero.json');
    expect(aero).toEqual(normalizeCustomTheme(aeroPreset));
    expect(aero.id).toBe('aero');
    expect((await chrome.storage.local.get(CUSTOM_THEMES_KEY))[CUSTOM_THEMES_KEY]).toEqual([aero]);
    expect(await loadCustomThemes()).toEqual([aero]);
    await expect(deleteCustomTheme(aero.id)).rejects.toThrow('cannot be deleted');
    await expect(saveCustomTheme({ ...aero, name: 'Changed' })).rejects.toThrow('copy');
    const copy = { ...structuredClone(aero), id: crypto.randomUUID() };
    expect(copy.surfaceTint).toBe(100);
    await expect(saveCustomTheme(copy)).rejects.toThrow('new name');
    copy.name = 'My sky';
    copy.accent = '#fa1234';
    copy.surfaceTint = 50;
    await saveCustomTheme(copy);
    expect((await loadCustomThemes()).find(theme => theme.id === 'aero')).toEqual(aero);
    expect((await loadCustomThemes()).find(theme => theme.id === copy.id)).toEqual(copy);
    expect(await chrome.storage.sync.get('chatSkin')).toEqual({});
  });

  it.each([
    ['missing', () => new Response('', { status: 404 })],
    ['invalid', () => new Response('{}')]
  ])('preserves stored themes and selections when the bundled preset is %s', async (_state, response) => {
    const theme = { ...createCustomTheme(), name: 'Saved theme' };
    const local = { [CUSTOM_THEMES_KEY]: [theme], [APPLIED_CUSTOM_THEME_KEY]: theme };
    const sync = { chatSkin: `custom:${theme.id}` };
    await chrome.storage.local.set(local);
    await chrome.storage.sync.set(sync);
    vi.mocked(fetch).mockImplementation(async () => response());

    await expect(loadCustomThemes()).rejects.toThrow('Aero theme');
    expect(await chrome.storage.local.get(null)).toEqual(local);
    expect(await chrome.storage.sync.get(null)).toEqual(sync);
  });

  it('validates image controls', () => {
    const theme = createCustomTheme();
    theme.surfaces.header.zoom = 500;
    theme.avatarFrame = 'https://example.com/frame.png';
    expect(normalizeCustomTheme(theme)?.surfaces.header.zoom).toBe(300);
    expect(normalizeCustomTheme(theme)?.avatarFrame).toBe('');
    theme.surfaces.header.imageText = 'light';
    expect(normalizeCustomTheme(theme)?.surfaces.header.imageText).toBe('light');
    const surface = { ...theme.surfaces.header, imageText: 'invalid' };
    expect(normalizeCustomTheme({ ...theme, surfaces: { header: surface } })?.surfaces.header.imageText).toBe('auto');
  });

  it('refreshes the preinstalled preset without changing saved copies or their applied snapshot', async () => {
    const [aero] = await loadCustomThemes();
    const copy = { ...structuredClone(aero), id: 'my-sky', name: 'My sky' };
    await saveCustomTheme(copy);
    await applyCustomTheme(copy);
    const outdated = { ...structuredClone(aero), radius: 18 };
    await chrome.storage.local.set({ [CUSTOM_THEMES_KEY]: [outdated, copy] });
    expect(await loadCustomThemes()).toEqual([aero, copy]);
    expect(await chrome.storage.local.get(APPLIED_CUSTOM_THEME_KEY)).toEqual({ [APPLIED_CUSTOM_THEME_KEY]: copy });
    expect(await chrome.storage.sync.get('chatSkin')).toEqual({ chatSkin: 'custom:my-sky' });
  });

  it('validates palette and surface controls', () => {
    const theme = createCustomTheme();
    theme.shine = -20;
    theme.accent = 'url(https://example.com)';
    theme.secondary = '#FF00AA';
    theme.surfaceTint = 120;
    theme.surfaces.header.surfaceOpacity = 200;
    theme.surfaces.header.positionX = -20;
    theme.surfaces.header.gradientAngle = 1000;
    const normalized = normalizeCustomTheme(theme)!;
    expect(normalized.shine).toBe(0);
    expect(normalized.accent).toBe('#3ea6ff');
    expect(normalized.secondary).toBe('#ff00aa');
    expect(normalized.surfaceTint).toBe(100);
    expect(normalized.surfaces.header).toMatchObject({ surfaceOpacity: 100, positionX: 0, gradientAngle: 360 });
  });
});
