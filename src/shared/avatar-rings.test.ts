import { describe, expect, it } from 'vitest';
import {
  getAvatarRingColor,
  getAvatarRingKey,
  normalizeAvatarRingIdentity,
  normalizeStoredAvatarRings,
  serializeAvatarRings,
  type AvatarRingRecord
} from './avatar-rings';

describe('avatar ring storage helpers', () => {
  it('prefers channel ids and otherwise builds stable author keys', () => {
    expect(getAvatarRingKey({ authorName: ' @ViewerOne ', channelId: ' channel-a ' })).toBe(
      'channel:channel-a'
    );
    expect(getAvatarRingKey({ authorName: ' @ViewerOne ' })).toBe('author:@viewerone');
    expect(getAvatarRingKey({})).toBe('');
  });

  it('normalizes valid identities and rejects empty identities', () => {
    expect(normalizeAvatarRingIdentity({})).toBeNull();
    expect(
      normalizeAvatarRingIdentity({ authorName: ' @ViewerOne ', channelId: ' channel-a ' })
    ).toEqual({ authorName: '@ViewerOne', channelId: 'channel-a' });
    expect(normalizeAvatarRingIdentity({ channelId: ' channel-only ' })).toEqual({
      authorName: '',
      channelId: 'channel-only'
    });
  });

  it('normalizes only records whose stored key matches their identity', () => {
    expect(
      normalizeStoredAvatarRings({
        'author:@viewerone': {
          addedAt: 1_700_000_000_000,
          authorName: ' @ViewerOne ',
          sourceUrl: ' https://www.youtube.com/watch?v=stream-a '
        },
        'channel:channel-a': {
          addedAt: 1_700_000_001_000,
          authorName: '@ViewerTwo',
          channelId: ' channel-a ',
          sourceUrl: 'https://www.youtube.com/watch?v=stream-b'
        },
        'author:@wrong': {
          addedAt: 1_700_000_002_000,
          authorName: '@ViewerThree',
          sourceUrl: 'https://www.youtube.com/watch?v=stream-c'
        },
        primitive: 'value'
      })
    ).toEqual(
      new Map<string, AvatarRingRecord>([
        [
          'author:@viewerone',
          {
            addedAt: 1_700_000_000_000,
            authorName: '@ViewerOne',
            avatarUrl: undefined,
            channelId: undefined,
            sourceTitle: undefined,
            sourceUrl: 'https://www.youtube.com/watch?v=stream-a'
          }
        ],
        [
          'channel:channel-a',
          {
            addedAt: 1_700_000_001_000,
            authorName: '@ViewerTwo',
            avatarUrl: undefined,
            channelId: 'channel-a',
            sourceTitle: undefined,
            sourceUrl: 'https://www.youtube.com/watch?v=stream-b'
          }
        ]
      ])
    );
  });

  it('requires the new timestamp and stream fields and preserves popup metadata', () => {
    expect(
      normalizeStoredAvatarRings({
        'author:@viewerone': {
          addedAt: 1_700_000_000_000,
          authorName: '@ViewerOne',
          avatarUrl: ' https://example.com/avatar.png ',
          sourceTitle: ' Example stream ',
          sourceUrl: ' https://www.youtube.com/watch?v=stream-a '
        },
        'author:@missing-date': {
          authorName: '@MissingDate',
          sourceUrl: 'https://www.youtube.com/watch?v=stream-b'
        },
        'author:@missing-stream': {
          addedAt: 1_700_000_001_000,
          authorName: '@MissingStream'
        }
      })
    ).toEqual(
      new Map<string, AvatarRingRecord>([
        [
          'author:@viewerone',
          {
            addedAt: 1_700_000_000_000,
            authorName: '@ViewerOne',
            avatarUrl: 'https://example.com/avatar.png',
            channelId: undefined,
            sourceTitle: 'Example stream',
            sourceUrl: 'https://www.youtube.com/watch?v=stream-a'
          }
        ]
      ])
    );
  });

  it('serializes records and derives deterministic per-user colors', () => {
    const records = new Map<string, AvatarRingRecord>([
      [
        'author:@viewerone',
        {
          addedAt: 1_700_000_000_000,
          authorName: '@ViewerOne',
          sourceUrl: 'https://www.youtube.com/watch?v=stream-a'
        }
      ]
    ]);

    expect(serializeAvatarRings(records)).toEqual({
      'author:@viewerone': {
        addedAt: 1_700_000_000_000,
        authorName: '@ViewerOne',
        sourceUrl: 'https://www.youtube.com/watch?v=stream-a'
      }
    });
    expect(getAvatarRingColor({ authorName: '@ViewerOne' })).toBe(
      getAvatarRingColor({ authorName: '@ViewerOne' })
    );
    expect(getAvatarRingColor({ authorName: '@ViewerOne' })).not.toBe(
      getAvatarRingColor({ authorName: '@ViewerTwo' })
    );
  });
});
