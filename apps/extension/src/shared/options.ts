/**
 * Shared extension option schema.
 *
 * Every UI surface reads and writes these same fields. normalizeOptions guards
 * against missing or malformed stored values so storage state cannot break
 * content-script startup.
 */
import {
  DEFAULT_CHAT_SKIN,
  normalizeChatSkin,
  type ChatSkin
} from './chat-skins';
import {
  DEFAULT_MESSAGE_DENSITY,
  isMessageDensity,
  type MessageDensity
} from './message-density';

export type TranslationDisplay = 'replace' | 'below';

export interface Options {
  chatSkin: ChatSkin;
  composerTranslateLanguage: string;
  liteModeEnabled: boolean;
  messageDensity: MessageDensity;
  targetLanguage: string;
  lastTranslationTarget: string;
  translationDisplay: TranslationDisplay;
  sound: boolean;
  startupEffect: boolean;
  playgroundEnabled: boolean;
  playgroundGamesAvailable: boolean;
}

export const DEFAULT_TRANSLATION_TARGET = 'en';

export const DEFAULT_OPTIONS: Options = {
  chatSkin: DEFAULT_CHAT_SKIN,
  composerTranslateLanguage: '',
  liteModeEnabled: false,
  messageDensity: DEFAULT_MESSAGE_DENSITY,
  targetLanguage: '',
  lastTranslationTarget: DEFAULT_TRANSLATION_TARGET,
  translationDisplay: 'replace',
  sound: true,
  startupEffect: true,
  playgroundEnabled: false,
  playgroundGamesAvailable: true
};

const TRANSLATION_DISPLAY_OPTIONS: readonly (readonly [TranslationDisplay, string])[] = [
  ['replace', 'Replace'],
  ['below', 'Show below']
];

export function normalizeOptions(value: Partial<Options> | Record<string, unknown>): Options {
  const candidate = value as Record<string, unknown>;
  const chatSkin = normalizeChatSkin(candidate.chatSkin);
  const composerTranslateLanguage = getStringOption(candidate.composerTranslateLanguage);
  const targetLanguage = getStringOption(candidate.targetLanguage);
  const lastTranslationTarget = getStringOption(candidate.lastTranslationTarget) || targetLanguage || DEFAULT_TRANSLATION_TARGET;
  const messageDensity = isMessageDensity(candidate.messageDensity)
    ? candidate.messageDensity
    : DEFAULT_OPTIONS.messageDensity;
  const translationDisplay = TRANSLATION_DISPLAY_OPTIONS.some(([mode]) => mode === candidate.translationDisplay)
    ? candidate.translationDisplay as TranslationDisplay
    : DEFAULT_OPTIONS.translationDisplay;

  return {
    chatSkin,
    composerTranslateLanguage,
    liteModeEnabled: candidate.liteModeEnabled === true,
    messageDensity,
    targetLanguage,
    lastTranslationTarget,
    translationDisplay,
    sound: candidate.sound !== false,
    startupEffect: candidate.startupEffect !== false,
    playgroundEnabled: candidate.playgroundEnabled === true,
    playgroundGamesAvailable:
      typeof candidate.playgroundGamesAvailable === 'boolean'
        ? candidate.playgroundGamesAvailable
        : DEFAULT_OPTIONS.playgroundGamesAvailable
  };
}

function getStringOption(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function getTranslationToggleTarget(options: Pick<Options, 'lastTranslationTarget' | 'targetLanguage'>): string {
  return options.lastTranslationTarget || options.targetLanguage || DEFAULT_TRANSLATION_TARGET;
}

export function getTargetLanguageUpdate(targetLanguage: string, lastTranslationTarget = ''): Partial<Options> {
  return targetLanguage
    ? { targetLanguage, lastTranslationTarget: targetLanguage }
    : lastTranslationTarget
      ? { targetLanguage: '', lastTranslationTarget }
      : { targetLanguage: '' };
}
