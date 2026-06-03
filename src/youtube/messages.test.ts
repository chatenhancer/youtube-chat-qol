import { describe, expect, it } from 'vitest';
import {
  getAuthorName,
  getAuthorChannelId,
  getMessageAvatarSrc,
  getMessageContentNodes,
  getMessageRuns,
  getMessageStableId,
  getMessageText,
  getMessageTimestampText,
  getStoredOriginalMessage,
  rememberOriginalMessageText,
  restoreReplacedTranslation
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

  it('uses renderer fallbacks for message text, channel ids, avatars, runs, and stable ids', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer') as HTMLElement & {
      __data?: {
        data?: {
          authorChannelId?: string;
          authorName?: { simpleText: string };
          messageText?: { runs: { emoji?: { emojiId?: string }; text?: string }[] };
        };
      };
    };
    message.__data = {
      data: {
        authorChannelId: 'fallback-channel',
        authorName: { simpleText: '@FallbackUser' },
        messageText: {
          runs: [
            { text: 'hello ' },
            { emoji: { emojiId: ':wave:' } }
          ]
        }
      }
    };
    message.id = 'dom-message-id';
    message.innerHTML = `
      <span id="author-name">@WrongDomUser</span>
      <span id="author-photo"><img id="img" src="https://yt3.example/avatar.png"></span>
      <span id="message">wrong dom text</span>
    `;

    expect(getAuthorName(message)).toBe('@FallbackUser');
    expect(getAuthorChannelId(message)).toBe('fallback-channel');
    expect(getMessageAvatarSrc(message)).toBe('https://yt3.example/avatar.png');
    expect(getMessageRuns(message)).toEqual(message.__data.data?.messageText?.runs);
    expect(getMessageText(message)).toBe('hello :wave:');
    expect(getMessageStableId(message)).toBe('dom-message-id');
  });

  it('falls back to data-message-id and formatted local time when renderer values are missing', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');
    message.setAttribute('data-message-id', 'attribute-message-id');

    expect(getMessageStableId(message)).toBe('attribute-message-id');
    expect(getMessageTimestampText(message, new Date('2026-06-03T12:34:00Z').getTime())).toMatch(/\d/);
  });

  it('remembers and restores replaced message content, attributes, and original text', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');
    const messageText = document.createElement('span');
    messageText.id = 'message';
    messageText.className = 'original-class';
    messageText.lang = 'es';
    messageText.title = 'original title';
    messageText.append('Hola ', document.createElement('strong'));
    message.append(messageText);

    rememberOriginalMessageText(message, messageText, 'Hola mundo');
    rememberOriginalMessageText(message, messageText, 'Ignored later original');
    message.classList.add('ytcq-translation-replaced');
    message.dataset.ytcqReplacedTranslation = 'true';
    messageText.className = 'ytcq-translation-replaced-text';
    messageText.lang = 'en';
    messageText.title = 'translated title';
    messageText.replaceChildren('Hello world');

    expect(getMessageText(message)).toBe('Hola mundo');
    expect(getMessageContentNodes(message)).toHaveLength(2);

    restoreReplacedTranslation(message);

    expect(messageText.className).toBe('original-class');
    expect(messageText.lang).toBe('es');
    expect(messageText.title).toBe('original title');
    expect(messageText.textContent).toBe('Hola ');
    expect(message.classList.contains('ytcq-translation-replaced')).toBe(false);
    expect(message.dataset.ytcqReplacedTranslation).toBeUndefined();
    expect(getStoredOriginalMessage(message)?.originalText).toBe('Hola mundo');
  });

  it('removes replacement affordances when no original snapshot exists', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');
    message.classList.add('ytcq-translation-replaced');
    message.dataset.ytcqReplacedTranslation = 'true';
    message.innerHTML = `
      <span id="message" class="ytcq-translation-replaced-text">
        <span class="ytcq-replaced-translation-icon"></span>
        Hello world
      </span>
    `;

    restoreReplacedTranslation(document.createTextNode('not an element') as unknown as Element);
    restoreReplacedTranslation(message);

    expect(message.querySelector('#message')?.classList.contains('ytcq-translation-replaced-text')).toBe(false);
    expect(message.querySelector('.ytcq-replaced-translation-icon')).toBeNull();
    expect(message.classList.contains('ytcq-translation-replaced')).toBe(false);
    expect(message.dataset.ytcqReplacedTranslation).toBeUndefined();
  });
});
