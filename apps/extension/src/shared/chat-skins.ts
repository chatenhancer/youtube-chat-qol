/**
 * Default selection and the preinstalled local theme.
 */
export const DEFAULT_CHAT_SKIN = 'system';

export const CHAT_SKIN_OPTIONS = [
  {
    id: DEFAULT_CHAT_SKIN,
    labelMessage: 'chatSkinDefault'
  },
  {
    id: 'custom:aero',
    labelMessage: 'chatSkinAero'
  }
] as const;

export type CustomChatSkin = `custom:${string}`;
export type ChatSkin = typeof CHAT_SKIN_OPTIONS[number]['id'] | CustomChatSkin;
export type ChatSkinTheme = 'light' | 'dark';

export function normalizeChatSkin(value: unknown): ChatSkin {
  // Released versions stored Aero under its built-in ID. Keep those selections
  // working on every read, including values arriving later through browser sync.
  if (value === 'aero') return 'custom:aero';
  return value === DEFAULT_CHAT_SKIN || isCustomChatSkin(value) ? value : DEFAULT_CHAT_SKIN;
}

export function isCustomChatSkin(value: unknown): value is CustomChatSkin {
  return typeof value === 'string' && /^custom:[a-zA-Z0-9-]{1,64}$/.test(value);
}
