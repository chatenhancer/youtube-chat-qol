import { describe, expect, it } from 'vitest';
import type { MessageRecord } from '../user-message-history';
import {
  createProfileMessagePager,
  PROFILE_MESSAGE_PAGE_SIZE
} from './history-pager';

describe('profile message pager', () => {
  it('starts with the latest batch and loads older messages upward', () => {
    const pager = createProfileMessagePager();
    pager.updateMessages(records(30), { followLatest: true });

    expect(ids(pager.getVisibleMessages())).toEqual(range(18, 30));
    expect(pager.hasEarlier()).toBe(true);
    expect(pager.hasLater()).toBe(false);

    expect(pager.loadEarlier()).toBe(true);
    expect(ids(pager.getVisibleMessages())).toEqual(range(6, 30));
  });

  it('starts around a feed-origin message and loads in both directions', () => {
    const pager = createProfileMessagePager('message-15');
    pager.updateMessages(records(40));

    expect(pager.getVisibleMessages()).toHaveLength(PROFILE_MESSAGE_PAGE_SIZE);
    expect(ids(pager.getVisibleMessages())).toEqual(range(9, 21));
    expect(pager.getOriginRecordId()).toBe(16);
    expect(pager.hasEarlier()).toBe(true);
    expect(pager.hasLater()).toBe(true);

    expect(pager.loadEarlier()).toBe(true);
    expect(ids(pager.getVisibleMessages())).toEqual(range(0, 21));
    expect(pager.loadLater()).toBe(true);
    expect(ids(pager.getVisibleMessages())).toEqual(range(0, 33));
  });

  it('follows new messages only when the profile is at its latest edge', () => {
    const pager = createProfileMessagePager();
    pager.updateMessages(records(20), { followLatest: true });
    expect(ids(pager.getVisibleMessages())).toEqual(range(8, 20));

    pager.updateMessages(records(21), { followLatest: false });
    expect(ids(pager.getVisibleMessages())).toEqual(range(8, 20));
    expect(pager.hasLater()).toBe(true);

    pager.updateMessages(records(22), { followLatest: true });
    expect(ids(pager.getVisibleMessages())).toEqual(range(10, 22));
    expect(pager.hasLater()).toBe(false);
  });

  it('reanchors when a requested origin arrives after initialization', () => {
    const pager = createProfileMessagePager('message-15');
    pager.updateMessages(records(10));
    expect(ids(pager.getVisibleMessages())).toEqual(range(0, 10));
    expect(pager.getOriginRecordId()).toBeNull();

    pager.updateMessages(records(30));
    expect(ids(pager.getVisibleMessages())).toEqual(range(9, 21));
    expect(pager.getOriginRecordId()).toBe(16);
  });
});

function records(count: number): MessageRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    authorName: '@Viewer',
    contentParts: [],
    id: index + 1,
    messageId: `message-${index}`,
    text: `message ${index}`,
    timestamp: index,
    timestampText: String(index)
  }));
}

function ids(messages: readonly MessageRecord[]): number[] {
  return messages.map((message) => Number(message.messageId?.replace('message-', '')));
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_, index) => start + index);
}
