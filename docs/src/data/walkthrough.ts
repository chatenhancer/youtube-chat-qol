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
  { labelKey: 'walkthroughKeyPointDrafts', name: 'translate-what-you-type', seconds: 28, time: '0:28' },
  { labelKey: 'walkthroughKeyPointMentions', name: 'mention-and-quote', seconds: 45, time: '0:45' },
  { labelKey: 'walkthroughKeyPointUserCards', name: 'review-user-profiles', seconds: 72, time: '1:12' },
  { labelKey: 'walkthroughKeyPointFocus', name: 'use-focus-mode', seconds: 85, time: '1:25' },
  { labelKey: 'walkthroughKeyPointInbox', name: 'never-miss-messages', seconds: 98, time: '1:38' },
  { labelKey: 'walkthroughKeyPointGames', name: 'games', seconds: 122, time: '2:02' },
  { labelKey: 'walkthroughKeyPointBookmarks', name: 'bookmark-users', seconds: 154, time: '2:34' },
  { labelKey: 'walkthroughKeyPointEmojis', name: 'keep-emojis-close', seconds: 171, time: '2:51' },
  { labelKey: 'walkthroughKeyPointCommands', name: 'use-tab-commands', seconds: 185, time: '3:05' },
  { labelKey: 'walkthroughKeyPointPopup', name: 'advanced-settings', seconds: 200, time: '3:20' }
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
