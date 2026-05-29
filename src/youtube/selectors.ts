/**
 * Shared YouTube DOM selectors used across feature boundaries.
 *
 * Selectors that are owned by one feature or one adapter should stay beside
 * that code. This file is for selectors that define common YouTube surfaces
 * such as chat messages, participants, and tooltips.
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
