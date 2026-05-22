/**
 * Shared selectors for chat message renderers the extension supports.
 */
export const CHAT_MESSAGE_SELECTOR = [
  'yt-live-chat-text-message-renderer',
  'yt-live-chat-paid-message-renderer',
  'yt-live-chat-membership-item-renderer'
].join(',');

export const CHAT_TOOLTIP_SELECTOR = [
  '[role="tooltip"]',
  'tp-yt-paper-tooltip',
  'yt-tooltip'
].join(',');

export const PARTICIPANT_SELECTOR = 'yt-live-chat-participant-renderer';
