import { describe, expect, it, vi } from 'vitest';
import {
  MAX_RECENT_STREAMS,
  cleanRecentStreamTitle,
  getCanonicalYouTubeWatchUrl,
  getRecentStreamKey,
  getRecentStreamThumbnailUrl,
  getSortedRecentStreamEntries,
  normalizeStoredRecentStreams,
  serializeRecentStreams,
  upsertRecentStreamVisit
} from './recent-streams';

describe('recent stream storage helpers', () => {
  it('canonicalizes YouTube watch, live chat, replay, short, and path URLs by video id', () => {
    expect(getRecentStreamKey('https://www.youtube.com/watch?v=abc_123-def')).toBe('video:abc_123-def');
    expect(getCanonicalYouTubeWatchUrl('https://www.youtube.com/live_chat?video_id=abc_123-def')).toBe(
      'https://www.youtube.com/watch?v=abc_123-def'
    );
    expect(getCanonicalYouTubeWatchUrl('https://youtu.be/abc_123-def?si=ignored')).toBe(
      'https://www.youtube.com/watch?v=abc_123-def'
    );
    expect(getCanonicalYouTubeWatchUrl('https://www.youtube.com/live/abc_123-def')).toBe(
      'https://www.youtube.com/watch?v=abc_123-def'
    );
    expect(getCanonicalYouTubeWatchUrl('https://www.youtube.com/shorts/abc_123-def')).toBe(
      'https://www.youtube.com/watch?v=abc_123-def'
    );
    expect(getCanonicalYouTubeWatchUrl('https://example.com/watch?v=abc_123-def')).toBe('');
    expect(getCanonicalYouTubeWatchUrl('https://www.youtube.com/live_chat?continuation=only-chat-token')).toBe('');
  });

  it('derives compact YouTube thumbnail URLs from canonical stream URLs', () => {
    expect(getRecentStreamThumbnailUrl('https://www.youtube.com/watch?v=abc_123-def')).toBe(
      'https://i.ytimg.com/vi/abc_123-def/mqdefault.jpg'
    );
    expect(getRecentStreamThumbnailUrl('https://www.youtube.com/live_chat?video_id=abc_123-def')).toBe(
      'https://i.ytimg.com/vi/abc_123-def/mqdefault.jpg'
    );
    expect(getRecentStreamThumbnailUrl('https://example.com/watch?v=abc_123-def')).toBe('');
  });

  it('cleans YouTube tab title noise and rejects generic titles', () => {
    expect(cleanRecentStreamTitle('(3) Example stream - YouTube')).toBe('Example stream');
    expect(cleanRecentStreamTitle('Live Chat')).toBe('');
    expect(cleanRecentStreamTitle('Live Chat Replay')).toBe('');
    expect(cleanRecentStreamTitle('YouTube')).toBe('');
  });

  it('normalizes stored records, sorts by latest visit, and drops malformed records', () => {
    const records = normalizeStoredRecentStreams({
      'video:first': {
        lastVisitedAt: 2_000,
        title: '(4) First stream - YouTube',
        url: 'https://www.youtube.com/live_chat?video_id=first',
        visitCount: 3
      },
      'video:second': {
        channelName: 'Channel two',
        lastVisitedAt: 3_000,
        title: '',
        url: 'https://youtu.be/second',
        visitCount: 0
      },
      'video:wrong-key': {
        lastVisitedAt: 4_000,
        title: 'Wrong key',
        url: 'https://www.youtube.com/watch?v=other',
        visitCount: 1
      },
      'source:not-youtube': {
        lastVisitedAt: 5_000,
        title: 'Example',
        url: 'https://example.com/watch?v=first',
        visitCount: 1
      }
    });

    expect(getSortedRecentStreamEntries(records).map(([key]) => key)).toEqual(['video:second', 'video:first']);
    expect(records.get('video:first')).toEqual({
      lastVisitedAt: 2_000,
      title: 'First stream',
      url: 'https://www.youtube.com/watch?v=first',
      visitCount: 3
    });
    expect(records.get('video:second')).toEqual({
      channelName: 'Channel two',
      lastVisitedAt: 3_000,
      title: 'https://www.youtube.com/watch?v=second',
      url: 'https://www.youtube.com/watch?v=second',
      visitCount: 1
    });
  });

  it('upserts visits, preserves useful existing data, and serializes sorted records', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 7, 12, 0, 0));
    const records = normalizeStoredRecentStreams({
      'video:stream-a': {
        channelName: 'Old channel',
        lastVisitedAt: 1_000,
        title: 'Old stream',
        url: 'https://www.youtube.com/watch?v=stream-a',
        visitCount: 1
      }
    });

    expect(upsertRecentStreamVisit(records, {
      sourceTitle: 'New stream - YouTube',
      sourceUrl: 'https://www.youtube.com/live_chat?video_id=stream-a',
      visitedAt: 2_000
    })).toBe('video:stream-a');
    expect(upsertRecentStreamVisit(records, {
      channelName: 'Second channel',
      sourceTitle: 'Second stream - YouTube',
      sourceUrl: 'https://www.youtube.com/watch?v=stream-b'
    })).toBe('video:stream-b');
    expect(upsertRecentStreamVisit(records, {
      sourceTitle: 'Offsite',
      sourceUrl: 'https://example.com/watch?v=stream-c'
    })).toBe('');

    expect(serializeRecentStreams(records)).toEqual({
      'video:stream-b': {
        channelName: 'Second channel',
        lastVisitedAt: new Date(2026, 5, 7, 12, 0, 0).getTime(),
        title: 'Second stream',
        url: 'https://www.youtube.com/watch?v=stream-b',
        visitCount: 1
      },
      'video:stream-a': {
        channelName: 'Old channel',
        lastVisitedAt: 2_000,
        title: 'New stream',
        url: 'https://www.youtube.com/watch?v=stream-a',
        visitCount: 2
      }
    });
    vi.useRealTimers();
  });

  it('caps records to the most recently visited streams', () => {
    const records = new Map();
    for (let index = 0; index < MAX_RECENT_STREAMS + 3; index += 1) {
      upsertRecentStreamVisit(records, {
        sourceTitle: `Stream ${index}`,
        sourceUrl: `https://www.youtube.com/watch?v=stream-${index}`,
        visitedAt: index + 1
      });
    }

    expect(records.size).toBe(MAX_RECENT_STREAMS);
    expect(records.has('video:stream-0')).toBe(false);
    expect(records.has(`video:stream-${MAX_RECENT_STREAMS + 2}`)).toBe(true);
  });
});
