import {
  THEME_AREAS,
  type CustomTheme,
  type ThemeArea,
  type ThemeSurface
} from '../../shared/custom-themes';
import type { ChatSkinTheme } from '../../shared/chat-skins';
import type { ThemeImageColors } from './image-color';

type RenderedSurface = Omit<ThemeSurface, 'fill' | 'darkImage' | 'imageText'> & {
  fill: 'solid' | 'gradient' | 'image';
  text: string;
  contrastColors: string[];
};
type SurfaceArea = ThemeArea | 'panels';

/** One palette adapts to both appearances; images may supply a dark override. */
export function themeAppearance(
  theme: CustomTheme,
  mode: ChatSkinTheme,
  imageColors?: ThemeImageColors
): {
  accent: string;
  secondary: string;
  border: string;
  surfaces: Record<SurfaceArea, RenderedSurface>;
} {
  const dark = mode === 'dark';
  // Start from YouTube's neutral colors. Tint is theme data, independent of finish.
  const strength = theme.surfaceTint / 100;
  const tint = (sample: string) => tintColor(sample, theme.accent);
  const backgroundTint = (sample: string) => mixColor(tint(sample), dark ? '#0f0f0f' : '#ffffff', strength);
  const bases = dark
    ? { header: '#12659d', chat: '#081c2d', composer: '#173e5b', panels: '#102d44' }
    : { header: '#087dbc', chat: '#ffffff', composer: '#e6f8fe', panels: '#f6fdff' };
  const accent = dark
    ? mixColor(adaptColor(theme.accent, '#087dbc', '#55cfff'), theme.accent, strength)
    : theme.accent;
  const border = themeBorder(theme.border, mode);
  const surfaces = {} as Record<SurfaceArea, RenderedSurface>;
  for (const area of [...THEME_AREAS, 'panels'] as const) {
    const source = area === 'panels' ? null : theme.surfaces[area];
    const image = (dark && source?.darkImage) || source?.image || '';
    const hasImage = source?.fill === 'image' && !!image;
    const customColor = source?.fill === 'solid' || source?.fill === 'gradient';
    const background = (value: string) => (dark ? darkBackground(value) : value);
    const color = customColor
      ? background(source.color)
      : backgroundTint(bases[dark && hasImage && !source?.darkImage ? 'chat' : area]);
    const gradientColor = customColor
      ? background(source.gradientColor)
      : area === 'panels'
        ? backgroundTint(dark ? '#174969' : '#cbeef9')
        : color;
    const fill =
      source && source.fill !== 'theme'
        ? source.fill
        : theme.finish === 'glass' && area === 'panels'
          ? 'gradient'
          : 'solid';
    const lightText = mixColor(
      area === 'header' && !customColor ? '#ffffff' : tint('#e8f5ff'),
      '#f1f1f1',
      strength
    );
    const darkText = mixColor(tint('#143244'), '#0f0f0f', strength);
    // A supplied dark image is already authored for that mode.
    const opacity = (source?.opacity ?? 100) * (dark && hasImage && !source?.darkImage ? 0.32 : 1);
    const sample = hasImage ? imageColors?.get(image) : null;
    let contrastColors = fill === 'gradient' ? [color, gradientColor] : [color];
    if (sample) {
      const painted = mixColor(sample.color, color, sample.opacity * opacity / 100);
      const chat = theme.surfaces.chat;
      const behind = chat.fill === 'solid' || chat.fill === 'gradient'
        ? background(chat.color) : backgroundTint(bases.chat);
      contrastColors = [mixColor(painted, behind, (source?.surfaceOpacity ?? 100) / 100)];
      // These placements also expose the surface outside the image.
      if (source?.fit === 'contain' || source?.fit === 'banner') contrastColors.push(color);
    }
    const imageText = hasImage ? source?.imageText ?? 'auto' : 'auto';
    if (imageText !== 'auto') {
      contrastColors = [imageText === 'light' ? '#000000' : '#ffffff'];
    }
    const textBackgrounds = hasImage && area !== 'chat'
      ? reflectedColors(theme, contrastColors) : contrastColors;
    const score = (candidate: string) => Math.min(...textBackgrounds.map(value => contrast(candidate, value)));
    const lightScore = score(lightText), darkScore = score(darkText);
    const text = imageText === 'light' ? lightText
      : imageText === 'dark' ? darkText
      : lightScore > darkScore
        ? lightScore >= 4.5 ? lightText : '#ffffff'
        : darkScore >= 4.5 ? darkText : '#000000';
    surfaces[area] = {
      color,
      gradientColor,
      text,
      contrastColors,
      fill,
      gradientAngle: source?.gradientAngle ?? 160,
      image,
      opacity,
      position: source?.position ?? 50,
      positionX: source?.positionX ?? 50,
      surfaceOpacity: source?.surfaceOpacity ?? 100,
      fit: source?.fit ?? 'cover',
      zoom: source?.zoom ?? 100,
      imageHeight: source?.imageHeight ?? 110
    };
  }
  return { accent, secondary: theme.secondary, border, surfaces };
}

