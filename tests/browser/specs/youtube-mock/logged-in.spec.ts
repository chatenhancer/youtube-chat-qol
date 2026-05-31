/**
 * Logged-in mock YouTube browser scenarios.
 *
 * This is the broad deterministic browser suite for composer-capable behavior.
 * Add reusable feature checks under `tests/browser/scenarios/`, then include
 * them here when they should run against the logged-in mock surface.
 */
import { attachScenario } from '../../scenarios/attach';
import { chatCommandsFullScenario } from '../../scenarios/chat-commands';
import {
  composerTranslationScenario,
  mockedComposerTranslationScenario
} from '../../scenarios/composer-translation';
import { focusPanelScenario } from '../../scenarios/focus';
import { frequentEmojiPersistenceScenario } from '../../scenarios/frequent-emojis';
import { inboxScenario } from '../../scenarios/inbox';
import {
  mockedMessageTranslationScenario,
  translationDisplayScenario,
  translationSettingsReactScenario
} from '../../scenarios/message-translation';
import {
  authorMentionDraftScenario,
  mentionMenuDraftScenario,
  quoteMenuDraftScenario
} from '../../scenarios/message-actions';
import {
  messageMenuScenario,
  settingsMenuScenario
} from '../../scenarios/menus';
import { popupResetScenario } from '../../scenarios/popup-reset';
import { profileScenario } from '../../scenarios/profile';
import {
  popupSettingsBehaviorScenario,
  settingsMenuBehaviorScenario
} from '../../scenarios/settings';
import { tabAlertScenario } from '../../scenarios/tab-alert';
import { loggedInMockTest as test } from '../scenario-fixtures';

test('logged-in mock: Extension attaches and popup reports active status', attachScenario);
test('logged-in mock: Message context menu receives quote and mention actions', messageMenuScenario);
test('logged-in mock: Mention menu action writes a draft only', mentionMenuDraftScenario);
test('logged-in mock: Quote menu action writes a draft only', quoteMenuDraftScenario);
test('logged-in mock: Chat settings menu receives extension controls', settingsMenuScenario);
test('logged-in mock: Chat settings menu toggles persist options', settingsMenuBehaviorScenario);
test('logged-in mock: Extension popup settings persist options', popupSettingsBehaviorScenario);
test('logged-in mock: Popup reset restores defaults and clears local data', popupResetScenario);
test('logged-in mock: Incoming chat messages are translated', mockedMessageTranslationScenario);
test('logged-in mock: Translation display modes render correctly', translationDisplayScenario);
test('logged-in mock: Translate chat setting reacts live', translationSettingsReactScenario);
test('logged-in mock: Background tab alert updates title and favicon', tabAlertScenario);
test('logged-in mock: Focus panel opens from an author and follows their messages', focusPanelScenario);
test('logged-in mock: Inbox opens from the chat header', inboxScenario);
test('logged-in mock: Profile card opens from a chat avatar', profileScenario);
test('logged-in mock: Composer translation controls open', composerTranslationScenario);
test('logged-in mock: Composer translation translates draft text with mocked Google Translate', mockedComposerTranslationScenario);
test('logged-in mock: Frequent emojis are tracked, rendered, and persisted', frequentEmojiPersistenceScenario);
test('logged-in mock: Chat commands expand and apply settings', chatCommandsFullScenario);
test('logged-in mock: Author click writes a mention draft only', authorMentionDraftScenario);
