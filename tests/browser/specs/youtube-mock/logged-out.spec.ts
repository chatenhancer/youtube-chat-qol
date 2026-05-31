/**
 * Logged-out mock YouTube browser scenarios.
 *
 * This deterministic surface covers extension behavior that works without a
 * chat composer. Add reusable feature checks under `tests/browser/scenarios/`,
 * then include them here when they should run against the logged-out mock.
 */
import { attachScenario } from '../../scenarios/attach';
import { focusPanelScenario } from '../../scenarios/focus';
import { inboxScenario } from '../../scenarios/inbox';
import {
  mockedMessageTranslationScenario,
  translationDisplayScenario,
  translationSettingsReactScenario
} from '../../scenarios/message-translation';
import { settingsMenuScenario } from '../../scenarios/menus';
import { popupResetScenario } from '../../scenarios/popup-reset';
import { profileScenario } from '../../scenarios/profile';
import {
  popupSettingsBehaviorScenario,
  settingsMenuBehaviorScenario
} from '../../scenarios/settings';
import { tabAlertScenario } from '../../scenarios/tab-alert';
import { loggedOutMockTest as test } from '../scenario-fixtures';

test('logged-out mock: Extension attaches and popup reports active status', attachScenario);
test('logged-out mock: Chat settings menu receives extension controls', settingsMenuScenario);
test('logged-out mock: Chat settings menu toggles persist options', settingsMenuBehaviorScenario);
test('logged-out mock: Extension popup settings persist options', popupSettingsBehaviorScenario);
test('logged-out mock: Popup reset restores defaults and clears local data', popupResetScenario);
test('logged-out mock: Incoming chat messages are translated', mockedMessageTranslationScenario);
test('logged-out mock: Translation display modes render correctly', translationDisplayScenario);
test('logged-out mock: Translate chat setting reacts live', translationSettingsReactScenario);
test('logged-out mock: Background tab alert updates title and favicon', tabAlertScenario);
test('logged-out mock: Focus panel opens from an author and follows their messages', focusPanelScenario);
test('logged-out mock: Inbox opens from the chat header', inboxScenario);
test('logged-out mock: Profile card opens from a chat avatar', profileScenario);
