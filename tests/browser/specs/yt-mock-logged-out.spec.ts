/**
 * Logged-out mock YouTube browser scenarios.
 *
 * This deterministic surface covers extension behavior that works without a
 * chat composer. Add reusable feature checks under `tests/browser/scenarios/`,
 * then include them here when they should run against the logged-out mock.
 */
import { focusPanelReceivesNewMessagesScenario } from '../scenarios/focus';
import {
  inboxRecordCreationAndJumpScenario
} from '../scenarios/inbox';
import {
  replacedTranslationToggleSurfacesScenario,
  translationDisplayScenario,
  translationSettingsReactScenario
} from '../scenarios/message-translation';
import { settingsMenuScenario } from '../scenarios/menus';
import {
  profileCardAeroOriginHighlightScenario,
  profileCardHistoryPagingScenario,
  profileCardReceivesNewMessagesScenario,
  profileCardRecentMessagesScenario,
  profileMentionOpensRecentMessagesScenario
} from '../scenarios/profile';
import { settingsMenuBehaviorScenario } from '../scenarios/settings';
import { loggedOutMockTest as test } from '../support/scenario-fixtures';

test('logged-out mock: chat settings menu receives extension controls', settingsMenuScenario);
test('logged-out mock: chat settings menu toggles persist options', settingsMenuBehaviorScenario);
test('logged-out mock: translation display modes render correctly', translationDisplayScenario);
test('logged-out mock: replaced translations toggle across chat surfaces', replacedTranslationToggleSurfacesScenario);
test('logged-out mock: translate chat setting reacts live', translationSettingsReactScenario);
test('logged-out mock: focus panel receives new messages from the focused author', focusPanelReceivesNewMessagesScenario);
test('logged-out mock: inbox saves keyword matches, highlights them, and jumps back to chat', inboxRecordCreationAndJumpScenario);
test('logged-out mock: profile card opens from a chat avatar', profileCardRecentMessagesScenario);
test('logged-out mock: profile card receives new messages from the selected author', profileCardReceivesNewMessagesScenario);
test('logged-out mock: profile card pages through retained author history', profileCardHistoryPagingScenario);
test(
  'logged-out mock: Aero highlights the current message in the profile card',
  profileCardAeroOriginHighlightScenario
);
test(
  'logged-out mock: clicking a mentioned handle opens that user’s recent messages',
  profileMentionOpensRecentMessagesScenario
);
