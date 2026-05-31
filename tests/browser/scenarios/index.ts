/**
 * Shared browser scenario groups.
 *
 * Mock and live specs import the same groups so logged-out and logged-in
 * coverage stays aligned between the deterministic fixture and real YouTube.
 */
import { attachScenario } from './attach';
import { composerTranslationScenario } from './composer-translation';
import { inboxScenario } from './inbox';
import {
  messageTranslationScenario,
  realMessageTranslationScenario,
  translationDisplayScenario
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
import { profileScenario } from './profile';
import {
  popupSettingsBehaviorScenario,
  settingsMenuBehaviorScenario
} from './settings';
import type { BrowserScenario } from './types';

export const loggedOutScenarios: BrowserScenario[] = [
  attachScenario,
  settingsMenuScenario,
  settingsMenuBehaviorScenario,
  popupSettingsBehaviorScenario,
  messageTranslationScenario,
  translationDisplayScenario,
  realMessageTranslationScenario,
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
  messageTranslationScenario,
  translationDisplayScenario,
  realMessageTranslationScenario,
  inboxScenario,
  profileScenario,
  composerTranslationScenario,
  authorMentionDraftScenario
];
