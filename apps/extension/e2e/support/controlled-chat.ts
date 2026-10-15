/** Surface-neutral controlled chat ingress for deterministic browser scenarios. */
import type { Page } from '@playwright/test';
import { appendMockFixtureMessage, pauseMockFixtureMessages } from './mock-page';

export interface ControlledChatMessage {
  author: string;
  avatarUrl?: string;
  badges?: ('member' | 'verified')[];
  channel?: string;
  text: string;
}

export interface ControlledChatDelivery {
  deliveredIds: string[];
  durationMs: number;
}

export interface ControlledChat {
  injectMessage: (_message: ControlledChatMessage) => Promise<string>;
  injectMessages: (_messages: ControlledChatMessage[]) => Promise<ControlledChatDelivery>;
}

export function createMockControlledChat(page: Page): ControlledChat {
  return {
    async injectMessage(message) {
      await pauseMockFixtureMessages(page);
      const messageId = await appendMockFixtureMessage(page, message);
      if (!messageId) throw new Error('The mock chat did not append the controlled message.');
      return messageId;
    },

    async injectMessages(messages) {
      await pauseMockFixtureMessages(page);
      const startedAt = performance.now();
      const deliveredIds: string[] = [];
      for (const message of messages) {
        const messageId = await appendMockFixtureMessage(page, message);
        if (!messageId) throw new Error('The mock chat did not append a controlled message.');
        deliveredIds.push(messageId);
      }
      return {
        deliveredIds,
        durationMs: performance.now() - startedAt
      };
    }
  };
}

export function requireControlledChat(
  controlledChat: ControlledChat | undefined
): ControlledChat {
  if (!controlledChat) {
    throw new Error('This scenario requires a chat surface with controlled incoming messages.');
  }
  return controlledChat;
}
