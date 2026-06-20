/**
 * Logged-in real YouTube live chat replay scenario.
 *
 * This checks the extension against a real YouTube replay iframe where there
 * is no composer, but read-only chat features should still attach.
 */
import {
  attachScenario
} from '../scenarios/attach';
import { focusPanelOpensFromAuthorScenario } from '../scenarios/focus';
import { inboxOpensFromHeaderScenario } from '../scenarios/inbox';
import { markedUserMessageMenuScenario } from '../scenarios/marked-users';
import { realMessageTranslationScenario } from '../scenarios/message-translation';
import { messageMenuScenario, settingsMenuScenario } from '../scenarios/menus';
import { profileCardRecentMessagesScenario } from '../scenarios/profile';
import { loggedInLiveReplayTest as test } from '../support/scenario-fixtures';

test('logged-in live replay: extension attaches and current tab action reports connected status', attachScenario);
test('logged-in live replay: chat settings menu receives extension controls', settingsMenuScenario);
test('logged-in live replay: message context menu receives mark, quote, and mention actions', messageMenuScenario);
test('logged-in live replay: mark user from message menu persists and shows avatar ring', markedUserMessageMenuScenario);
test('logged-in live replay: incoming chat messages translate through real Google Translate', realMessageTranslationScenario);
test('logged-in live replay: focus panel opens from an author and follows their messages', focusPanelOpensFromAuthorScenario);
test('logged-in live replay: inbox opens from the chat header', inboxOpensFromHeaderScenario);
test('logged-in live replay: profile card opens from a chat avatar', profileCardRecentMessagesScenario);
