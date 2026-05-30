import { describe, expect, it } from 'vitest';
import {
  getAuthorName,
  getMessageStableId,
  getMessageText,
  getMessageTimestampText
} from './messages';

describe('YouTube message adapter fixtures', () => {
  it('extracts clean authors and text from verified superchat-like renderers', () => {
    const message = document.createElement('yt-live-chat-paid-message-renderer') as HTMLElement & {
      data?: {
        authorExternalChannelId?: string;
        authorName?: { runs: { text: string }[] };
        id?: string;
        message?: { runs: { text?: string }[] };
      };
    };
    message.data = {
      authorExternalChannelId: 'channel-1',
      authorName: {
        runs: [
          { text: '@ExampleCreator' },
          { text: ' Verified' }
        ]
      },
      id: 'message-1',
      message: {
        runs: [{ text: 'Saltamonte es el jefe' }]
      }
    };

    expect(getAuthorName(message)).toBe('@ExampleCreator');
    expect(getMessageText(message)).toBe('Saltamonte es el jefe');
    expect(getMessageStableId(message)).toBe('message-1');
  });

  it('reads emoji-only DOM messages from image alt text', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');
    message.innerHTML = `
      <span id="author-name">@ExampleUser</span>
      <span id="message"><img alt=":face-orange-biting-nails:"></span>
    `;

    expect(getMessageText(message)).toBe(':face-orange-biting-nails:');
  });

  it('falls back to header subtext runs for membership-style renderers', () => {
    const message = document.createElement('yt-live-chat-membership-item-renderer') as HTMLElement & {
      data?: {
        authorName?: { simpleText: string };
        headerSubtext?: { runs: { text?: string }[] };
        timestampUsec?: string;
      };
    };
    message.data = {
      authorName: { simpleText: '@NewMember' },
      headerSubtext: { runs: [{ text: 'New member' }] },
      timestampUsec: '123456789'
    };

    expect(getAuthorName(message)).toBe('@NewMember');
    expect(getMessageText(message)).toBe('New member');
    expect(getMessageStableId(message)).toBe('timestamp-usec:123456789:@NewMember');
  });

  it('reads timestamp text from YouTube timestamp nodes', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');
    message.innerHTML = '<span id="timestamp"> 10:05 PM </span>';

    expect(getMessageTimestampText(message)).toBe('10:05 PM');
  });
});
