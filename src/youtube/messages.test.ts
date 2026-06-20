import { describe, expect, it } from 'vitest';
import {
  getAuthorName,
  getAuthorChannelId,
  getMessageAvatarSrc,
  getMessageContentNodes,
  getMessageStableId,
  getMessageText,
  getMessageTimestampText,
  getStoredOriginalMessage,
  rememberOriginalMessageText,
  restoreReplacedTranslation
} from './messages';

describe('YouTube message adapter fixtures', () => {
  it('extracts clean authors and text from visible DOM', () => {
    const message = document.createElement('yt-live-chat-paid-message-renderer');
    message.id = 'message-1';
    message.innerHTML = `
      <span id="author-name">@ExampleCreator <span>Verified</span></span>
      <span id="message">Saltamonte es el jefe</span>
    `;

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

  it('uses visible membership DOM only', () => {
    const message = document.createElement('yt-live-chat-membership-item-renderer');
    message.innerHTML = `
      <span id="author-name">@NewMember</span>
      <span id="message">New member</span>
    `;

    expect(getAuthorName(message)).toBe('@NewMember');
    expect(getMessageText(message)).toBe('New member');
    expect(getMessageStableId(message)).toBe('');
  });

  it('reads timestamp text from YouTube timestamp nodes', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');
    message.innerHTML = '<span id="timestamp"> 10:05 PM </span>';

    expect(getMessageTimestampText(message)).toBe('10:05 PM');
  });

  it('uses DOM fallbacks for message text, channel ids, avatars, and stable ids', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');
    message.id = 'dom-message-id';
    message.innerHTML = `
      <a href="https://www.youtube.com/channel/dom-channel"><span id="author-name">@DomUser</span></a>
      <span id="author-photo"><img id="img" src="https://yt3.example/avatar.png"></span>
      <span id="message">DOM text</span>
    `;

    expect(getAuthorName(message)).toBe('@DomUser');
    expect(getAuthorChannelId(message)).toBe('dom-channel');
    expect(getMessageAvatarSrc(message)).toBe('https://yt3.example/avatar.png');
    expect(getMessageText(message)).toBe('DOM text');
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
