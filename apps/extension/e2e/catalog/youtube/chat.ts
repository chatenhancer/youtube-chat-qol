import { attachScenario } from '../../scenarios/attach';
import { bookmarkMessageButtonScenario } from '../../scenarios/bookmarks';
import {
  chatCommandAutocompleteScenario,
  chatCommandsExpandAndApplySettingsScenario
} from '../../scenarios/chat-commands';
import { chatDraftRecoveryScenario } from '../../scenarios/chat-drafts';
import { frequentEmojiPersistenceScenario } from '../../scenarios/frequent-emojis';
import {
  authorMentionDraftScenario,
  authorQuoteDraftScenario,
  mentionMenuDraftScenario,
  quoteMenuDraftScenario
} from '../../scenarios/message-actions';
import {
  messageMenuScenario,
  nativeMenuStacksAboveExtensionPanelScenario,
  settingsMenuButtonTargetScenario,
  settingsMenuScenario
} from '../../scenarios/menus';
import { settingsMenuBehaviorScenario } from '../../scenarios/settings';
import { compactMessageDensityScenario } from '../../scenarios/message-density';
import {
  youtubeScenarioPairs as pair,
  youtubeScenarioTargets as target,
  type YouTubeScenario
} from './model';

const sharedLoggedInLive = pair.liveLoggedIn;
const menuSurfaces = [
  ...pair.liveLoggedIn,
  ...pair.replayLoggedIn
] as const;

export const chatScenarios: readonly YouTubeScenario[] = [
  {
    title: 'Compact message density combines with themes without changing typography',
    run: compactMessageDensityScenario,
    on: pair.liveLoggedIn
  },
  {
    title: 'chat settings menu receives extension controls',
    run: settingsMenuScenario,
    on: pair.replayLoggedIn
  },
  {
    title: 'chat settings menu toggles persist options',
    run: settingsMenuBehaviorScenario,
    on: [...pair.liveLoggedIn, ...pair.liveLoggedOut]
  },
  {
    title: 'chat settings open from the button inside a wider header control',
    run: settingsMenuButtonTargetScenario,
    on: [target.mockLiveLoggedOut],
    reason: 'Requires deterministic header geometry with the button away from its container center.'
  },
  {
    title: 'native YouTube menus appear above extension panels',
    run: nativeMenuStacksAboveExtensionPanelScenario,
    on: [target.mockLiveLoggedOut],
    reason: 'Requires deterministic overlapping panel and menu geometry.'
  },
  {
    title: 'message context menu receives quote and mention actions without Save',
    run: messageMenuScenario,
    on: pair.replayLoggedIn
  },
  {
    title: 'saved message persists and appears in Bookmarks',
    run: bookmarkMessageButtonScenario,
    on: menuSurfaces
  },
  {
    title: 'mention menu action writes a draft only',
    run: mentionMenuDraftScenario,
    on: pair.liveLoggedIn
  },
  {
    title: 'quote menu action writes a draft only',
    run: quoteMenuDraftScenario,
    on: pair.liveLoggedIn
  },
  {
    title: 'author click writes a mention draft only',
    run: authorMentionDraftScenario,
    on: sharedLoggedInLive
  },
  {
    title: 'author Alt-click writes a quote draft only',
    run: authorQuoteDraftScenario,
    on: sharedLoggedInLive
  },
  {
    title: 'unsent chat draft is restored after refresh',
    run: chatDraftRecoveryScenario,
    on: sharedLoggedInLive
  },
  {
    title: 'frequent emojis are tracked, rendered, and persisted',
    run: frequentEmojiPersistenceScenario,
    on: sharedLoggedInLive
  },
  {
    title: 'chat commands expand and apply settings',
    run: chatCommandsExpandAndApplySettingsScenario,
    on: sharedLoggedInLive
  },
  {
    title: 'chat command autocomplete suggests names and arguments',
    run: chatCommandAutocompleteScenario,
    on: sharedLoggedInLive
  },
  {
    title: 'extension attaches and current tab action reports connected status',
    run: attachScenario,
    on: [...pair.liveLoggedIn, ...pair.liveLoggedOut]
  }
];