/** Include the lightest and darkest parts of the material above a background. */
export function reflectedColors(theme: CustomTheme, colors: string[]): string[] {
  if (theme.finish === 'flat') return colors;
  return colors.flatMap(color => [color,
    mixColor('#ffffff', color, (theme.finish === 'glossy' ? .439216 : .219608) * theme.shine / 100),
    ...(theme.finish === 'glossy' ? [mixColor('#000000', color, .133333 * theme.shine / 100)] : [])
  ]);
}

/** Neutral borders darken with the page; saturated borders retain their definition. */
export function themeBorder(border: string, mode: ChatSkinTheme): string {
  return mode === 'dark'
    ? mixColor(
        adaptColor(border, '#73b9db', '#4089b4'),
        mixColor(border, '#000000', 0.32),
        Math.min(1, hsl(border)[1] / hsl('#73b9db')[1])
      )
    : border;
}

/** Material colors retain their depth while their hue and saturation follow the accent. */
export function tintColor(sample: string, accent: string): string {
  const [h, s, l] = hsl(sample),
    [ah, as] = hsl(accent),
    [rh, rs] = hsl('#087dbc');
  return hex(h + ah - rh, (s * as) / rs, l);
}

function adaptColor(color: string, from: string, to: string): string {
  const [h, s, l] = hsl(color),
    [fh, fs, fl] = hsl(from),
    [th, ts, tl] = hsl(to);
  const lightness = l < fl ? (l * tl) / fl : tl + ((l - fl) * (1 - tl)) / (1 - fl);
  return hex(h + th - fh, (s * ts) / fs, lightness);
}

function darkBackground(color: string): string {
  const [h, s, l] = hsl(color);
  return hex(h, s * 0.7, 0.17 - l * 0.1);
}

/** Keep the accent's hue where possible, adjusting its tone for the painted surface. */
export function readableAccent(color: string, backgrounds: string[], minimum = 4.5): string {
  const score = (candidate: string) => Math.min(...backgrounds.map(background => contrast(candidate, background)));
  if (score(color) >= minimum) return color;
  const target = score('#ffffff') > score('#000000') ? '#ffffff' : '#000000';
  // Some reflections span too much light and dark for any one foreground to meet the target.
  if (score(target) < minimum) return target;
  let low = 0, high = 1;
  for (let step = 0; step < 12; step++) {
    const amount = (low + high) / 2;
    if (score(mixColor(target, color, amount)) >= minimum) high = amount;
    else low = amount;
  }
  return mixColor(target, color, high);
}

export function mixColor(color: string, base: string, amount: number): string {
  return (
    '#' +
    [1, 3, 5]
      .map((offset) =>
        Math.round(
          parseInt(color.slice(offset, offset + 2), 16) * amount +
            parseInt(base.slice(offset, offset + 2), 16) * (1 - amount)
        )
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  );
}

function contrast(a: string, b: string): number {
  const values = [luminance(a), luminance(b)];
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}

export function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map((offset) => {
    const value = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function hsl(color: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  if (!delta) return [0, 0, max];
  const hue = max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return [(hue * 60 + 360) % 360, delta / (1 - Math.abs(max + min - 1)), (max + min) / 2];
}

function hex(hue: number, saturation: number, lightness: number): string {
  const h = (((hue % 360) + 360) % 360) / 60;
  const s = Math.max(0, Math.min(1, saturation)),
    l = Math.max(0, Math.min(1, lightness));
  const c = (1 - Math.abs(2 * l - 1)) * s,
    x = c * (1 - Math.abs((h % 2) - 1)),
    m = l - c / 2;
  const [r, g, b] =
    h < 1
      ? [c, x, 0]
      : h < 2
        ? [x, c, 0]
        : h < 3
          ? [0, c, x]
          : h < 4
            ? [0, x, c]
            : h < 5
              ? [x, 0, c]
              : [c, 0, x];
  return (
    '#' +
    [r, g, b]
      .map((value) =>
        Math.round((value + m) * 255)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  );
}
