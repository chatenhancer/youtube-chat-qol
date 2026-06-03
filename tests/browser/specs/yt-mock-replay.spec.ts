/**
 * Logged-in mock YouTube live chat replay scenario.
 *
 * The deterministic replay fixture verifies read-only chat features on the
 * `live_chat_replay` DOM shape without requiring a composer.
 */
import {
  attachScenario
} from '../scenarios/attach';
import { focusPanelOpensFromAuthorScenario } from '../scenarios/focus';
import { inboxOpensFromHeaderScenario } from '../scenarios/inbox';
import { markedUserMessageMenuScenario } from '../scenarios/marked-users';
import { mockedMessageTranslationScenario } from '../scenarios/message-translation';
import { messageMenuScenario, settingsMenuScenario } from '../scenarios/menus';
import { profileCardRecentMessagesScenario } from '../scenarios/profile';
import { loggedInMockReplayTest as test } from '../support/scenario-fixtures';

test('logged-in mock replay: extension attaches and popup reports connected status', attachScenario);
test('logged-in mock replay: chat settings menu receives extension controls', settingsMenuScenario);
test('logged-in mock replay: message context menu receives mark, quote, and mention actions', messageMenuScenario);
test('logged-in mock replay: mark user from message menu persists and shows avatar ring', markedUserMessageMenuScenario);
test('logged-in mock replay: incoming chat messages are translated', mockedMessageTranslationScenario);
test('logged-in mock replay: focus panel opens from an author and follows their messages', focusPanelOpensFromAuthorScenario);
test('logged-in mock replay: inbox opens from the chat header', inboxOpensFromHeaderScenario);
test('logged-in mock replay: profile card opens from a chat avatar', profileCardRecentMessagesScenario);
