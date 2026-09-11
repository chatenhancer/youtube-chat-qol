import type { Messages } from './site';

type WalkthroughLabelKey = Extract<keyof Messages['features'], `walkthroughKeyPoint${string}`>;

interface WalkthroughChapter {
  labelKey: WalkthroughLabelKey;
  name: string;
  seconds: number;
  time: string;
}

export const walkthroughChapters = [
  { labelKey: 'walkthroughKeyPointTranslation', name: 'translate-live-chat', seconds: 6, time: '0:06' },
  { labelKey: 'walkthroughKeyPointDrafts', name: 'translate-what-you-type', seconds: 27, time: '0:27' },
  { labelKey: 'walkthroughKeyPointMentions', name: 'mention-and-quote', seconds: 44, time: '0:44' },
  { labelKey: 'walkthroughKeyPointUserCards', name: 'review-user-profiles', seconds: 71, time: '1:11' },
  { labelKey: 'walkthroughKeyPointFocus', name: 'use-focus-mode', seconds: 84, time: '1:24' },
  { labelKey: 'walkthroughKeyPointInbox', name: 'never-miss-messages', seconds: 97, time: '1:37' },
  { labelKey: 'walkthroughKeyPointGames', name: 'games', seconds: 122, time: '2:02' },
  { labelKey: 'walkthroughKeyPointBookmarks', name: 'save-messages', seconds: 153, time: '2:33' },
  { labelKey: 'walkthroughKeyPointEmojis', name: 'keep-emojis-close', seconds: 166, time: '2:46' },
  { labelKey: 'walkthroughKeyPointCommands', name: 'use-tab-commands', seconds: 181, time: '3:01' },
  { labelKey: 'walkthroughKeyPointPopup', name: 'advanced-settings', seconds: 197, time: '3:17' }
] as const satisfies readonly WalkthroughChapter[];

export type WalkthroughChapterName = typeof walkthroughChapters[number]['name'];

export interface WalkthroughClip {
  endSeconds?: number;
  startSeconds: number;
}

export function getWalkthroughClipHash(name: WalkthroughChapterName): `#clip-${WalkthroughChapterName}` {
  return `#clip-${name}`;
}

export function getWalkthroughClip(name: WalkthroughChapterName): WalkthroughClip {
  const chapterIndex = walkthroughChapters.findIndex((chapter) => chapter.name === name);
  if (chapterIndex < 0) throw new Error(`Unknown walkthrough chapter: ${name}`);

  const chapter = walkthroughChapters[chapterIndex];
  const nextChapter = walkthroughChapters[chapterIndex + 1];
  return {
    startSeconds: chapter.seconds,
    ...(nextChapter ? { endSeconds: nextChapter.seconds } : {})
  };
}
