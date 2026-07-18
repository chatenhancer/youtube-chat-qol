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
  { labelKey: 'walkthroughKeyPointDrafts', name: 'translate-what-you-type', seconds: 25, time: '0:25' },
  { labelKey: 'walkthroughKeyPointMentions', name: 'mention-and-quote', seconds: 40, time: '0:40' },
  { labelKey: 'walkthroughKeyPointUserCards', name: 'review-user-profiles', seconds: 63, time: '1:03' },
  { labelKey: 'walkthroughKeyPointFocus', name: 'use-focus-mode', seconds: 74, time: '1:14' },
  { labelKey: 'walkthroughKeyPointInbox', name: 'never-miss-messages', seconds: 85, time: '1:25' },
  { labelKey: 'walkthroughKeyPointGames', name: 'games', seconds: 105, time: '1:45' },
  { labelKey: 'walkthroughKeyPointBookmarks', name: 'bookmark-users', seconds: 135, time: '2:15' },
  { labelKey: 'walkthroughKeyPointEmojis', name: 'keep-emojis-close', seconds: 149, time: '2:29' },
  { labelKey: 'walkthroughKeyPointCommands', name: 'use-tab-commands', seconds: 164, time: '2:44' },
  { labelKey: 'walkthroughKeyPointPopup', name: 'advanced-settings', seconds: 176, time: '2:56' }
] as const satisfies readonly WalkthroughChapter[];

export type WalkthroughChapterName = typeof walkthroughChapters[number]['name'];

export interface WalkthroughClip {
  endSeconds?: number;
  startSeconds: number;
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
