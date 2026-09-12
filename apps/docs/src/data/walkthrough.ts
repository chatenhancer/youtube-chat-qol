import type { Messages } from './site';
import type { Locale } from './locales';
import timings from './walkthrough-timings.json' with { type: 'json' };

type WalkthroughLabelKey = Extract<keyof Messages['features'], `walkthroughKeyPoint${string}`>;

interface WalkthroughChapter {
  labelKey: WalkthroughLabelKey;
  name: string;
}

export const walkthroughChapters = [
  { labelKey: 'walkthroughKeyPointTranslation', name: 'translate-live-chat' },
  { labelKey: 'walkthroughKeyPointDrafts', name: 'translate-what-you-type' },
  { labelKey: 'walkthroughKeyPointMentions', name: 'mention-and-quote' },
  { labelKey: 'walkthroughKeyPointUserCards', name: 'review-user-profiles' },
  { labelKey: 'walkthroughKeyPointFocus', name: 'use-focus-mode' },
  { labelKey: 'walkthroughKeyPointInbox', name: 'never-miss-messages' },
  { labelKey: 'walkthroughKeyPointGames', name: 'games' },
  { labelKey: 'walkthroughKeyPointBookmarks', name: 'save-messages' },
  { labelKey: 'walkthroughKeyPointEmojis', name: 'keep-emojis-close' },
  { labelKey: 'walkthroughKeyPointCommands', name: 'use-tab-commands' },
  { labelKey: 'walkthroughKeyPointPopup', name: 'advanced-settings' }
] as const satisfies readonly WalkthroughChapter[];

export type WalkthroughChapterName = typeof walkthroughChapters[number]['name'];

export interface WalkthroughClip {
  endSeconds?: number;
  startSeconds: number;
}

export function getWalkthroughClipHash(name: WalkthroughChapterName): `#clip-${WalkthroughChapterName}` {
  return `#clip-${name}`;
}

export function getWalkthroughChapters(locale: Locale) {
  return walkthroughChapters.map((chapter) => {
    const seconds = getWalkthroughClip(chapter.name, locale).startSeconds;
    const wholeSeconds = Math.floor(seconds);
    return {
      ...chapter,
      seconds,
      time: `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`
    };
  });
}

export function getWalkthroughClip(name: WalkthroughChapterName, locale: Locale): WalkthroughClip {
  const chapterIndex = walkthroughChapters.findIndex((chapter) => chapter.name === name);
  if (chapterIndex < 0) throw new Error(`Unknown walkthrough chapter: ${name}`);

  // Verified frame cuts follow the chapter order; the final cut excludes the outro.
  // Seek one frame inside each scene so decoding cannot land on the preceding frame.
  const { boundaries } = timings.videos[locale];
  return {
    startSeconds: (boundaries[chapterIndex] + 1) / timings.frameRate,
    endSeconds: boundaries[chapterIndex + 1] / timings.frameRate
  };
}
