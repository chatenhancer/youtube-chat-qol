import { bookmarkPopupRenderingScenario } from '../../scenarios/bookmarks';
import {
  bookmarkReplayLinkScenario,
  liteBookmarkReplayLinkScenario
} from '../../scenarios/bookmarks-replay';
import { delayedChatPanelNavigationScenario } from '../../scenarios/navigation';
import { inboxStaysOpenOnWatchPageClickScenario } from '../../scenarios/inbox';
import { nativeContinuationRendererScenario } from '../../scenarios/native-renderer';
import { popupResetScenario } from '../../scenarios/popup-reset';
import {
  interceptedFocusSendRestoresMentionScenario,
  interceptedNativeSendScenario,
  interceptedSendClearsStoredDraftScenario,
  interceptedTranslatedNativeSendScenario
} from '../../scenarios/safe-send';
import { popupSettingsBehaviorScenario } from '../../scenarios/settings';
import { tabAlertScenario } from '../../scenarios/tab-alert';
import { pictureInPictureLiveScenario, pictureInPictureScenario } from '../../scenarios/picture-in-picture';
import { youtubeScenarioTargets as target, type YouTubeScenario } from './model';

const popupReason =
  'Exercises extension-popup state against isolated deterministic storage rather than a YouTube chat surface.';
const interceptedSendReason =
  'Requires a locally intercepted YouTube send response without posting a real message.';

export const targetSpecificScenarios: readonly YouTubeScenario[] = [
  {
    title: 'video + chat PiP works with native YouTube chat and returns to the player',
    run: pictureInPictureLiveScenario,
    on: [target.liveLoggedOut, target.liveLoggedIn, target.replayLoggedIn],
    reason: 'Checks real YouTube iframe reconnection in a Document PiP window without sending messages.'
  },
  {
    title: 'video + chat PiP preserves playback, drafts, and normal chat sizing',
    run: pictureInPictureScenario,
    on: [target.mockLiveLoggedIn],
    reason: 'Requires a deterministic watch page and a real Document PiP window.'
  },
  {
    title: 'bookmark link seeks to and highlights the saved replay message',
    run: bookmarkReplayLinkScenario,
    on: [target.replayLoggedIn],
    reason: 'Requires a real replay, its message IDs, and a new watch tab opened from Bookmarks.'
  },
  {
    title: 'bookmark link seeks to and highlights the saved replay message in Lite mode',
    run: liteBookmarkReplayLinkScenario,
    on: [target.replayLoggedIn],
    reason: 'Requires a real replay, its message IDs, and a new watch tab opened from Bookmarks.'
  },
  {
    title: 'popup fully renders saved messages and remembered rings',
    run: bookmarkPopupRenderingScenario,
    on: [target.mockLiveLoggedIn],
    reason: popupReason
  },
  {
    title: 'extension popup settings persist options',
    run: popupSettingsBehaviorScenario,
    on: [target.mockLiveLoggedIn],
    reason: popupReason
  },
  {
    title: 'popup reset restores defaults and clears local data',
    run: popupResetScenario,
    on: [target.mockLiveLoggedIn],
    reason: popupReason
  },
  {
    title: 'background tab alert updates title and favicon',
    run: tabAlertScenario,
    on: [target.mockLiveLoggedIn],
    reason: 'Requires forced isolated-world visibility and fixture-owned title/favicon state.'
  },
  {
    title: 'collapsed live chat panel opens after delayed page navigation',
    run: delayedChatPanelNavigationScenario,
    on: [target.mockLiveLoggedOut],
    reason: 'Builds a synthetic delayed top-level watch page and iframe.'
  },
  {
    title: 'YouTube renders an intercepted continuation message',
    run: nativeContinuationRendererScenario,
    on: [target.liveLoggedOut],
    reason: 'Verifies YouTube consumes the intercepted continuation protocol itself.'
  },
  {
    title: 'Inbox stays open when the watch page is clicked',
    run: inboxStaysOpenOnWatchPageClickScenario,
    on: [target.liveLoggedOut],
    reason: 'Requires the real top-level watch page around YouTube\'s chat iframe.'
  },
  {
    title: 'composer send is intercepted and handled without posting',
    run: interceptedNativeSendScenario,
    on: [target.liveLoggedIn],
    reason: interceptedSendReason
  },
  {
    title: 'translated composer text sends only to the local interceptor',
    run: interceptedTranslatedNativeSendScenario,
    on: [target.liveLoggedIn],
    reason: interceptedSendReason
  },
  {
    title: 'intercepted send clears the saved draft',
    run: interceptedSendClearsStoredDraftScenario,
    on: [target.liveLoggedIn],
    reason: interceptedSendReason
  },
  {
    title: 'Focus restores its mention after an intercepted send',
    run: interceptedFocusSendRestoresMentionScenario,
    on: [target.liveLoggedIn],
    reason: interceptedSendReason
  }
];
