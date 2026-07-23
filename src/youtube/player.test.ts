import { afterEach, describe, expect, it } from 'vitest';
import { getCurrentYouTubeVideoOffsetSeconds } from './player';

describe('YouTube player helpers', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('reads a whole-second video position from an accessible watch page', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 328.9
    });
    document.body.append(video);

    expect(getCurrentYouTubeVideoOffsetSeconds()).toBe(328);
  });

  it('returns null when there is no accessible video position', () => {
    expect(getCurrentYouTubeVideoOffsetSeconds()).toBeNull();
  });
});
