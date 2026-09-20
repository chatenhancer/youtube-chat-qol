import { describe, expect, it } from 'vitest';
import { createCustomTheme, normalizeCustomTheme } from '../../shared/custom-themes';
import aeroPreset from '../../assets/themes/aero.json';
import { themeAppearance, luminance, mixColor, readableAccent } from './appearance';
import { customThemeDeclarations, customThemeFontFace, customThemePalette } from './styles';

describe('shared theme appearance', () => {
  it('uses Aero’s artwork with shared Glass panels in both modes, without a preset branch', () => {
    const aero = normalizeCustomTheme(aeroPreset)!;
    const light = themeAppearance(aero, 'light');
    const dark = themeAppearance({ ...aero, id: 'copy', name: 'Copy' }, 'dark');
    expect(light.surfaces.header.color).toBe('#087dbc');
    expect(light.surfaces.header.text).toBe('#ffffff');
    expect(dark.surfaces.header.text).toBe('#ffffff');
    expect(light.surfaces.composer.color).toBe('#e6f8fe');
    expect(dark.surfaces.header.color).toBe('#12659d');
    expect(dark.surfaces.composer.color).toBe('#173e5b');
    expect(light.surfaces.panels).toMatchObject({ color: '#f6fdff', gradientColor: '#cbeef9', text: '#143244' });
    expect(dark.surfaces.panels).toMatchObject({ color: '#102d44', gradientColor: '#174969', text: '#e8f5ff' });
    expect(dark.accent).toBe('#55cfff');
    expect(light.border).toBe('#c5c5c5');
    expect(dark.border).toBe('#3f3f3f');
    for (const area of ['header', 'chat', 'composer'] as const) {
      expect(aero.surfaces[area].fill).toBe('image');
      expect(light.surfaces[area].image).toMatch(/^data:image\//);
      expect(dark.surfaces[area].image).toBe(aero.surfaces[area].darkImage || light.surfaces[area].image);
    }
    for (const mode of ['light', 'dark'] as const) {
      expect(customThemeDeclarations({ ...aero, id: 'copy', name: 'Copy' }, mode))
        .toBe(customThemeDeclarations(aero, mode));
    }
    expect(aero.surfaces.chat.darkImage).toMatch(/^data:image\//);
    expect(aero.surfaces.chat.darkImage).not.toBe(aero.surfaces.chat.image);
  });

  it('starts with YouTube’s neutral surfaces and blue actions in every finish', () => {
    const theme = createCustomTheme();
    for (const mode of ['light', 'dark'] as const) {
      for (const finish of ['flat', 'glossy', 'glass'] as const) {
        const actual = themeAppearance({ ...theme, finish }, mode);
        expect(actual.accent).toBe('#3ea6ff');
        for (const area of ['header', 'chat', 'composer', 'panels'] as const) {
          expect(actual.surfaces[area]).toMatchObject({
            color: mode === 'dark' ? '#0f0f0f' : '#ffffff',
            gradientColor: mode === 'dark' ? '#0f0f0f' : '#ffffff',
            text: mode === 'dark' ? '#f1f1f1' : '#0f0f0f'
          });
        }
      }
    }
  });

  it.each([0, 50, 100])('keeps the base palette across finishes at %s percent tint', (surfaceTint) => {
    const theme = createCustomTheme();
    theme.surfaceTint = surfaceTint;
    for (const accent of ['#3ea6ff', '#bb2255', '#228855', '#808080']) {
      theme.accent = accent;
      for (const mode of ['light', 'dark'] as const) {
        const expected = themeAppearance(theme, mode);
        for (const finish of ['flat', 'glossy', 'glass'] as const) {
          const actual = themeAppearance({ ...theme, finish }, mode);
          expect(actual.accent).toBe(expected.accent);
          for (const area of ['header', 'chat', 'composer', 'panels'] as const) {
            const { color, gradientColor, text } = expected.surfaces[area];
            expect(actual.surfaces[area]).toMatchObject({ color, gradientColor, text });
          }
        }
      }
    }
  });

  it('keeps the base border consistent across finishes and neutral borders dark in dark mode', () => {
    const theme = createCustomTheme();
    expect(themeAppearance(theme, 'dark').border).toBe('#444444');
    for (const border of ['#d6d6d6', '#ffffff', '#000000', '#999999', '#73b9db', '#bb2255', '#735a84']) {
      theme.border = border;
      for (const mode of ['light', 'dark'] as const) {
        const base = themeAppearance(theme, mode).border;
        for (const finish of ['flat', 'glossy', 'glass'] as const) {
          expect(themeAppearance({ ...theme, finish }, mode).border).toBe(base);
        }
      }
    }
  });

  it('automatically shades one uploaded background in every area and finish for dark mode', () => {
    const theme = createCustomTheme();
    for (const area of ['header', 'chat', 'composer'] as const) {
      theme.surfaces[area].fill = 'image';
      theme.surfaces[area].image = 'data:image/png;base64,AAAA';
      theme.surfaces[area].opacity = 80;
    }
    for (const finish of ['flat', 'glossy', 'glass'] as const) {
      theme.finish = finish;
      const light = themeAppearance(theme, 'light');
      const dark = themeAppearance(theme, 'dark');
      for (const area of ['header', 'chat', 'composer'] as const) {
        expect(dark.surfaces[area].image).toBe(light.surfaces[area].image);
        expect(light.surfaces[area].opacity).toBe(80);
        expect(dark.surfaces[area].opacity).toBeLessThan(light.surfaces[area].opacity);
        expect(luminance(dark.surfaces[area].color)).toBeLessThan(.02);
        expect(luminance(dark.surfaces[area].text)).toBeGreaterThan(.8);
        expect(theme.surfaces[area].opacity).toBe(80);
      }
    }
  });

  it('uses an optional dark image at the chosen opacity and adapts the main image when removed', () => {
    const theme = createCustomTheme();
    for (const area of ['header', 'chat', 'composer'] as const) {
      const surface = theme.surfaces[area];
      surface.fill = 'image';
      surface.image = 'data:image/png;base64,AAAA';
      surface.darkImage = 'data:image/png;base64,BBBB';
      surface.opacity = 80;
      expect(themeAppearance(theme, 'light').surfaces[area]).toMatchObject({
        image: surface.image, opacity: 80
      });
      expect(themeAppearance(theme, 'dark').surfaces[area]).toMatchObject({
        image: surface.darkImage, opacity: 80
      });
      surface.darkImage = '';
      const fallback = themeAppearance(theme, 'dark').surfaces[area];
      expect(fallback.image).toBe(surface.image);
      expect(fallback.opacity).toBeLessThan(80);
    }
  });

  it('changes accents independently of borders and keeps one font and image across modes', () => {
    const theme = createCustomTheme();
    theme.border = '#a62445';
    theme.surfaces.header.fill = 'image';
    theme.surfaces.header.image = 'data:image/png;base64,AAAA';
    theme.font = 'gothic';
    const borders = ['light', 'dark'].map(mode => themeAppearance(theme, mode as 'light' | 'dark').border);
    theme.accent = '#228855';
    expect(['light', 'dark'].map(mode => themeAppearance(theme, mode as 'light' | 'dark').border)).toEqual(borders);
    for (const mode of ['light', 'dark'] as const) {
      expect(themeAppearance(theme, mode).surfaces.header.image).toBe(theme.surfaces.header.image);
      expect(customThemeDeclarations(theme, mode)).toContain('--ytcq-theme-panels-font:"Manufacturing Consent"');
    }
    expect(customThemeFontFace(theme).match(/@font-face/g)).toHaveLength(1);
  });

  it('chooses readable text over custom backgrounds and adapts them for dark mode', () => {
    const theme = createCustomTheme();
    theme.surfaces.header.fill = 'solid';
    for (const color of ['#ffffff', '#000000', '#808080', '#ffff00', '#007755', '#bb2255']) {
      theme.surfaces.header.color = color;
      for (const mode of ['light', 'dark'] as const) {
        const surface = themeAppearance(theme, mode).surfaces.header;
        const values = [luminance(surface.color), luminance(surface.text)];
        expect((Math.max(...values) + .05) / (Math.min(...values) + .05)).toBeGreaterThanOrEqual(4.5);
        if (mode === 'dark') expect(luminance(surface.color)).toBeLessThan(.1);
      }
    }
  });

  it('chooses text and accents from the visible image, including dark overrides and opacity', () => {
    const theme = createCustomTheme();
    const images = new Map([
      ['black', { color: '#000000', opacity: 1 }],
      ['white', { color: '#ffffff', opacity: 1 }],
      ['transparent', { color: '#000000', opacity: 0 }]
    ]);
    for (const area of ['header', 'chat', 'composer'] as const) {
      const source = theme.surfaces[area];
      source.fill = 'image';
      source.image = 'black';
      source.darkImage = 'white';
      for (const mode of ['light', 'dark'] as const) {
        const appearance = themeAppearance(theme, mode, images);
        const surface = appearance.surfaces[area];
        const background = mode === 'light' ? '#000000' : '#ffffff';
        expect(contrast(surface.text, background)).toBeGreaterThanOrEqual(4.5);
        const palette = customThemePalette(theme, mode, appearance);
        if (area !== 'header') expect(contrast(palette[area === 'chat' ? 'accent-text' : 'composer-accent'], background)).toBeGreaterThanOrEqual(4.5);
      }
      source.opacity = 10;
      expect(luminance(themeAppearance(theme, 'light', images).surfaces[area].text)).toBeLessThan(.1);
      source.opacity = 100;
      source.image = 'transparent';
      expect(themeAppearance(theme, 'light', images).surfaces[area].text).toBe('#0f0f0f');
      source.darkImage = '';
      source.image = 'white';
      expect(luminance(themeAppearance(theme, 'dark', images).surfaces[area].text)).toBeGreaterThan(.8);
      source.image = 'black';
      source.surfaceOpacity = 10;
      expect(luminance(themeAppearance(theme, 'light', images).surfaces[area].text)).toBeLessThan(.1);
    }
  });

  it('keeps the image text override across modes and only applies it to image backgrounds', () => {
    const theme = createCustomTheme();
    const source = theme.surfaces.header;
    source.image = 'white';
    source.darkImage = 'white';
    const images = new Map([['white', { color: '#ffffff', opacity: 1 }]]);
    for (const mode of ['light', 'dark'] as const) {
      source.fill = 'image';
      source.imageText = 'light';
      expect(luminance(themeAppearance(theme, mode, images).surfaces.header.text)).toBeGreaterThan(.8);
      source.imageText = 'dark';
      expect(luminance(themeAppearance(theme, mode, images).surfaces.header.text)).toBeLessThan(.1);
      source.fill = 'theme';
      expect(themeAppearance(theme, mode, images).surfaces.header.text).toBe(mode === 'dark' ? '#f1f1f1' : '#0f0f0f');
    }
  });

  it('adjusts unreadable accent tones while preserving colors that already contrast', () => {
    expect(readableAccent('#005a93', ['#ffffff'])).toBe('#005a93');
    expect(readableAccent('#55cfff', ['#102d44'])).toBe('#55cfff');
    for (const accent of ['#000000', '#ffffff', '#808080', '#ffff00', '#000080']) {
      for (const background of ['#ffffff', '#0f0f0f', '#808080']) {
        expect(contrast(readableAccent(accent, [background]), background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps Default’s bright blue and native resting fills for flat controls in both appearances', () => {
    const theme = createCustomTheme();
    for (const mode of ['light', 'dark'] as const) {
      const palette = customThemePalette(theme, mode);
      expect(palette['button-text']).toBe('#3ea6ff');
      expect(palette['icon-foreground']).toBe('#3ea6ff');
      expect(palette['button-background']).toBe('initial');
      expect(contrast(palette['accent-text'], themeAppearance(theme, mode).surfaces.chat.color)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('starts composer icons neutral and tints them with the theme without tinting disabled states by default', () => {
    const theme = createCustomTheme();
    for (const finish of ['flat', 'glossy', 'glass'] as const) {
      theme.finish = finish;
      for (const mode of ['light', 'dark'] as const) {
        theme.surfaceTint = 0;
        const neutral = customThemePalette(theme, mode);
        const primary = mode === 'dark' ? '#f1f1f1' : '#0f0f0f';
        expect(neutral['composer-accent']).toBe(finish === 'glossy' && mode === 'dark' ? '#ffffff' : primary);
        expect(neutral['input-icon']).toBe(primary);
        expect(neutral['composer-input']).toBe(mode === 'dark' ? '#272727' : '#f2f2f2');
        expect(neutral['composer-disabled']).toBe(mode === 'dark' ? '#717171' : '#909090');
        expect(neutral['input-muted']).toBe(mode === 'dark' ? '#bebebe' : '#6b6b6b');
        theme.surfaceTint = 100;
        const tinted = customThemePalette(theme, mode);
        expect(tinted['input-icon']).toBe(tinted['input-accent']);
        expect(tinted['input-muted']).toBe(tinted['input-accent']);
        expect(tinted['input-icon']).not.toBe(neutral['input-icon']);
      }
    }
  });

  it('keeps extreme accents readable on controls without recoloring the theme backgrounds', () => {
    const theme = createCustomTheme();
    for (const accent of ['#000000', '#ffffff', '#ffff00', '#000080']) {
      theme.accent = accent;
      for (const mode of ['light', 'dark'] as const) {
        for (const finish of ['flat', 'glossy'] as const) {
          theme.finish = finish;
          const palette = customThemePalette(theme, mode);
          const { surfaces } = themeAppearance(theme, mode);
          expect(palette.accent).toBe(accent);
          expect(contrast(palette['accent-text'], surfaces.chat.color)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(palette['composer-accent'], surfaces.composer.color)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(palette['input-accent'], palette['composer-input'])).toBeGreaterThanOrEqual(4.5);
          for (const amount of finish === 'flat' ? [0, .12, .14] : [0, .12, .20, .28]) {
            const background = mixColor(accent, surfaces.panels.color, amount);
            expect(contrast(palette['button-text'], background)).toBeGreaterThanOrEqual(finish === 'flat' ? 2.25 : 4.5);
          }
          expect(contrast(palette['icon-foreground'], mixColor(accent, surfaces.panels.color, .12))).toBeGreaterThanOrEqual(2.25);
        }
      }
    }
  });

  it('derives composer and input icons from their own backgrounds', () => {
    const theme = createCustomTheme();
    theme.accent = '#000000';
    theme.surfaces.composer.fill = 'solid';
    theme.surfaces.composer.color = '#000000';
    const palette = customThemePalette(theme, 'light');
    expect(contrast(palette['composer-accent'], '#000000')).toBeGreaterThanOrEqual(4.5);
    expect(palette['input-accent']).toBe('#000000');
    expect(palette['accent-text']).toBe('#000000');
  });
});

function contrast(a: string, b: string): number {
  const values = [luminance(a), luminance(b)];
  return (Math.max(...values) + .05) / (Math.min(...values) + .05);
}
