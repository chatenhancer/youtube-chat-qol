interface ThemeFontDefinition {
  stack: string;
  face?: { family: string; file: string; weight: string; sizeAdjust: number };
}

// Bundled faces are optically scaled to roughly the default font's lowercase height.
export const THEME_FONTS = {
  default: { stack: 'var(--ytcq-default-font, Roboto, Arial, sans-serif)' },
  classic: { stack: 'Tahoma, "Segoe UI", Arial, sans-serif' },
  mono: { stack: 'Consolas, "Liberation Mono", monospace' },
  gothic: {
    stack: '"Manufacturing Consent", Georgia, serif',
    face: { family: 'Manufacturing Consent', file: 'manufacturing-consent-regular.woff2', weight: '400', sizeAdjust: 125 }
  },
  playful: {
    stack: '"Dongle", "Trebuchet MS", sans-serif',
    face: { family: 'Dongle', file: 'dongle-regular.woff2', weight: '400', sizeAdjust: 180 }
  },
  pixel: {
    stack: '"Pixelify Sans", Consolas, monospace',
    face: { family: 'Pixelify Sans', file: 'pixelify-sans-variable.woff2', weight: '400 700', sizeAdjust: 120 }
  },
  elegant: {
    stack: '"Instrument Serif", Georgia, serif',
    face: { family: 'Instrument Serif', file: 'instrument-serif-regular.woff2', weight: '400', sizeAdjust: 105 }
  }
} satisfies Record<string, ThemeFontDefinition>;

export type ThemeFont = keyof typeof THEME_FONTS;
export const THEME_FONT_OPTIONS = Object.keys(THEME_FONTS) as ThemeFont[];
