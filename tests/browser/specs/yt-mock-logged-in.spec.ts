/**
 * Logged-in mock YouTube browser scenarios.
 *
 * This is the broad deterministic browser suite for composer-capable behavior.
 * Add reusable feature checks under `tests/browser/scenarios/`, then include
 * them here when they should run against the logged-in mock surface.
 */
import { attachScenario } from '../scenarios/attach';
import {
  chatCommandAutocompleteScenario,
  chatCommandsExpandAndApplySettingsScenario
} from '../scenarios/chat-commands';
import { chatDraftRecoveryScenario } from '../scenarios/chat-drafts';
import {
  composerTranslationControlsOpenScenario,
  mockedComposerTranslationProtectedDraftScenario,
  mockedComposerTranslationScenario
} from '../scenarios/composer-translation';
import {
  focusPanelReceivesNewMessagesScenario,
  focusPanelOpensFromAuthorScenario
} from '../scenarios/focus';
import { frequentEmojiPersistenceScenario } from '../scenarios/frequent-emojis';
import {
  inboxDirectMentionScenario,
  inboxOpensFromHeaderScenario,
  inboxRecordCreationAndJumpScenario
} from '../scenarios/inbox';
import {
  mockedMessageTranslationScenario,
  translationDisplayScenario,
  translationSettingsReactScenario
} from '../scenarios/message-translation';
import {
  authorQuoteDraftScenario,
  authorMentionDraftScenario,
  mentionMenuDraftScenario,
  quoteMenuDraftScenario
} from '../scenarios/message-actions';
import {
  messageMenuScenario,
  settingsMenuScenario
} from '../scenarios/menus';
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
import { loggedInMockTest as test } from '../support/scenario-fixtures';

test('logged-in mock: extension attaches and popup reports active status', attachScenario);
test('logged-in mock: message context menu receives quote and mention actions', messageMenuScenario);
test('logged-in mock: mention menu action writes a draft only', mentionMenuDraftScenario);
test('logged-in mock: quote menu action writes a draft only', quoteMenuDraftScenario);
test('logged-in mock: chat settings menu receives extension controls', settingsMenuScenario);
test('logged-in mock: chat settings menu toggles persist options', settingsMenuBehaviorScenario);
test('logged-in mock: extension popup settings persist options', popupSettingsBehaviorScenario);
test('logged-in mock: popup reset restores defaults and clears local data', popupResetScenario);
test('logged-in mock: incoming chat messages are translated', mockedMessageTranslationScenario);
test('logged-in mock: translation display modes render correctly', translationDisplayScenario);
test('logged-in mock: translate chat setting reacts live', translationSettingsReactScenario);
test('logged-in mock: background tab alert updates title and favicon', tabAlertScenario);
test('logged-in mock: focus panel opens from an author and follows their messages', focusPanelOpensFromAuthorScenario);
test('logged-in mock: focus panel receives new messages from the focused author', focusPanelReceivesNewMessagesScenario);
test('logged-in mock: inbox opens from the chat header', inboxOpensFromHeaderScenario);
test('logged-in mock: inbox saves keyword matches, highlights them, and jumps back to chat', inboxRecordCreationAndJumpScenario);
test('logged-in mock: inbox saves direct mentions and highlights them', inboxDirectMentionScenario);
test('logged-in mock: profile card opens from a chat avatar', profileCardRecentMessagesScenario);
test('logged-in mock: profile card receives new messages from the selected author', profileCardReceivesNewMessagesScenario);
test('logged-in mock: composer translation controls open', composerTranslationControlsOpenScenario);
test('logged-in mock: composer translation translates draft text with mocked Google Translate', mockedComposerTranslationScenario);
test('logged-in mock: composer translation preserves mentions and emoji placeholders', mockedComposerTranslationProtectedDraftScenario);
test('logged-in mock: unsent chat draft is restored after refresh', chatDraftRecoveryScenario);
test('logged-in mock: frequent emojis are tracked, rendered, and persisted', frequentEmojiPersistenceScenario);
test('logged-in mock: chat commands expand and apply settings', chatCommandsExpandAndApplySettingsScenario);
test('logged-in mock: chat command autocomplete suggests names and arguments', chatCommandAutocompleteScenario);
test('logged-in mock: author click writes a mention draft only', authorMentionDraftScenario);
test('logged-in mock: author Alt-click writes a quote draft only', authorQuoteDraftScenario);
