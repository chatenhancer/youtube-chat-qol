import { describe, expect, it } from 'vitest';
import { locales } from './locales';
import { getWalkthroughChapters, getWalkthroughClip } from './walkthrough';
import timings from './walkthrough-timings.json';
import media from './walkthrough-videos.json';

describe('walkthrough scene boundaries', () => {
  it('requires reviewed cuts for the exact video published in every locale', () => {
    for (const locale of locales) {
      const video = timings.videos[locale];
      expect(video.fileName, `Recheck scene cuts after replacing the ${locale} video`).toBe(media.videos[locale]);
      const chapters = getWalkthroughChapters(locale);
      expect(video.boundaries).toHaveLength(chapters.length + 1);
      for (const [index, chapter] of chapters.entries()) {
        const clip = getWalkthroughClip(chapter.name, locale);
        expect(Number.isInteger(video.boundaries[index])).toBe(true);
        expect(clip.startSeconds).toBeGreaterThanOrEqual(0);
        expect(clip.startSeconds).toBeGreaterThan(video.boundaries[index] / timings.frameRate);
        expect(clip.endSeconds).toBeGreaterThan(clip.startSeconds);
        expect(clip.endSeconds).toBeLessThanOrEqual(chapters[index + 1]?.seconds ?? Infinity);
        expect(chapter.seconds).toBe(clip.startSeconds);
        const [minutes, seconds] = chapter.time.split(':').map(Number);
        expect(minutes * 60 + seconds).toBe(Math.floor(chapter.seconds));
      }
    }
  });

  it('uses localized cuts without changing shared chapter identities', () => {
    expect(getWalkthroughChapters('ar').map(chapter => chapter.name))
      .toEqual(getWalkthroughChapters('en').map(chapter => chapter.name));
    expect(getWalkthroughClip('translate-what-you-type', 'ar').startSeconds)
      .not.toBe(getWalkthroughClip('translate-what-you-type', 'en').startSeconds);
    expect(getWalkthroughClip('advanced-settings', 'en').endSeconds).toBeLessThan(211);
  });
});
