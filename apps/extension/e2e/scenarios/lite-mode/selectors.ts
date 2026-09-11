/** Shared Lite mode and native YouTube selectors. */
export const LITE_DOCUMENT_MARKER_ATTRIBUTE = 'data-ytcq-test-lite-document';
export const LITE_NATIVE_DISCARDED_ATTRIBUTE = 'data-ytcq-lite-native-discarded';
export const LITE_NATIVE_RESTORE_SELECTOR = '#ytcq-lite-native-restore';
export const LITE_ROOT_SELECTOR = '.ytcq-lite-root';
export const LITE_SESSION_COOLDOWN_KEY = 'ytcqLiteModeSessionCooldown:v1';
export const NATIVE_LIST_SELECTOR = 'yt-live-chat-item-list-renderer, #chat > #item-list';
export const NATIVE_MESSAGE_SELECTOR = [
  'yt-gift-message-view-model',
  'yt-live-chat-membership-item-renderer',
  'yt-live-chat-paid-message-renderer',
  'yt-live-chat-paid-sticker-renderer',
  'yt-live-chat-sponsorships-gift-purchase-announcement-renderer',
  'yt-live-chat-sponsorships-gift-redemption-announcement-renderer',
  'yt-live-chat-text-message-renderer'
].join(',');
export const PARTICIPANT_LIST_SELECTOR = 'yt-live-chat-participant-list-renderer';
