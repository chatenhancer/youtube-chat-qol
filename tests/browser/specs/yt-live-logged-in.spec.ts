/**
 * Logged-in real YouTube live chat scenarios.
 *
 * These checks may write local draft text but must never press Enter or click
 * YouTube's send button. Add reusable feature checks under
 * `tests/browser/scenarios/`, then include them here when they should run
 * against a logged-in real YouTube chat.
 */
import { attachScenario } from '../scenarios/attach';
import {
  chatCommandAutocompleteScenario,
  chatCommandsExpandAndApplySettingsScenario
} from '../scenarios/chat-commands';
import { chatDraftRecoveryScenario } from '../scenarios/chat-drafts';
import {
  composerTranslationControlsOpenScenario,
  realComposerTranslationScenario
} from '../scenarios/composer-translation';
import { focusPanelOpensFromAuthorScenario } from '../scenarios/focus';
import { frequentEmojiPersistenceScenario } from '../scenarios/frequent-emojis';
import { inboxOpensFromHeaderScenario } from '../scenarios/inbox';
import {
  liteModeLiveSustainedScenario,
  liteModeStoredPreferenceReloadScenario,
  liteModeTranslationContinuityScenario
} from '../scenarios/lite-mode';
import { liteModeLiveNativeSurfacesScenario } from '../scenarios/lite-mode-native-surfaces';
import {
  authorQuoteDraftScenario,
  authorMentionDraftScenario,
  mentionMenuDraftScenario,
  quoteMenuDraftScenario
} from '../scenarios/message-actions';
import { markedUserMessageMenuScenario } from '../scenarios/marked-users';
import { realReplacedTranslationToggleScenario } from '../scenarios/message-translation';
import { settingsMenuScenario } from '../scenarios/menus';
import { profileCardRecentMessagesScenario } from '../scenarios/profile';
import { loggedInLiveTest as test } from '../support/scenario-fixtures';

test('logged-in live: extension attaches and current tab action reports connected status', attachScenario);
test('logged-in live: mark user from message menu persists and shows avatar ring', markedUserMessageMenuScenario);
test('logged-in live: mention menu action writes a draft only', mentionMenuDraftScenario);
test('logged-in live: quote menu action writes a draft only', quoteMenuDraftScenario);
test('logged-in live: chat settings menu receives extension controls', settingsMenuScenario);
test('logged-in live: replaced translations toggle from the inline icon', realReplacedTranslationToggleScenario);
test('logged-in live: focus panel opens from an author and follows their messages', focusPanelOpensFromAuthorScenario);
test('logged-in live: inbox opens from the chat header', inboxOpensFromHeaderScenario);
test('logged-in live: Lite mode keeps receiving after the native feed is discarded', liteModeLiveSustainedScenario);
test('logged-in live: stored Lite mode preserves history across a tab reload', liteModeStoredPreferenceReloadScenario);
test('logged-in live: Lite mode preserves Participants and mirrors native Timestamps', liteModeLiveNativeSurfacesScenario);
test('logged-in live: enabled translations carry from native history into Lite mode', liteModeTranslationContinuityScenario);
test('logged-in live: profile card opens from a chat avatar', profileCardRecentMessagesScenario);
test('logged-in live: composer translation controls open', composerTranslationControlsOpenScenario);
test('logged-in live: composer translation translates draft text with real Google Translate', realComposerTranslationScenario);
test('logged-in live: unsent chat draft is restored after refresh', chatDraftRecoveryScenario);
test('logged-in live: frequent emojis are tracked, rendered, and persisted', frequentEmojiPersistenceScenario);
test('logged-in live: chat commands expand and apply settings', chatCommandsExpandAndApplySettingsScenario);
test('logged-in live: chat command autocomplete suggests names and arguments', chatCommandAutocompleteScenario);
test('logged-in live: author click writes a mention draft only', authorMentionDraftScenario);
test('logged-in live: author Alt-click writes a quote draft only', authorQuoteDraftScenario);
