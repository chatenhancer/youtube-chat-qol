/**
 * Logged-in real YouTube live chat replay scenario.
 *
 * This checks the extension against a real YouTube replay iframe where there
 * is no composer, but read-only chat features should still attach.
 */
import { attachScenario } from '../scenarios/attach';
import { focusPanelOpensFromAuthorScenario } from '../scenarios/focus';
import { inboxOpensFromHeaderScenario } from '../scenarios/inbox';
import { liteModeToggleAndRestoreScenario } from '../scenarios/lite-mode';
import {
  liteModeAeroBehaviorScenario,
  liteModeReplayRapidSeekScenario
} from '../scenarios/lite-mode-native-surfaces';
import { markedUserMessageMenuScenario } from '../scenarios/marked-users';
import { mockedMessageTranslationScenario } from '../scenarios/message-translation';
import { messageMenuScenario, settingsMenuScenario } from '../scenarios/menus';
import { profileCardRecentMessagesScenario } from '../scenarios/profile';
import { loggedInLiveReplayTest as test } from '../support/scenario-fixtures';

test(
  'logged-in live replay: extension attaches and current tab action reports connected status',
  attachScenario
);
test('logged-in live replay: chat settings menu receives extension controls', settingsMenuScenario);
test(
  'logged-in live replay: message context menu receives mark, quote, and mention actions',
  messageMenuScenario
);
test(
  'logged-in live replay: mark user from message menu persists and shows avatar ring',
  markedUserMessageMenuScenario
);
test('logged-in live replay: incoming chat messages are translated', mockedMessageTranslationScenario);
test(
  'logged-in live replay: focus panel opens from an author and follows their messages',
  focusPanelOpensFromAuthorScenario
);
test('logged-in live replay: inbox opens from the chat header', inboxOpensFromHeaderScenario);
test(
  'logged-in live replay: Lite mode toggles on, renders readable messages, and restores native chat',
  liteModeToggleAndRestoreScenario
);
test(
  'logged-in live replay: Lite Aero keeps its skin, readable rows, and header control',
  liteModeAeroBehaviorScenario
);
test(
  'logged-in live replay: Lite chat recovers after rapid progress-bar seeking',
  liteModeReplayRapidSeekScenario
);
test(
  'logged-in live replay: profile card opens from a chat avatar',
  profileCardRecentMessagesScenario
);
