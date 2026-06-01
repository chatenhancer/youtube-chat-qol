import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findRecentUsersByHandle: vi.fn(),
  getLatestMentionInboxRecord: vi.fn(),
  recordVisibleUserMessages: vi.fn(),
  showToast: vi.fn()
}));

vi.mock('../../shared/i18n', () => ({
  t: (key: string) => key
}));

vi.mock('../../shared/toast', () => ({
  showToast: mocks.showToast
}));

vi.mock('../inbox', () => ({
  getLatestMentionInboxRecord: mocks.getLatestMentionInboxRecord
}));

vi.mock('../user-message-history', () => ({
  findRecentUsersByHandle: mocks.findRecentUsersByHandle,
  recordVisibleUserMessages: mocks.recordVisibleUserMessages
}));

import { getLatestMentionFocusUser, getSingleRecentUser } from './recent-users';

describe('recent user command resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves one matching recently seen user', () => {
    const match = createMatch('@ExampleViewer');
    mocks.findRecentUsersByHandle.mockReturnValue([match]);

    expect(getSingleRecentUser('@ExampleViewer')).toBe(match);
    expect(mocks.recordVisibleUserMessages).toHaveBeenCalledOnce();
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('shows an ambiguity toast when a handle matches multiple recent users', () => {
    mocks.findRecentUsersByHandle.mockReturnValue([
      createMatch('@ExampleOne'),
      createMatch('@ExampleTwo')
    ]);

    expect(getSingleRecentUser('@Example')).toBeNull();
    expect(mocks.showToast).toHaveBeenCalledWith('multipleRecentUsersMatch');
  });

  it('creates a fallback user when no recent match exists but a fallback author name is available', () => {
    mocks.findRecentUsersByHandle.mockReturnValue([]);

    expect(getSingleRecentUser('@MissingViewer', { fallbackAuthorName: '  @FallbackViewer  ' }))
      .toMatchObject({
        authorName: '@FallbackViewer',
        identity: { authorName: '@FallbackViewer' },
        latestMessage: {
          authorName: '@FallbackViewer',
          text: ''
        }
      });
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('shows a missing-user toast when a handle cannot be resolved', () => {
    mocks.findRecentUsersByHandle.mockReturnValue([]);

    expect(getSingleRecentUser('@MissingViewer')).toBeNull();
    expect(mocks.showToast).toHaveBeenCalledWith('couldNotFindUser');
  });

  it('focuses the latest mention author when one exists', async () => {
    const match = createMatch('@MentionAuthor');
    mocks.getLatestMentionInboxRecord.mockResolvedValue({ authorName: '@MentionAuthor' });
    mocks.findRecentUsersByHandle.mockReturnValue([match]);

    await expect(getLatestMentionFocusUser()).resolves.toBe(match);
    expect(mocks.findRecentUsersByHandle).toHaveBeenCalledWith('@MentionAuthor');
  });

  it('shows a toast when no recent mention can be used for focus mode', async () => {
    mocks.getLatestMentionInboxRecord.mockResolvedValue(null);

    await expect(getLatestMentionFocusUser()).resolves.toBeNull();
    expect(mocks.showToast).toHaveBeenCalledWith('noRecentMentionToFocus');
    expect(mocks.findRecentUsersByHandle).not.toHaveBeenCalled();
  });
});

function createMatch(authorName: string) {
  return {
    authorName,
    identity: { authorName },
    latestMessage: {
      id: 1,
      authorName,
      contentParts: [],
      text: 'latest message',
      timestamp: 1,
      timestampText: '1:00 PM'
    }
  };
}
