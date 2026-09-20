/** Validated local themes. Presets use exactly the same data and renderer as user themes. */
import { normalizeChatSkin, type CustomChatSkin } from './chat-skins';
import { THEME_FONT_OPTIONS, type ThemeFont } from './theme-fonts';
import aeroPreset from '../assets/themes/aero.json';

export const CUSTOM_THEMES_KEY = 'ytcqCustomThemes:v1';
export const APPLIED_CUSTOM_THEME_KEY = 'ytcqAppliedCustomTheme:v1';
export const THEME_AREAS = ['header', 'chat', 'composer'] as const;
export type ThemeArea = typeof THEME_AREAS[number];
export const MAX_THEME_IMAGE_LENGTH = 350_000;
export const MAX_THEME_GIF_BYTES = 2 * 1024 * 1024;

export interface ThemeSurface {
  fill: 'theme' | 'solid' | 'gradient' | 'image';
  color: string;
  gradientColor: string;
  gradientAngle: number;
  image: string;
  darkImage: string;
  imageText: 'auto' | 'light' | 'dark';
  opacity: number;
  position: number;
  positionX: number;
  surfaceOpacity: number;
  fit: 'cover' | 'contain' | 'repeat' | 'stretch' | 'banner';
  zoom: number;
  imageHeight: number;
}

export interface CustomTheme {
  version: 1;
  id: string;
  name: string;
  finish: 'flat' | 'glossy' | 'glass';
  radius: number;
  shadow: number;
  blur: number;
  shine: number;
  font: ThemeFont;
  avatarShape: 'round' | 'square';
  accent: string;
  secondary: string;
  border: string;
  surfaceTint: number;
  avatarFrame: string;
  messageMark: string;
  surfaces: Record<ThemeArea, ThemeSurface>;
}

export function defaultThemeRadius(finish: CustomTheme['finish']): number {
  return finish === 'glass' ? 4 : 12;
}

