/**
 * Shared browser scenario types.
 *
 * A scenario is one feature-level browser check that can run against either
 * the deterministic YouTube fixture or a real YouTube live chat frame.
 */
import type { BrowserContext } from '@playwright/test';
import type { ChatSurface } from '../helpers/chat-surface';

export type { ChatSurface };
export const NORMAL_CHAT_MESSAGE_SELECTOR = [
  'yt-live-chat-text-message-renderer:not([in-banner])',
  ':not([in-collapsed-banner])',
  ':not([author-is-owner])'
].join('');

export interface BrowserScenarioSession {
  chat: ChatSurface;
  context: BrowserContext;
}

export interface BrowserScenario {
  name: string;
  run: (..._args: [BrowserScenarioSession]) => Promise<void>;
}
