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
        'author:@viewerone': { authorName: ' @ViewerOne ' },
        'channel:channel-a': { authorName: '@ViewerTwo', channelId: ' channel-a ' },
        'author:@wrong': { authorName: '@ViewerThree' },
        primitive: 'value'
      })
    ).toEqual(
      new Map<string, AvatarRingRecord>([
        [
          'author:@viewerone',
          { addedAt: undefined, authorName: '@ViewerOne', channelId: undefined }
        ],
        [
          'channel:channel-a',
          { addedAt: undefined, authorName: '@ViewerTwo', channelId: 'channel-a' }
        ]
      ])
    );
  });

  it('preserves valid ring-added timestamps and discards invalid ones', () => {
    expect(
      normalizeStoredAvatarRings({
        'author:@viewerone': { addedAt: 1_700_000_000_000, authorName: '@ViewerOne' },
        'author:@viewertwo': { addedAt: 'invalid', authorName: '@ViewerTwo' }
      })
    ).toEqual(
      new Map<string, AvatarRingRecord>([
        [
          'author:@viewerone',
          { addedAt: 1_700_000_000_000, authorName: '@ViewerOne', channelId: undefined }
        ],
        [
          'author:@viewertwo',
          { addedAt: undefined, authorName: '@ViewerTwo', channelId: undefined }
        ]
      ])
    );
  });

  it('serializes records and derives deterministic per-user colors', () => {
    const records = new Map<string, AvatarRingRecord>([
      ['author:@viewerone', { authorName: '@ViewerOne' }]
    ]);

    expect(serializeAvatarRings(records)).toEqual({
      'author:@viewerone': { authorName: '@ViewerOne' }
    });
    expect(getAvatarRingColor({ authorName: '@ViewerOne' })).toBe(
      getAvatarRingColor({ authorName: '@ViewerOne' })
    );
    expect(getAvatarRingColor({ authorName: '@ViewerOne' })).not.toBe(
      getAvatarRingColor({ authorName: '@ViewerTwo' })
    );
  });
});
