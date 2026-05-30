import { describe, expect, it } from 'vitest';
import { findMatchingLiveMessageRecordIndex, type LiveMessageRecordRef } from './message-dedupe';

interface TestRecord extends LiveMessageRecordRef {
  text: string;
}

describe('live message dedupe', () => {
  it('matches stable YouTube message ids first', () => {
    const records: TestRecord[] = [
      { messageId: 'abc', text: 'first' },
      { messageId: 'def', text: 'second' }
    ];

    expect(findMatchingLiveMessageRecordIndex(records, { messageId: 'def' })).toBe(1);
  });

  it('matches by live renderer reference when ids are unavailable', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');
    document.body.append(message);
    const records: TestRecord[] = [
      { messageRef: new WeakRef(message), text: 'same element' }
    ];

    expect(findMatchingLiveMessageRecordIndex(records, { messageRef: new WeakRef(message) })).toBe(0);
  });

  it('does not collapse repeated identical text when there is no stable identity', () => {
    const first = document.createElement('yt-live-chat-text-message-renderer');
    const second = document.createElement('yt-live-chat-text-message-renderer');
    document.body.append(first, second);
    const records: TestRecord[] = [
      { messageRef: new WeakRef(first), text: 'same text' }
    ];

    expect(findMatchingLiveMessageRecordIndex(records, { messageRef: new WeakRef(second) })).toBe(-1);
  });
});
