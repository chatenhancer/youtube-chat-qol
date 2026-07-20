import { describe, expect, it } from 'vitest';
import { getWalkthroughVideoUrl } from '../docs/src/data/media';
import { locales } from '../docs/src/data/locales';

describe('docs walkthrough media', () => {
  it('resolves the immutable R2 video for every docs locale', () => {
    locales.forEach((locale) => {
      expect(getWalkthroughVideoUrl(locale)).toMatch(
        new RegExp(`^https://media\\.chatenhancer\\.com/walkthrough/chat-enhancer-walkthrough-${locale}-[a-f0-9]{8}\\.mp4$`)
      );
    });
  });

  it('supports an alternate media origin for previews', () => {
    expect(getWalkthroughVideoUrl('es', 'https://preview.example/videos')).toMatch(
      /^https:\/\/preview\.example\/videos\/chat-enhancer-walkthrough-es-[a-f0-9]{8}\.mp4$/
    );
  });
});
