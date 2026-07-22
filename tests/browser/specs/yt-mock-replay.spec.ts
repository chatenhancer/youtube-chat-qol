/**
 * Logged-in mock YouTube live chat replay scenario.
 *
 * The deterministic replay fixture verifies read-only chat features on the
 * `live_chat_replay` DOM shape without requiring a composer.
 */
import { attachScenario } from '../scenarios/attach';
import { focusPanelOpensFromAuthorScenario } from '../scenarios/focus';
import {
  inboxOpensFromHeaderScenario,
  inboxReplayPrefetchTimingScenario,
  inboxRecordCreationAndJumpScenario
} from '../scenarios/inbox';
import { liteModeToggleAndRestoreScenario } from '../scenarios/lite-mode';
import { liteModeAeroBehaviorScenario } from '../scenarios/lite-mode-native-surfaces';
import { bookmarkMessageMenuScenario } from '../scenarios/bookmarks';
import {
  mockedMessageTranslationScenario,
  replacedTranslationToggleSurfacesScenario
} from '../scenarios/message-translation';
import { messageMenuScenario, settingsMenuScenario } from '../scenarios/menus';
import {
  playgroundReplayTriviaAnswerScenario,
  playgroundReplayTriviaInviteScenario
} from '../scenarios/playground-games';
import { profileCardRecentMessagesScenario } from '../scenarios/profile';
import { loggedInMockReplayTest as test } from '../support/scenario-fixtures';

test(
  'logged-in mock replay: extension attaches and current tab action reports connected status',
  attachScenario
);
test('logged-in mock replay: chat settings menu receives extension controls', settingsMenuScenario);
test(
  'logged-in mock replay: message context menu receives save, quote, and mention actions',
  messageMenuScenario
);
test(
  'logged-in mock replay: saved message persists and appears in Bookmarks',
  bookmarkMessageMenuScenario
);
test(
  'logged-in mock replay: incoming chat messages are translated',
  mockedMessageTranslationScenario
);
test(
  'logged-in mock replay: replaced translations toggle across chat surfaces',
  replacedTranslationToggleSurfacesScenario
);
test(
  'logged-in mock replay: focus panel opens from an author and follows their messages',
  focusPanelOpensFromAuthorScenario
);
test('logged-in mock replay: inbox opens from the chat header', inboxOpensFromHeaderScenario);
test(
  'logged-in mock replay: inbox saves feed matches and jumps back to chat',
  inboxRecordCreationAndJumpScenario
);
test(
  'logged-in mock replay: inbox waits until prefetched messages reach their video time',
  inboxReplayPrefetchTimingScenario
);
test(
  'logged-in mock replay: Lite mode toggles on, renders readable messages, and restores native chat',
  liteModeToggleAndRestoreScenario
);
test(
  'logged-in mock replay: Lite Aero keeps its skin, readable rows, and header control',
  liteModeAeroBehaviorScenario
);
test(
  'logged-in mock replay: profile card opens from a chat avatar',
  profileCardRecentMessagesScenario
);
test(
  'logged-in mock replay: Playground Games invites a Replay Trivia opponent and opens the panel',
  playgroundReplayTriviaInviteScenario
);
test(
  'logged-in mock replay: Replay Trivia submits one selected answer',
  playgroundReplayTriviaAnswerScenario
);
