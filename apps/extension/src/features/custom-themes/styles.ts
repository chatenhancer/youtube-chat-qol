import { THEME_AREAS, type CustomTheme } from '../../shared/custom-themes';
import type { ChatSkinTheme } from '../../shared/chat-skins';
import { THEME_FONTS } from '../../shared/theme-fonts';
import { themeAppearance, hsl, luminance, mixColor, readableAccent, reflectedColors, tintColor } from './appearance';
import { readThemeImageColor, type ThemeImageColor, type ThemeImageColors } from './image-color';

/** Shared derived colors for chat surfaces and controls. */
export function customThemePalette(
  theme: CustomTheme,
  mode: ChatSkinTheme,
  variant = themeAppearance(theme, mode)
): Record<string, string> {
  const surface = variant.surfaces.panels;
  const glass = theme.finish === 'glass';
  const flat = theme.finish === 'flat';
  const [hue, saturation] = hsl(variant.accent);
  const [referenceHue, referenceSaturation] = hsl(mode === 'dark' ? '#55cfff' : '#087dbc');
  const hueShift = hue - referenceHue;
  const saturationScale = saturation / referenceSaturation;
  // Calibrated material shades preserve Glass's bevels while following any accent.
  const shade = (sample: string): string => {
    const [h, s, l] = hsl(sample);
    return `hsl(${h + hueShift} ${Math.min(1, s * saturationScale) * 100}% ${l * 100}%)`;
  };
  const [bh, bs] = hsl(variant.border),
    [rbh, rbs] = hsl(mode === 'dark' ? '#4089b4' : '#73b9db');
  const backgrounds = (area: keyof typeof variant.surfaces): string[] => {
    return variant.surfaces[area].contrastColors;
  };
  const reflected = (colors: string[]): string[] => reflectedColors(theme, colors);
  // Native blue retains about 2.25:1 contrast on its tinted control states.
  // Match that baseline for flat actions and decorative icons; body text stays at 4.5:1.
  const controlContrast = 2.25;
  const buttonTints = flat ? [0, .12, .14] : [0, .12, .20, .28];
  const action = glass ? shade(mode === 'dark' ? '#b5ecff' : '#005a93')
    : readableAccent(variant.accent, reflected(backgrounds('panels').flatMap(color =>
        buttonTints.map(amount => mixColor(variant.accent, color, amount))
      )), flat ? controlContrast : 4.5);
  const mix = (color: string, amount: number, base: string) =>
    `color-mix(in srgb, ${color} ${amount}%, ${base})`;
  const iconBase = tintColor(mode === 'dark' ? '#245572' : '#087dbc', theme.accent);
  const foregroundAccent = glass ? tintColor(mode === 'dark' ? '#b5ecff' : '#005a93', theme.accent) : variant.accent;
  // Composer controls start neutral, then gain the same tint as their surfaces.
  const tint = theme.surfaceTint / 100;
  const inputBase = mode === 'dark' ? mixColor(surface.color, surface.text, .9) : surface.color;
  const inputColor = mixColor(inputBase, mode === 'dark' ? '#272727' : '#f2f2f2', tint);
  const inputAccent = readableAccent(foregroundAccent, [inputColor]);
  const composerAccent = readableAccent(mixColor(foregroundAccent, variant.surfaces.composer.text, tint), reflected(backgrounds('composer')));
  const inputMuted = mixColor(mode === 'dark' ? '#ffffff' : '#111111', inputColor, mode === 'dark' ? .7 : .6);
  const iconStops: [string, number][] =
    [['#c6e8f9', 0], ['#66c2ee', 17], ['#43b5eb', 52], ['#39abe1', 53], ['#3cb1e8', 100]];
  return {
    accent: variant.accent,
    'accent-text': readableAccent(foregroundAccent, backgrounds('chat')),
    'chat-muted': readableAccent(mixColor(variant.surfaces.chat.text, backgrounds('chat')[0], .64), backgrounds('chat')),
    'composer-accent': composerAccent,
    'composer-disabled': mixColor(composerAccent, mode === 'dark' ? '#717171' : '#909090', tint),
    'input-accent': inputAccent,
    'input-icon': readableAccent(mixColor(foregroundAccent, surface.text, tint), [inputColor]),
    'input-muted': readableAccent(mixColor(foregroundAccent, inputMuted, tint), [inputColor]),
    emphasis: action,
    muted: mix(surface.text, 64, surface.color),
    border: variant.border,
    input: mode === 'dark' ? mix(surface.color, 90, surface.text) : surface.color,
    'composer-input': inputColor,
    // YouTube's search fill and translucent category strips are distinct from the panel.
    'emoji-search': mixColor(inputBase, mode === 'dark' ? '#444444' : '#f9f9f9', tint),
    'emoji-category': `${mixColor(
      mixColor(surface.text, surface.color, mode === 'dark' ? .1 : .03),
      mode === 'dark' ? '#282828' : '#f7f7f7', tint
    )}cc`,
    'menu-text': surface.text,
    'button-text': action,
    // Flat controls keep their native unfilled/neutral resting backgrounds.
    'button-background': glass || flat
      ? 'initial'
      : `var(--ytcq-theme-gloss), ${mix(variant.accent, 12, surface.color)}`,
    'button-hover': glass
      ? 'initial'
      : flat ? mix(variant.accent, 12, 'transparent')
      : `var(--ytcq-theme-gloss), ${mix(variant.accent, 20, surface.color)}`,
    'button-active': glass
      ? 'initial'
      : flat ? mix(variant.accent, 14, 'transparent')
      : `var(--ytcq-theme-gloss), ${mix(variant.accent, 28, surface.color)}`,
    'selection-background': glass
      ? mode === 'dark'
        ? `var(--ytcq-glass-control-bg-hover) ${iconBase}`
        : `linear-gradient(${iconStops.map(([color, position]) => `${tintColor(color, theme.accent)} ${position}%`).join(', ')}) ${iconBase}`
      : mix(variant.accent, 14, 'transparent'),
    'icon-background': glass
      ? 'var(--ytcq-theme-selection-background)'
      : mix(variant.accent, 12, 'transparent'),
    'icon-foreground': glass ? '#ffffff' : readableAccent(variant.accent,
      backgrounds('panels').map(color => mixColor(variant.accent, color, .12)), controlContrast),
    'border-tint-hue': String(bh - rbh),
    'border-tint-saturation': String(bs / rbs)
  };
}

