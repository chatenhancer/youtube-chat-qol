/**
 * Shared chat skin registry.
 *
 * Add future skins here and give each skin its own stylesheet under
 * src/styles/content/skins.
 */
export const DEFAULT_CHAT_SKIN = 'system';

export const CHAT_SKIN_OPTIONS = [
  {
    id: DEFAULT_CHAT_SKIN,
    labelMessage: 'chatSkinDefault'
  },
  {
    id: '2007',
    labelMessage: 'chatSkin2007'
  }
] as const;

export type ChatSkin = typeof CHAT_SKIN_OPTIONS[number]['id'];
export type ChatSkinTheme = 'light' | 'dark';

export function isChatSkin(value: unknown): value is ChatSkin {
  return typeof value === 'string' &&
    CHAT_SKIN_OPTIONS.some((option) => option.id === value);
}
