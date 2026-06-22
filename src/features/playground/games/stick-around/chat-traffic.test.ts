import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStickAroundChatTrafficObserver, type StickAroundChatTrafficObserver } from './chat-traffic';

describe('Stick Around chat traffic observer', () => {
  let observer: StickAroundChatTrafficObserver | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });

  afterEach(() => {
    observer?.close();
    observer = null;
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it('refreshes late message text without counting the same row twice', () => {
    const observations: Array<{ count: number; messageIds: string[] }> = [];
    observer = createStickAroundChatTrafficObserver((observation) => {
      observations.push({
        count: observation.count,
        messageIds: observation.messageIds
      });
    });
    const message = createMessage('message-1', 'first text');

    document.body.append(message);
    observer.recordMessage(message, true);
    vi.advanceTimersByTime(1_000);

    expect(observations).toEqual([{
      count: 1,
      messageIds: ['message-1']
    }]);
    expect(observer.getMessageTexts().get('message-1')).toBe('first text');

    message.querySelector<HTMLElement>('#message')!.textContent = 'late text';
    observer.refresh();
    vi.advanceTimersByTime(1_000);

    expect(observations).toHaveLength(1);
    expect(observer.getMessageTexts().get('message-1')).toBe('late text');
  });

  it('caches rich message segments for custom emoji bubble rendering', () => {
    observer = createStickAroundChatTrafficObserver(vi.fn());
    const message = createMessage('message-emoji', 'hello ');
    const emoji = document.createElement('img');
    emoji.alt = ':party:';
    emoji.src = 'https://example.test/party.png';
    emoji.setAttribute('data-emoji-id', 'party-id');
    message.querySelector<HTMLElement>('#message')!.append(emoji, document.createTextNode(' chat'));

    observer.recordMessage(message, true);

    expect(observer.getMessageTexts().get('message-emoji')).toBe('hello :party: chat');
    expect(observer.getMessageRichTextSegments().get('message-emoji')).toEqual([
      {
        text: 'hello ',
        type: 'text'
      },
      {
        alt: ':party:',
        className: '',
        emojiId: 'party-id',
        src: 'https://example.test/party.png',
        tooltip: '',
        type: 'emoji'
      },
      {
        text: ' chat',
        type: 'text'
      }
    ]);
  });

  it('clears pending traffic when reset without clearing cached message text', () => {
    const observations: Array<{ count: number; messageIds: string[] }> = [];
    observer = createStickAroundChatTrafficObserver((observation) => {
      observations.push({
        count: observation.count,
        messageIds: observation.messageIds
      });
    });
    const message = createMessage('message-1', 'countdown text');
    document.body.append(message);
    observer.recordMessage(message, true);

    observer.reset();
    vi.advanceTimersByTime(1_000);

    expect(observations).toEqual([]);
    expect(observer.getMessageTexts().get('message-1')).toBe('countdown text');
  });
});

function createMessage(messageId: string, text: string): HTMLElement {
  const message = document.createElement('yt-live-chat-text-message-renderer');
  message.setAttribute('data-message-id', messageId);
  message.innerHTML = `<span id="message">${text}</span>`;
  return message;
}
