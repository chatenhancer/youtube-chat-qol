/**
 * Shared browser scenario groups.
 *
 * Mock and live specs import the same groups so logged-out and logged-in
 * coverage stays aligned between the deterministic fixture and real YouTube.
 */
import { attachScenario } from './attach';
import { chatCommandsScenario } from './chat-commands';
import {
  composerTranslationScenario,
  mockedComposerTranslationScenario,
  realComposerTranslationScenario
} from './composer-translation';
import { focusPanelScenario } from './focus';
import { frequentEmojiScenario } from './frequent-emojis';
import { inboxScenario } from './inbox';
import {
  messageTranslationScenario,
  realMessageTranslationScenario,
  translationDisplayScenario,
  translationSettingsReactScenario
} from './message-translation';
import {
  authorMentionDraftScenario,
  mentionMenuDraftScenario,
  quoteMenuDraftScenario
} from './message-actions';
import {
  messageMenuScenario,
  settingsMenuScenario
} from './menus';
import { popupResetScenario } from './popup-reset';
import { profileScenario } from './profile';
import {
  popupSettingsBehaviorScenario,
  settingsMenuBehaviorScenario
} from './settings';
import { tabAlertScenario } from './tab-alert';
import type { BrowserScenario } from './types';

export const loggedOutScenarios: BrowserScenario[] = [
  attachScenario,
  settingsMenuScenario,
  settingsMenuBehaviorScenario,
  popupSettingsBehaviorScenario,
  popupResetScenario,
  messageTranslationScenario,
  translationDisplayScenario,
  translationSettingsReactScenario,
  realMessageTranslationScenario,
  tabAlertScenario,
  focusPanelScenario,
  inboxScenario,
  profileScenario
];

export const loggedInScenarios: BrowserScenario[] = [
  attachScenario,
  messageMenuScenario,
  mentionMenuDraftScenario,
  quoteMenuDraftScenario,
  settingsMenuScenario,
  settingsMenuBehaviorScenario,
  popupSettingsBehaviorScenario,
  popupResetScenario,
  messageTranslationScenario,
  translationDisplayScenario,
  translationSettingsReactScenario,
  realMessageTranslationScenario,
  tabAlertScenario,
  focusPanelScenario,
  inboxScenario,
  profileScenario,
  composerTranslationScenario,
  mockedComposerTranslationScenario,
  realComposerTranslationScenario,
  frequentEmojiScenario,
  chatCommandsScenario,
  authorMentionDraftScenario
];
