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

export const CHAT_SCROLLER_SELECTOR = [
  'yt-live-chat-item-list-renderer #item-scroller',
  'yt-live-chat-renderer #item-scroller',
  '#item-scroller'
].join(',');

export const PANEL_PAGES_SELECTOR = 'tp-yt-iron-pages#panel-pages';

export const SEND_BUTTON_SELECTOR = [
  '#send-button',
  '#send-button button',
  'yt-button-renderer#send-button',
  'yt-icon-button#send-button',
  'button[aria-label="Send"]',
  'button[title="Send"]'
].join(',');