/** Only normalized colors, numbers and raster data URLs reach these declarations. */
export function customThemeDeclarations(theme: CustomTheme, mode: ChatSkinTheme, imageColors?: ThemeImageColors): string {
  const variant = themeAppearance(theme, mode, imageColors);
  const values: Record<string, string> = {
    ...customThemePalette(theme, mode, variant),
    shine: String(theme.shine / 100),
    radius: `${theme.radius}px`,
    blur: `${theme.blur}px`,
    'shadow-scale': String(theme.shadow / 65),
    shadow: theme.shadow
      ? `0 6px ${8 + theme.shadow / 3}px rgb(0 0 0 / ${theme.shadow / 180})`
      : 'none',
    'header-shadow': `0 ${theme.shadow / 20}px ${theme.shadow / 8}px rgb(0 0 0 / ${theme.shadow / 180})`,
    'composer-shadow': `0 -${theme.shadow / 20}px ${theme.shadow / 8}px rgb(0 0 0 / ${theme.shadow / 180})`,
    gloss:
      theme.finish === 'glossy'
        ? 'linear-gradient(180deg, rgb(255 255 255 / calc(.439216 * var(--ytcq-theme-shine))), rgb(255 255 255 / calc(.101961 * var(--ytcq-theme-shine))) 46%, rgb(0 0 0 / calc(.133333 * var(--ytcq-theme-shine))) 49%, transparent)'
        : theme.finish === 'glass'
          ? 'linear-gradient(135deg, rgb(255 255 255 / calc(.219608 * var(--ytcq-theme-shine))), transparent 35%, rgb(255 255 255 / calc(.039216 * var(--ytcq-theme-shine))) 70%, rgb(255 255 255 / calc(.141176 * var(--ytcq-theme-shine))))'
          : 'none',
    // Keep panel reflections near the top instead of stretching them across tall content.
    'panels-gloss': theme.finish === 'glossy'
      ? 'linear-gradient(180deg, rgb(255 255 255 / calc(.18 * var(--ytcq-theme-shine))), rgb(255 255 255 / calc(.05 * var(--ytcq-theme-shine))) 3px, transparent 18px)'
      : 'var(--ytcq-theme-gloss)',
    glass: theme.finish === 'glass' ? `blur(${theme.blur}px) saturate(150%)` : 'none',
    'avatar-radius': theme.avatarShape === 'square' ? '2px' : '50%',
    'avatar-frame': theme.avatarFrame ? `url("${theme.avatarFrame}")` : 'none',
    'avatar-frame-content': theme.avatarFrame ? '""' : 'none',
    // Glass replaces the bookmark ring only when an uploaded frame can draw it.
    'avatar-ring-shadow': theme.avatarFrame ? 'none' : 'initial',
    'message-mark': theme.messageMark || 'transparent',
    'message-mark-content': theme.messageMark ? '""' : 'none',
    font: themeFont(theme.font)
  };
  {
    const highlight = variant.secondary;
    const mix = (amount: number, other: string) =>
      `color-mix(in srgb, ${highlight} ${amount}%, ${other})`;
    const top = mix(mode === 'dark' ? 25 : 12, mode === 'dark' ? '#161616' : '#ffffff');
    const bottom = mix(mode === 'dark' ? 18 : 40, mode === 'dark' ? '#161616' : '#ffffff');
    values['highlight'] = highlight;
    values['highlight-text'] = mix(20, mode === 'dark' ? '#ffffff' : '#000000');
    values['highlight-background'] =
      theme.finish === 'flat' ? bottom : `linear-gradient(180deg, ${top}, ${bottom})`;
    values['highlight-border'] = mix(55, 'transparent');
    values['highlight-soft'] = mix(24, 'transparent');
    values['highlight-count-text'] = luminance(highlight) > 0.179 ? '#000000' : '#ffffff';
  }
  for (const area of [...THEME_AREAS, 'panels'] as const) {
    const surface = variant.surfaces[area];
    values[`${area}-font`] = themeFont(theme.font);
    const base = surface.color;
    const reference = {
      light: { header: '#087dbc', chat: '#ffffff', composer: '#e6f8fe', panels: '#f6fdff' },
      dark: { header: '#12659d', chat: '#081c2d', composer: '#173e5b', panels: '#102d44' }
    }[mode][area];
    const [h, s, l] = hsl(base),
      [rh, rs, rl] = hsl(reference);
    values[`${area}-tint-hue`] = String(h - rh);
    values[`${area}-tint-saturation`] = String(rs ? s / rs : s);
    values[`${area}-tint-lightness`] = `${(l - rl) * 100}%`;
    if (area === 'panels') {
      const [eh, es, el] = hsl(surface.fill === 'gradient' ? surface.gradientColor : base);
      const [reh, res, rel] = hsl(mode === 'dark' ? '#174969' : '#cbeef9');
      values['panels-end-tint-hue'] = String(eh - reh);
      values['panels-end-tint-saturation'] = String(es / res);
      values['panels-end-tint-lightness'] = `${(el - rel) * 100}%`;
    }
    const overlay = `color-mix(in srgb, ${base} ${100 - surface.opacity}%, transparent)`;
    const image = surface.fill === 'image' && surface.image ? `url("${surface.image}")` : 'none';
    const size =
      surface.fit === 'repeat'
        ? 'auto'
        : surface.fit === 'stretch'
          ? '100% 100%'
          : surface.fit === 'banner'
            ? `100% ${surface.imageHeight}px`
            : surface.fit;
    const repeat = surface.fit === 'repeat' ? 'repeat' : 'no-repeat';
    const placement = `${surface.positionX}% ${surface.position}% / ${size} ${repeat}`;
    const fittedImage = `${image} ${placement}`;
    // A darkened banner must fade into the surface instead of ending in a pale seam.
    const imageOverlay = surface.fit === 'banner' && mode === 'dark'
      ? `linear-gradient(${surface.position > 0 ? `${base}, ` : ''}${overlay} 20% 55%, ${surface.position < 100 ? base : overlay}) ${placement}`
      : `linear-gradient(${overlay}, ${overlay})`;
    values[`${area}-image-origin`] = `${surface.positionX}% 50%`;
    values[`${area}-text`] = surface.text;
    values[`${area}-color`] = base;
    const glass = theme.finish === 'glass' && area === 'panels';
    const backgroundFor = (translucent: boolean): string => {
      const tint = (color: string) =>
        translucent ? `color-mix(in srgb, ${color} 65%, transparent)` : color;
      return surface.fill === 'gradient'
        ? `linear-gradient(${surface.gradientAngle}deg, ${tint(base)}, ${tint(surface.gradientColor)})`
        : surface.fill === 'image' && surface.image
          ? `${imageOverlay}, ${fittedImage}, ${base}`
          : tint(base);
    };
    const background = backgroundFor(glass);
    // The material stays above every fill, including image backgrounds.
    values[`${area}-background`] =
      area === 'header' || area === 'composer'
        ? `var(--ytcq-theme-gloss), ${background}`
        : background;
    // Menus share the surface design, but keep text readable over moving chat.
    if (area === 'panels') values.menu = backgroundFor(false);
    // Enlarge the entire fitted image, preserving cover/contain and its aspect ratio.
    const zoom = surface.fill === 'image' && surface.image ? surface.zoom : 100;
    const layer = surface.surfaceOpacity < 100 || zoom > 100;
    values[`${area}-paint`] = layer ? 'transparent' : 'initial';
    values[`${area}-surface-opacity`] = String(surface.surfaceOpacity / 100);
    values[`${area}-zoom-content`] = layer ? '""' : 'none';
    values[`${area}-zoom`] = String(zoom / 100);
    const crop = 1 - 100 / zoom;
    values[`${area}-zoom-clip`] =
      `${crop * 50}% ${crop * (100 - surface.positionX)}% ${crop * 50}% ${crop * surface.positionX}%`;
  }
  const [hue, saturation] = hsl(variant.accent);
  const [referenceHue, referenceSaturation] = hsl(mode === 'dark' ? '#55cfff' : '#087dbc');
  return (
    Object.entries(values)
      .map(([key, value]) => `--ytcq-theme-${key}:${value}`)
      .join(';') +
    `;--ytcq-glass-hue-shift:${hue - referenceHue};--ytcq-glass-saturation:${saturation / referenceSaturation}`
  );
}

