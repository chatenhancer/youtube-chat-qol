/**
 * Mock-page helpers for browser scenarios.
 *
 * A few behavior checks are intentionally mock-only because they need fully
 * deterministic page visibility or fixture-controlled incoming messages.
 */
import type { Page } from '@playwright/test';
import type { ChatSurface } from './chat-surface';

export function isMockPageSurface(chat: ChatSurface): chat is Page {
  return 'url' in chat && typeof chat.url === 'function';
}

export async function appendMockFixtureMessage(
  chat: ChatSurface,
  message: {
    author: string;
    channel?: string;
    text: string;
  }
): Promise<string | null> {
  if (!isMockPageSurface(chat)) {
    throw new Error('appendMockFixtureMessage can only run against the mock chat page.');
  }

  return chat.evaluate((nextMessage) => {
    const appendMessage = (window as typeof window & {
      ytcqAppendFixtureMessage?: (_message: {
        author: string;
        channel?: string;
        text: string;
      }) => string | null;
    }).ytcqAppendFixtureMessage;
    return appendMessage?.(nextMessage) || null;
  }, message);
}
