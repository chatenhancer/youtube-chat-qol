import { describe, expect, it } from 'vitest';
import {
  bookmarkAuthorsMatch,
  getBookmarkAuthorColor,
  getBookmarkAuthorKey,
  getBookmarkKey,
  getBookmarkTargetMessageId,
  getBookmarkTargetUrl,
  getBookmarkVideoOffsetSeconds,
  normalizeBookmarkAuthor,
  normalizeBookmarkAvatarUrl,
  normalizeStoredBookmarks,
  serializeBookmarks,
  type BookmarkRecord
} from './bookmarks';

describe('bookmark storage helpers', () => {
  it('builds stable author and message keys', () => {
    expect(getBookmarkAuthorKey({
      authorName: '  @ViewerOne  ',
      channelId: ' channel-a '
    })).toBe('channel:channel-a');
    expect(getBookmarkAuthorKey({ authorName: '  @ViewerOne  ' })).toBe('author:@viewerone');
    expect(getBookmarkAuthorKey({})).toBe('');
    expect(getBookmarkKey(' stream-a ', ' message-1 ')).toBe('message:stream-a:message-1');
    expect(getBookmarkKey('', 'message-1')).toBe('');
  });

  it('matches bookmark authors by channel before falling back to names', () => {
    expect(bookmarkAuthorsMatch(
      { authorName: '@ViewerOne', channelId: 'channel-a' },
      { authorName: '@RenamedViewer', channelId: 'channel-a' }
    )).toBe(true);
    expect(bookmarkAuthorsMatch(
      { authorName: '@ViewerOne', channelId: 'channel-a' },
      { authorName: '@ViewerOne', channelId: 'channel-b' }
    )).toBe(false);
    expect(bookmarkAuthorsMatch(
      { authorName: '@ViewerOne' },
      { authorName: '@viewerone', channelId: 'channel-a' }
    )).toBe(true);
  });

  it('builds deterministic author colors', () => {
    expect(getBookmarkAuthorColor({ authorName: '@ViewerOne' })).toBe(
      getBookmarkAuthorColor({ authorName: '@ViewerOne' })
    );
    expect(getBookmarkAuthorColor({ channelId: 'channel-a' })).toMatch(/^hsl\(\d+ 86% 58%\)$/);
    expect(getBookmarkAuthorColor({})).toMatch(/^hsl\(\d+ 86% 58%\)$/);
  });

  it('normalizes authors and rejects empty identities', () => {
    expect(normalizeBookmarkAuthor({})).toBeNull();
    expect(normalizeBookmarkAuthor({
      authorName: ' @ViewerOne ',
      avatarUrl: ' data:image/png;base64,avatar ',
      channelId: ' channel-a '
    })).toEqual({
      authorName: '@ViewerOne',
      avatarUrl: undefined,
      channelId: 'channel-a'
    });
    expect(normalizeBookmarkAuthor({ channelId: 'channel-only' })).toEqual({
      authorName: '',
      avatarUrl: undefined,
      channelId: 'channel-only'
    });
  });

  it('upgrades author-only records with an empty message', () => {
    expect(normalizeStoredBookmarks({
      'author:@viewerone': {
        authorName: ' @ViewerOne ',
        avatarUrl: 'https://yt3.ggpht.com/avatar=s88-c-k',
        markedAt: '1700000000000',
        markedSourceTitle: ' Example stream ',
        markedSourceUrl: ' https://www.youtube.com/watch?v=stream-a '
      }
    })).toEqual(new Map<string, BookmarkRecord>([
      ['author:@viewerone', {
        authorName: '@ViewerOne',
        avatarUrl: 'https://yt3.ggpht.com/avatar=s88-c-k',
        channelId: undefined,
        message: null,
        savedAt: 1_700_000_000_000,
        sourceKey: '',
        sourceTitle: 'Example stream',
        sourceUrl: 'https://www.youtube.com/watch?v=stream-a'
      }]
    ]));
  });

  it('normalizes exact-message records and rich content', () => {
    const value = {
      'message:stream-a:message-1': {
        authorName: ' @ViewerOne ',
        channelId: ' channel-a ',
        message: {
          contentParts: [
            { text: 'hello ', type: 'text' },
            {
              alt: ':wave:',
              className: 'emoji',
              emojiId: 'wave',
              src: 'https://yt3.ggpht.com/emoji.png',
              tooltip: ':wave:',
              type: 'emoji'
            }
          ],
          messageId: ' message-1 ',
          text: ' hello :wave: ',
          timestamp: '1700000000000',
          timestampText: ' 10:00 PM ',
          videoOffsetSeconds: '328.9'
        },
        savedAt: '1700000001000',
        sourceKey: ' stream-a ',
        sourceTitle: ' Example stream '
      },
      'message:stream-a:wrong': {
        authorName: '@ViewerTwo',
        message: {
          contentParts: [{ text: 'wrong', type: 'text' }],
          messageId: 'message-2',
          text: 'wrong'
        },
        savedAt: 1,
        sourceKey: 'stream-a'
      },
      invalid: 'value'
    };

    expect(normalizeStoredBookmarks(value)).toEqual(new Map<string, BookmarkRecord>([
      ['message:stream-a:message-1', {
        authorName: '@ViewerOne',
        avatarUrl: undefined,
        channelId: 'channel-a',
        message: {
          contentParts: [
            { text: 'hello ', type: 'text' },
            {
              alt: ':wave:',
              className: 'emoji',
              emojiId: 'wave',
              src: 'https://yt3.ggpht.com/emoji.png',
              tooltip: ':wave:',
              type: 'emoji'
            }
          ],
          messageId: 'message-1',
          text: 'hello :wave:',
          timestamp: 1_700_000_000_000,
          timestampText: '10:00 PM',
          videoOffsetSeconds: 328
        },
        savedAt: 1_700_000_001_000,
        sourceKey: 'stream-a',
        sourceTitle: 'Example stream',
        sourceUrl: undefined
      }]
    ]));
  });

  it('serializes records back to the storage shape', () => {
    const record: BookmarkRecord = {
      authorName: '@ViewerOne',
      message: null,
      savedAt: 123,
      sourceKey: ''
    };
    expect(serializeBookmarks(new Map([['author:@viewerone', record]]))).toEqual({
      'author:@viewerone': record
    });
  });

  it('builds and reads exact-message replay targets', () => {
    const replayMessage = {
      messageId: 'message+1',
      timestampText: '5:28'
    };
    const targetUrl = getBookmarkTargetUrl(
      'https://www.youtube.com/watch?v=stream-a',
      replayMessage
    );

    expect(getBookmarkVideoOffsetSeconds(replayMessage)).toBe(328);
    expect(getBookmarkVideoOffsetSeconds({
      timestampText: '10:00 PM',
      videoOffsetSeconds: 412.9
    })).toBe(412);
    expect(getBookmarkVideoOffsetSeconds({ timestampText: '1:02:03' })).toBe(3_723);
    expect(getBookmarkVideoOffsetSeconds({ timestampText: '10:00 PM' })).toBeNull();
    expect(targetUrl).toBe(
      'https://www.youtube.com/watch?v=stream-a&t=328s#ytcq-message=message%2B1'
    );
    expect(getBookmarkTargetMessageId(new URL(targetUrl).hash)).toBe('message+1');
  });

  it('normalizes avatar URLs', () => {
    expect(normalizeBookmarkAvatarUrl('')).toBe('');
    expect(normalizeBookmarkAvatarUrl('blob:https://example.test/avatar')).toBe('');
    expect(normalizeBookmarkAvatarUrl('https://yt3.ggpht.com/avatar=s32-c-k')).toBe(
      'https://yt3.ggpht.com/avatar=s32-c-k'
    );
  });
});