/** Cache each appearance for one theme snapshot; replace the snapshot after edits. */
export function createThemeStyleCache(onImageReady: () => void = () => {}): (theme: CustomTheme, mode: ChatSkinTheme) => string {
  let current: CustomTheme | null = null;
  let styles: Partial<Record<ChatSkinTheme, string>> = {};
  // Only this theme's images are retained; edits and mode switches reuse their samples.
  const images = new Map<string, ThemeImageColor | null>();
  return (theme, mode) => {
    if (current !== theme) {
      current = theme;
      styles = {};
      const sources = new Set(THEME_AREAS.flatMap(area => [theme.surfaces[area].image, theme.surfaces[area].darkImage]).filter(Boolean));
      for (const source of images.keys()) if (!sources.has(source)) images.delete(source);
      for (const source of sources) {
        if (images.has(source)) continue;
        images.set(source, null);
        void readThemeImageColor(source).then(sample => {
          if (!images.has(source)) return;
          images.set(source, sample);
          styles = {};
          onImageReady();
        }).catch(() => {});
      }
    }
    return styles[mode] ??= customThemeDeclarations(theme, mode, images);
  };
}

export function customThemeFontFace(theme: CustomTheme): string {
  const font = THEME_FONTS[theme.font];
  if (!('face' in font)) return '';
  const { family, file, weight, sizeAdjust } = font.face;
  const scale = sizeAdjust / 100;
  // Keep Inter's line metrics after enlarging the glyphs, so normal line height
  // and baseline alignment do not inflate rows or push controls out of place.
  const metrics = `size-adjust:${sizeAdjust}%;ascent-override:${(96.875 / scale).toFixed(2)}%;descent-override:${(24.121 / scale).toFixed(2)}%;line-gap-override:0%;`;
  return `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;${metrics}src:url("${chrome.runtime.getURL(`fonts/${file}`)}") format("truetype")}`;
}

function themeFont(font: CustomTheme['font']): string {
  return THEME_FONTS[font].stack;
}
