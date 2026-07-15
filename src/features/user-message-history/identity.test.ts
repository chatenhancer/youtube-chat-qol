import { describe, expect, it } from 'vitest';
import {
  getAuthorKey,
  getIdentityFromUserKey,
  getNormalizedHandle,
  getUserKeyFromIdentity
} from './identity';

describe('user message identity helpers', () => {
  it('prefers channel IDs when available', () => {
    expect(getUserKeyFromIdentity({ authorName: '@ExampleViewer', channelId: 'channel-123' }))
      .toBe('channel:channel-123');
  });

  it('falls back to normalized author keys', () => {
    expect(getAuthorKey('  @Example.Viewer  ')).toBe('author:@example.viewer');
    expect(getUserKeyFromIdentity({ authorName: '@ExampleViewer' })).toBe('author:@exampleviewer');
  });

  it('round-trips channel keys back to user identities', () => {
    expect(getIdentityFromUserKey('channel:abc123', '@ExampleViewer')).toEqual({
      authorName: '@ExampleViewer',
      channelId: 'abc123'
    });
    expect(getIdentityFromUserKey('author:@exampleviewer', '@ExampleViewer')).toEqual({
      authorName: '@ExampleViewer'
    });
  });

  it('normalizes handle queries without the leading at sign', () => {
    expect(getNormalizedHandle('@@ExampleViewer')).toBe('exampleviewer');
    expect(getNormalizedHandle(' example-viewer ')).toBe('example-viewer');
  });
});
