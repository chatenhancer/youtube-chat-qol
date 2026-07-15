/**
 * Logged-out real YouTube live chat scenarios.
 *
 * This is the smallest real YouTube suite: it proves the extension still
 * attaches to YouTube's current read-only live chat DOM and that incoming-message
 * translation still works without requiring a signed-in session.
 */
import { attachScenario } from '../scenarios/attach';
import { focusPanelOpensFromAuthorScenario } from '../scenarios/focus';
import { inboxOpensFromHeaderScenario } from '../scenarios/inbox';
import {
  mockedMessageTranslationScenario,
  mockedReplacedTranslationToggleScenario,
  realBatchTranslationProviderScenario
} from '../scenarios/message-translation';
import { settingsMenuScenario } from '../scenarios/menus';
import { profileCardRecentMessagesScenario } from '../scenarios/profile';
import { loggedOutLiveTest as test } from '../support/scenario-fixtures';

test('logged-out live: extension attaches and current tab action reports connected status', attachScenario);
test('logged-out live: chat settings menu receives extension controls', settingsMenuScenario);
test('logged-out live: incoming chat messages are translated', mockedMessageTranslationScenario);
test(
  'logged-out live: incoming translation batch reaches real Google Translate',
  realBatchTranslationProviderScenario
);
test('logged-out live: replaced translations toggle from the inline icon', mockedReplacedTranslationToggleScenario);
test('logged-out live: focus panel opens from an author and follows their messages', focusPanelOpensFromAuthorScenario);
test('logged-out live: inbox opens from the chat header', inboxOpensFromHeaderScenario);
test('logged-out live: profile card opens from a chat avatar', profileCardRecentMessagesScenario);
