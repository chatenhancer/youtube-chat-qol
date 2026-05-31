/**
 * Logged-in real YouTube live chat scenarios.
 *
 * These checks may write local draft text but must never press Enter or click
 * YouTube's send button. Add reusable feature checks under
 * `tests/browser/scenarios/`, then include them here when they should run
 * against a logged-in real YouTube chat.
 */
import { attachScenario } from '../../scenarios/attach';
import { chatCommandsSmokeScenario } from '../../scenarios/chat-commands';
import {
  composerTranslationScenario,
  realComposerTranslationScenario
} from '../../scenarios/composer-translation';
import { focusPanelScenario } from '../../scenarios/focus';
import { frequentEmojiSmokeScenario } from '../../scenarios/frequent-emojis';
import { inboxScenario } from '../../scenarios/inbox';
import {
  authorMentionDraftScenario,
  mentionMenuDraftScenario,
  quoteMenuDraftScenario
} from '../../scenarios/message-actions';
import { settingsMenuScenario } from '../../scenarios/menus';
import { profileScenario } from '../../scenarios/profile';
import { loggedInLiveTest as test } from '../scenario-fixtures';

test('logged-in live: Extension attaches and popup reports active status', attachScenario);
test('logged-in live: Mention menu action writes a draft only', mentionMenuDraftScenario);
test('logged-in live: Quote menu action writes a draft only', quoteMenuDraftScenario);
test('logged-in live: Chat settings menu receives extension controls', settingsMenuScenario);
test('logged-in live: Focus panel opens from an author and follows their messages', focusPanelScenario);
test('logged-in live: Inbox opens from the chat header', inboxScenario);
test('logged-in live: Profile card opens from a chat avatar', profileScenario);
test('logged-in live: Composer translation controls open', composerTranslationScenario);
test('logged-in live: Composer translation translates draft text with real Google Translate', realComposerTranslationScenario);
test('logged-in live: Frequent emojis are tracked and rendered', frequentEmojiSmokeScenario);
test('logged-in live: Chat commands expand in the composer', chatCommandsSmokeScenario);
test('logged-in live: Author click writes a mention draft only', authorMentionDraftScenario);
