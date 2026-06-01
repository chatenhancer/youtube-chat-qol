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
  /**
   * Either the mock chat page or the real YouTube chat frame.
   */
  chat: ChatSurface;
  /** 
   * The browser context that owns the loaded extension. 
   */
  context: BrowserContext;
}

/**
 * Executes one browser-level behavior check.
 * Test titles and browser surfaces are defined by the plan-case spec files
 * under `tests/browser/specs/`, not on the scenario itself.
 */
export type BrowserScenario = (..._args: [BrowserScenarioSession]) => Promise<void>;
