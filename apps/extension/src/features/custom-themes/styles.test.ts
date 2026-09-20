import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCustomTheme } from '../../shared/custom-themes';
import * as appearance from './appearance';
import * as images from './image-color';
import { createThemeStyleCache } from './styles';

afterEach(() => vi.restoreAllMocks());

describe('theme style cache', () => {
  it('derives each appearance once and reuses it across repeated renders and mode switches', () => {
    const derive = vi.spyOn(appearance, 'themeAppearance');
    const styles = createThemeStyleCache();
    const theme = createCustomTheme();
    const light = styles(theme, 'light');
    expect(light).toContain('--ytcq-theme-chat-color:#ffffff');
    expect(derive).toHaveBeenCalledTimes(1);
    expect(styles(theme, 'light')).toBe(light);
    const dark = styles(theme, 'dark');
    expect(dark).toContain('--ytcq-theme-chat-color:#0f0f0f');
    for (let index = 0; index < 5; index++) {
      expect(styles(theme, 'light')).toBe(light);
      expect(styles(theme, 'dark')).toBe(dark);
    }
    expect(derive).toHaveBeenCalledTimes(2);
  });

  it('replaces both cached appearances when an edited snapshot arrives with the same theme ID', () => {
    const derive = vi.spyOn(appearance, 'themeAppearance');
    const styles = createThemeStyleCache();
    const theme = createCustomTheme();
    styles(theme, 'light');
    styles(theme, 'dark');
    const edited = { ...theme, accent: '#000000' };
    for (const mode of ['light', 'dark'] as const) {
      expect(styles(edited, mode)).toContain('--ytcq-theme-accent:#000000');
    }
    expect(derive).toHaveBeenCalledTimes(4);
    // Only the current snapshot is retained, including when the user returns to an older theme.
    expect(styles(theme, 'light')).toContain('--ytcq-theme-accent:#3ea6ff');
    expect(derive).toHaveBeenCalledTimes(5);
  });

  it('samples an image once, refreshes its text, and reuses the sample through edits and mode switches', async () => {
    const sample = vi.spyOn(images, 'readThemeImageColor').mockResolvedValue({ color: '#000000', opacity: 1 });
    const ready = vi.fn();
    const styles = createThemeStyleCache(ready);
    const theme = createCustomTheme();
    for (const surface of Object.values(theme.surfaces)) {
      surface.fill = 'image';
      surface.image = 'same-image';
    }
    styles(theme, 'light');
    await vi.waitFor(() => expect(ready).toHaveBeenCalledOnce());
    expect(styles(theme, 'light')).toContain('--ytcq-theme-header-text:#f1f1f1');
    styles(theme, 'dark');
    styles({ ...theme, accent: '#ff0000' }, 'light');
    expect(sample).toHaveBeenCalledOnce();
    expect(ready).toHaveBeenCalledOnce();
  });

  it('ignores an image that finishes loading after its theme was replaced', async () => {
    let finish!: (sample: images.ThemeImageColor) => void;
    vi.spyOn(images, 'readThemeImageColor').mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const ready = vi.fn();
    const styles = createThemeStyleCache(ready);
    const theme = createCustomTheme();
    theme.surfaces.header.image = 'old-image';
    styles(theme, 'light');
    const replacement = createCustomTheme();
    const expected = styles(replacement, 'light');
    finish({ color: '#000000', opacity: 1 });
    await Promise.resolve();
    expect(ready).not.toHaveBeenCalled();
    expect(styles(replacement, 'light')).toBe(expected);
  });
});
