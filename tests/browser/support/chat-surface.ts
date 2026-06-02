/**
 * Shared Playwright handle for a YouTube chat surface.
 *
 * Mock tests exercise a top-level fixture page, while real YouTube tests
 * exercise the live chat iframe through a FrameLocator. Scenario helpers should
 * accept either surface when the DOM selectors are the same.
 */
import type { FrameLocator, Page } from '@playwright/test';

export const NORMAL_CHAT_MESSAGE_SELECTOR = [
  'yt-live-chat-text-message-renderer:not([in-banner])',
  ':not([in-collapsed-banner])',
  ':not([author-is-owner])'
].join('');

export type ChatSurface = FrameLocator | Page;
