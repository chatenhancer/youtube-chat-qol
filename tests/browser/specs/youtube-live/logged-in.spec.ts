/**
 * Logged-in real YouTube live chat scenarios.
 *
 * These checks may write local draft text but must never press Enter or click
 * YouTube's send button. Add reusable feature checks under
 * `tests/browser/scenarios/`, then include them here when they should run
 * against a logged-in real YouTube chat.
 */
import { attachScenario } from '../../scenarios/attach';
import {
  chatCommandAutocompleteScenario,
  chatCommandsSmokeScenario
} from '../../scenarios/chat-commands';
import { chatDraftRecoveryScenario } from '../../scenarios/chat-drafts';
import {
  composerTranslationScenario,
  realComposerTranslationScenario
} from '../../scenarios/composer-translation';
import { focusPanelScenario } from '../../scenarios/focus';
import { frequentEmojiSmokeScenario } from '../../scenarios/frequent-emojis';
import { inboxScenario } from '../../scenarios/inbox';
import {
  authorQuoteDraftScenario,
  authorMentionDraftScenario,
  mentionMenuDraftScenario,
  quoteMenuDraftScenario
} from '../../scenarios/message-actions';
import { settingsMenuScenario } from '../../scenarios/menus';
import { profileScenario } from '../../scenarios/profile';
import { loggedInLiveTest as test } from '../scenario-fixtures';

test('logged-in live: extension attaches and popup reports active status', attachScenario);
test('logged-in live: mention menu action writes a draft only', mentionMenuDraftScenario);
test('logged-in live: quote menu action writes a draft only', quoteMenuDraftScenario);
test('logged-in live: chat settings menu receives extension controls', settingsMenuScenario);
test('logged-in live: focus panel opens from an author and follows their messages', focusPanelScenario);
test('logged-in live: inbox opens from the chat header', inboxScenario);
test('logged-in live: profile card opens from a chat avatar', profileScenario);
test('logged-in live: composer translation controls open', composerTranslationScenario);
test('logged-in live: composer translation translates draft text with real Google Translate', realComposerTranslationScenario);
test('logged-in live: unsent chat draft is restored after refresh', chatDraftRecoveryScenario);
test('logged-in live: frequent emojis are tracked and rendered', frequentEmojiSmokeScenario);
test('logged-in live: chat commands expand in the composer', chatCommandsSmokeScenario);
test('logged-in live: chat command autocomplete suggests names and arguments', chatCommandAutocompleteScenario);
test('logged-in live: author click writes a mention draft only', authorMentionDraftScenario);
test('logged-in live: author Alt-click writes a quote draft only', authorQuoteDraftScenario);
