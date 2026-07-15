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

export async function pauseMockFixtureMessages(chat: ChatSurface): Promise<void> {
  if (!isMockPageSurface(chat)) {
    throw new Error('pauseMockFixtureMessages can only run against the mock chat page.');
  }

  await chat.evaluate(() => {
    const pauseMessages = (window as typeof window & {
      ytcqPauseFixtureMessages?: () => void;
    }).ytcqPauseFixtureMessages;
    if (!pauseMessages) {
      throw new Error('The mock chat fixture did not expose ytcqPauseFixtureMessages.');
    }
    pauseMessages();
  });
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
      }) => Promise<string | null> | string | null;
    }).ytcqAppendFixtureMessage;
    return appendMessage?.(nextMessage) || null;
  }, message);
}

export async function emitMockFixtureFeedMessage(
  chat: ChatSurface,
  message: {
    author: string;
    channel?: string;
    text: string;
  }
): Promise<string | null> {
  if (!isMockPageSurface(chat)) {
    throw new Error('emitMockFixtureFeedMessage can only run against the mock chat page.');
  }

  return chat.evaluate((nextMessage) => {
    const emitMessage = (window as typeof window & {
      ytcqEmitFixtureFeedMessage?: (_message: {
        author: string;
        channel?: string;
        text: string;
      }) => Promise<string | null> | string | null;
    }).ytcqEmitFixtureFeedMessage;
    return emitMessage?.(nextMessage) || null;
  }, message);
}

export async function prefetchMockReplayFixtureMessage(
  chat: ChatSurface,
  message: {
    author: string;
    channel?: string;
    text: string;
  },
  replayOffsetMs: number
): Promise<string | null> {
  if (!isMockPageSurface(chat)) {
    throw new Error('prefetchMockReplayFixtureMessage can only run against the mock replay page.');
  }

  return chat.evaluate(({ nextMessage, offsetMs }) => {
    const prefetchMessage = (window as typeof window & {
      ytcqPrefetchFixtureReplayMessage?: (
        _message: {
          author: string;
          channel?: string;
          text: string;
        },
        _replayOffsetMs: number
      ) => Promise<string | null> | string | null;
    }).ytcqPrefetchFixtureReplayMessage;
    return prefetchMessage?.(nextMessage, offsetMs) || null;
  }, { nextMessage: message, offsetMs: replayOffsetMs });
}

export async function setMockReplayPlayerProgress(
  chat: ChatSurface,
  seconds: number
): Promise<void> {
  if (!isMockPageSurface(chat)) {
    throw new Error('setMockReplayPlayerProgress can only run against the mock replay page.');
  }

  await chat.evaluate((nextSeconds) => {
    const setProgress = (window as typeof window & {
      ytcqSetFixturePlayerProgress?: (_seconds: number) => void;
    }).ytcqSetFixturePlayerProgress;
    setProgress?.(nextSeconds);
  }, seconds);
}
