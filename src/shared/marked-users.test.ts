import { describe, expect, it } from 'vitest';
import {
  getMarkedUserColor,
  getMarkedUserKey,
  isBetterMarkedUserAvatarUrl,
  normalizeMarkedIdentity,
  normalizeMarkedUserAvatarUrl,
  normalizeStoredMarkedUsers,
  serializeMarkedUsers,
  type MarkedUserRecord
} from './marked-users';

describe('marked user storage helpers', () => {
  it('builds stable storage keys from channel ids before author names', () => {
    expect(getMarkedUserKey({ authorName: '  @ViewerOne  ', channelId: ' channel-a ' })).toBe('channel:channel-a');
    expect(getMarkedUserKey({ authorName: '  @ViewerOne  ' })).toBe('author:@viewerone');
    expect(getMarkedUserKey({})).toBe('');
  });

  it('builds deterministic colors from author, channel, and fallback seeds', () => {
    expect(getMarkedUserColor({ authorName: '@ViewerOne' })).toBe(getMarkedUserColor({ authorName: '@ViewerOne' }));
    expect(getMarkedUserColor({ channelId: 'channel-a' })).toMatch(/^hsl\(\d+ 86% 58%\)$/);
    expect(getMarkedUserColor({})).toMatch(/^hsl\(\d+ 86% 58%\)$/);
  });

  it('normalizes identities and rejects empty identities', () => {
    expect(normalizeMarkedIdentity({})).toBeNull();
    expect(normalizeMarkedIdentity({
      authorName: ' @ViewerOne ',
      avatarUrl: ' data:image/png;base64,avatar ',
      channelId: ' channel-a '
    })).toEqual({
      authorName: '@ViewerOne',
      avatarUrl: undefined,
      channelId: 'channel-a',
      markedAt: 0
    });
    expect(normalizeMarkedIdentity({ channelId: 'channel-only' })).toEqual({
      authorName: '',
      avatarUrl: undefined,
      channelId: 'channel-only',
      markedAt: 0
    });
  });

  it('normalizes stored records and skips malformed entries', () => {
    expect(normalizeStoredMarkedUsers(null).size).toBe(0);
    expect(normalizeStoredMarkedUsers([]).size).toBe(0);
    expect(normalizeStoredMarkedUsers({
      'author:@viewerone': {
        authorName: ' @ViewerOne ',
        avatarUrl: 'https://yt3.ggpht.com/avatar=s88-c-k',
        markedAt: '1700000000000',
        markedSourceTitle: ' Example stream ',
        markedSourceUrl: ' https://www.youtube.com/watch?v=stream-a '
      },
      'channel:channel-a': {
        authorName: '',
        channelId: ' channel-a ',
        markedAt: Number.NaN
      },
      'author:@wrong-key': {
        authorName: '@ViewerTwo',
        markedAt: 1
      },
      'author:missing': {
        markedAt: 1
      },
      primitive: 'value',
      empty: null
    })).toEqual(new Map<string, MarkedUserRecord>([
      ['author:@viewerone', {
        authorName: '@ViewerOne',
        avatarUrl: 'https://yt3.ggpht.com/avatar=s88-c-k',
        channelId: undefined,
        markedAt: 1_700_000_000_000,
        markedSourceTitle: 'Example stream',
        markedSourceUrl: 'https://www.youtube.com/watch?v=stream-a'
      }],
      ['channel:channel-a', {
        authorName: '',
        avatarUrl: undefined,
        channelId: 'channel-a',
        markedAt: 0,
        markedSourceTitle: undefined,
        markedSourceUrl: undefined
      }]
    ]));
  });

  it('serializes normalized records back to chrome.storage shape', () => {
    const records = new Map<string, MarkedUserRecord>([
      ['author:@viewerone', { authorName: '@ViewerOne', markedAt: 123 }]
    ]);

    expect(serializeMarkedUsers(records)).toEqual({
      'author:@viewerone': {
        authorName: '@ViewerOne',
        markedAt: 123
      }
    });
  });

  it('normalizes avatar URLs and compares better avatar candidates', () => {
    expect(normalizeMarkedUserAvatarUrl('')).toBe('');
    expect(normalizeMarkedUserAvatarUrl('blob:https://example.test/avatar')).toBe('');
    expect(normalizeMarkedUserAvatarUrl('https://yt3.ggpht.com/avatar=s32-c-k')).toBe('https://yt3.ggpht.com/avatar=s32-c-k');

    expect(isBetterMarkedUserAvatarUrl('', undefined)).toBe(false);
    expect(isBetterMarkedUserAvatarUrl('https://yt3.ggpht.com/avatar=s32-c-k', undefined)).toBe(true);
    expect(isBetterMarkedUserAvatarUrl(
      'https://yt3.ggpht.com/avatar=s32-c-k',
      'https://yt3.ggpht.com/avatar=s32-c-k'
    )).toBe(false);
    expect(isBetterMarkedUserAvatarUrl(
      'https://yt3.ggpht.com/avatar=s88-c-k',
      'https://yt3.ggpht.com/avatar=s32-c-k'
    )).toBe(true);
    expect(isBetterMarkedUserAvatarUrl(
      'https://yt3.ggpht.com/avatar=s24-c-k',
      'https://yt3.ggpht.com/avatar=s88-c-k'
    )).toBe(false);
    expect(isBetterMarkedUserAvatarUrl(
      'https://yt3.ggpht.com/avatar',
      'https://yt3.ggpht.com/avatar=s32-c-k'
    )).toBe(false);
  });
});
