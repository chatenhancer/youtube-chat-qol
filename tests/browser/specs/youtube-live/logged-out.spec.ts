/**
 * Logged-out real YouTube live chat scenarios.
 *
 * This is the smallest real YouTube suite: it proves the extension still
 * attaches to YouTube's current read-only live chat DOM and that provider-backed
 * incoming-message translation still works.
 */
import { attachScenario } from '../../scenarios/attach';
import { focusPanelScenario } from '../../scenarios/focus';
import { inboxScenario } from '../../scenarios/inbox';
import { realMessageTranslationScenario } from '../../scenarios/message-translation';
import { settingsMenuScenario } from '../../scenarios/menus';
import { profileScenario } from '../../scenarios/profile';
import { loggedOutLiveTest as test } from '../scenario-fixtures';

test('logged-out live: extension attaches and popup reports active status', attachScenario);
test('logged-out live: chat settings menu receives extension controls', settingsMenuScenario);
test('logged-out live: incoming chat messages translate through real Google Translate', realMessageTranslationScenario);
test('logged-out live: focus panel opens from an author and follows their messages', focusPanelScenario);
test('logged-out live: inbox opens from the chat header', inboxScenario);
test('logged-out live: profile card opens from a chat avatar', profileScenario);
