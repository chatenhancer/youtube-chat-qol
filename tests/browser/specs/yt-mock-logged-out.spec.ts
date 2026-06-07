/**
 * Logged-out mock YouTube browser scenarios.
 *
 * This deterministic surface covers extension behavior that works without a
 * chat composer. Add reusable feature checks under `tests/browser/scenarios/`,
 * then include them here when they should run against the logged-out mock.
 */
import { attachScenario } from '../scenarios/attach';
import {
  focusPanelReceivesNewMessagesScenario,
  focusPanelOpensFromAuthorScenario
} from '../scenarios/focus';
import {
  inboxOpensFromHeaderScenario,
  inboxRecordCreationAndJumpScenario,
} from '../scenarios/inbox';
import {
  mockedMessageTranslationScenario,
  replacedTranslationToggleSurfacesScenario,
  translationDisplayScenario,
  translationSettingsReactScenario
} from '../scenarios/message-translation';
import { settingsMenuScenario } from '../scenarios/menus';
import { popupResetScenario } from '../scenarios/popup-reset';
import {
  profileCardReceivesNewMessagesScenario,
  profileCardRecentMessagesScenario
} from '../scenarios/profile';
import {
  popupSettingsBehaviorScenario,
  settingsMenuBehaviorScenario
} from '../scenarios/settings';
import { tabAlertScenario } from '../scenarios/tab-alert';
import { loggedOutMockTest as test } from '../support/scenario-fixtures';

test('logged-out mock: extension attaches and popup reports connected status', attachScenario);
test('logged-out mock: chat settings menu receives extension controls', settingsMenuScenario);
test('logged-out mock: chat settings menu toggles persist options', settingsMenuBehaviorScenario);
test('logged-out mock: extension popup settings persist options', popupSettingsBehaviorScenario);
test('logged-out mock: popup reset restores defaults and clears local data', popupResetScenario);
test('logged-out mock: incoming chat messages are translated', mockedMessageTranslationScenario);
test('logged-out mock: translation display modes render correctly', translationDisplayScenario);
test('logged-out mock: replaced translations toggle across chat surfaces', replacedTranslationToggleSurfacesScenario);
test('logged-out mock: translate chat setting reacts live', translationSettingsReactScenario);
test('logged-out mock: background tab alert updates title and favicon', tabAlertScenario);
test('logged-out mock: focus panel opens from an author and follows their messages', focusPanelOpensFromAuthorScenario);
test('logged-out mock: focus panel receives new messages from the focused author', focusPanelReceivesNewMessagesScenario);
test('logged-out mock: inbox opens from the chat header', inboxOpensFromHeaderScenario);
test('logged-out mock: inbox saves keyword matches, highlights them, and jumps back to chat', inboxRecordCreationAndJumpScenario);
test('logged-out mock: profile card opens from a chat avatar', profileCardRecentMessagesScenario);
test('logged-out mock: profile card receives new messages from the selected author', profileCardReceivesNewMessagesScenario);