export function createCustomTheme(): CustomTheme {
  return {
    version: 1, id: crypto.randomUUID(), name: '', finish: 'flat', radius: defaultThemeRadius('flat'),
    shadow: 0, blur: 16, shine: 100, font: 'default', avatarShape: 'round',
    accent: '#3ea6ff', secondary: '#ffb74d', border: '#d6d6d6', surfaceTint: 0,
    avatarFrame: '', messageMark: '',
    surfaces: Object.fromEntries(THEME_AREAS.map((area) => [area, {
      fill: 'theme', color: '#ffffff', gradientColor: '#eeeeee', gradientAngle: 160,
      image: '', darkImage: '', imageText: 'auto', opacity: 100, position: 50, positionX: 50,
      surfaceOpacity: 100, fit: 'cover', zoom: 100, imageHeight: 110
    }])) as Record<ThemeArea, ThemeSurface>
  };
}

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const color = (value: unknown, fallback: string): string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
const number = (value: unknown, fallback: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback;
const choice = <T extends string>(value: unknown, values: readonly T[], fallback: T): T =>
  values.includes(value as T) ? value as T : fallback;

export function normalizeThemeImage(value: unknown): string {
  if (typeof value !== 'string') return '';
  const maxLength = value.startsWith('data:image/gif;base64,')
    ? 'data:image/gif;base64,'.length + Math.ceil(MAX_THEME_GIF_BYTES / 3) * 4
    : MAX_THEME_IMAGE_LENGTH;
  return value.length <= maxLength &&
    /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(value) ? value : '';
}

export function normalizeCustomTheme(value: unknown): CustomTheme | null {
  const data = object(value);
  if (data.version !== 1 || typeof data.id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(data.id)) return null;
  const theme = createCustomTheme();
  theme.id = data.id;
  theme.name = typeof data.name === 'string' ? data.name.trim().slice(0, 60) : '';
  theme.finish = choice(data.finish, ['flat', 'glossy', 'glass'], 'flat');
  theme.font = choice(data.font, THEME_FONT_OPTIONS, 'default');
  theme.avatarShape = choice(data.avatarShape, ['round', 'square'], 'round');
  theme.radius = number(data.radius, defaultThemeRadius(theme.finish), 24);
  theme.shadow = number(data.shadow, 0, 100);
  theme.blur = number(data.blur, 16, 24);
  theme.shine = number(data.shine, 100, 100);
  theme.surfaceTint = number(data.surfaceTint, 0, 100);
  for (const key of ['accent', 'secondary', 'border'] as const) {
    theme[key] = color(data[key], theme[key]);
  }
  theme.avatarFrame = normalizeThemeImage(data.avatarFrame);
  theme.messageMark = color(data.messageMark, '');
  for (const area of THEME_AREAS) {
    const surface = theme.surfaces[area];
    const storedSurface = object(object(data.surfaces)[area]);
    surface.fill = choice(storedSurface.fill, ['theme', 'solid', 'gradient', 'image'], 'theme');
    surface.fit = choice(storedSurface.fit, ['cover', 'contain', 'repeat', 'stretch', 'banner'], 'cover');
    for (const key of ['color', 'gradientColor'] as const) {
      surface[key] = color(storedSurface[key], surface[key]);
    }
    surface.image = normalizeThemeImage(storedSurface.image);
    surface.darkImage = normalizeThemeImage(storedSurface.darkImage);
    surface.imageText = choice(storedSurface.imageText, ['auto', 'light', 'dark'], 'auto');
    surface.opacity = number(storedSurface.opacity, 100, 100);
    surface.position = number(storedSurface.position, 50, 100);
    surface.positionX = number(storedSurface.positionX, 50, 100);
    surface.gradientAngle = number(storedSurface.gradientAngle, 160, 360);
    surface.surfaceOpacity = number(storedSurface.surfaceOpacity, 100, 100);
    surface.zoom = Math.max(100, number(storedSurface.zoom, 100, 300));
    surface.imageHeight = Math.max(20, number(storedSurface.imageHeight, 110, 400));
  }
  return theme;
}

export function normalizeCustomThemes(value: unknown): CustomTheme[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, CustomTheme>();
  for (const item of value) {
    const theme = normalizeCustomTheme(item);
    if (theme?.name) unique.set(theme.id, theme);
  }
  return [...unique.values()];
}

export function customThemeSkin(theme: Pick<CustomTheme, 'id'>): CustomChatSkin {
  return `custom:${theme.id}`;
}

export async function loadCustomThemes(): Promise<CustomTheme[]> {
  const stored = await chrome.storage.local.get(CUSTOM_THEMES_KEY);
  const themes = normalizeCustomThemes(stored[CUSTOM_THEMES_KEY]);
  const preset = normalizeCustomTheme(aeroPreset)!;
  const presetIndex = themes.findIndex(isPreinstalledTheme);
  if (JSON.stringify(themes[presetIndex]) !== JSON.stringify(preset)) {
    if (presetIndex < 0) themes.unshift(preset);
    else themes[presetIndex] = preset;
    await chrome.storage.local.set({ [CUSTOM_THEMES_KEY]: themes });
  }
  return themes;
}

export function isPreinstalledTheme(theme: Pick<CustomTheme, 'id'>): boolean {
  return theme.id === 'aero';
}

export function selectedThemeId(skin: unknown): string {
  const normalized = normalizeChatSkin(skin);
  return normalized.startsWith('custom:') ? normalized.slice(7) : '';
}

export function selectedTheme(skin: unknown, applied: CustomTheme | null, preset: CustomTheme | null): CustomTheme | null {
  const id = selectedThemeId(skin);
  return id === preset?.id ? preset : id === applied?.id ? applied : null;
}

export async function saveCustomTheme(theme: CustomTheme): Promise<void> {
  const normalized = normalizeCustomTheme(theme);
  if (!normalized?.name) throw new Error('Theme name required');
  if (isPreinstalledTheme(normalized) || normalized.name.toLowerCase() === 'aero') {
    throw new Error('Preinstalled themes must be saved as a copy with a new name');
  }
  const themes = await loadCustomThemes();
  const index = themes.findIndex((item) => item.id === theme.id);
  if (index === -1) themes.push(normalized);
  else themes[index] = normalized;
  await chrome.storage.local.set({ [CUSTOM_THEMES_KEY]: themes });
}

export async function applyCustomTheme(theme: CustomTheme): Promise<void> {
  const normalized = isPreinstalledTheme(theme)
    ? (await loadCustomThemes()).find(isPreinstalledTheme)!
    : normalizeCustomTheme(theme);
  if (!normalized?.name) throw new Error('Invalid theme');
  // A separate applied snapshot lets Save leave the active appearance untouched.
  await chrome.storage.local.set({ [APPLIED_CUSTOM_THEME_KEY]: normalized });
  await chrome.storage.sync.set({ chatSkin: customThemeSkin(normalized) });
}

export async function deleteCustomTheme(id: string): Promise<void> {
  if (isPreinstalledTheme({ id })) throw new Error('Preinstalled themes cannot be deleted');
  const themes = await loadCustomThemes();
  const { chatSkin } = await chrome.storage.sync.get('chatSkin');
  if (chatSkin === `custom:${id}`) await chrome.storage.sync.set({ chatSkin: 'system' });
  await chrome.storage.local.set({ [CUSTOM_THEMES_KEY]: themes.filter((theme) => theme.id !== id) });
  const applied = await chrome.storage.local.get(APPLIED_CUSTOM_THEME_KEY);
  if (normalizeCustomTheme(applied[APPLIED_CUSTOM_THEME_KEY])?.id === id) {
    await chrome.storage.local.remove(APPLIED_CUSTOM_THEME_KEY);
  }
}
