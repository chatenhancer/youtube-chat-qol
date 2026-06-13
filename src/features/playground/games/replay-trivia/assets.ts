import type { ReplayTriviaAssets } from './types';

const ASSET_PATHS = {
  bestie: 'games/replay-trivia/bestie.png',
  blueBubble: 'games/replay-trivia/blue-bubble.png',
  blocked: 'games/replay-trivia/blocked.png',
  greenBubble: 'games/replay-trivia/green-bubble.png',
  greyBubbleNoTail: 'games/replay-trivia/grey-bubble-notail.png',
  greyBubbleTail: 'games/replay-trivia/grey-bubble-tail.png',
  logo: 'games/replay-trivia/logo.png',
  target: 'games/replay-trivia/target.png',
  tie: 'games/replay-trivia/tie.png',
  trophy: 'games/replay-trivia/trophy.png',
  wrong: 'games/replay-trivia/wrong.png'
} as const;

export const EMPTY_REPLAY_TRIVIA_ASSETS: ReplayTriviaAssets = {
  bestie: null,
  blueBubble: null,
  blocked: null,
  greenBubble: null,
  greyBubbleNoTail: null,
  greyBubbleTail: null,
  logo: null,
  target: null,
  tie: null,
  trophy: null,
  wrong: null
};

let replayTriviaAssetsPromise: Promise<ReplayTriviaAssets> | null = null;

export function getReplayTriviaAssets(): Promise<ReplayTriviaAssets> {
  replayTriviaAssetsPromise ||= Promise.allSettled([
    loadReplayTriviaImage(chrome.runtime.getURL(ASSET_PATHS.bestie)),
    loadReplayTriviaImage(chrome.runtime.getURL(ASSET_PATHS.blueBubble)),
    loadReplayTriviaImage(chrome.runtime.getURL(ASSET_PATHS.blocked)),
    loadReplayTriviaImage(chrome.runtime.getURL(ASSET_PATHS.greenBubble)),
    loadReplayTriviaImage(chrome.runtime.getURL(ASSET_PATHS.greyBubbleNoTail)),
    loadReplayTriviaImage(chrome.runtime.getURL(ASSET_PATHS.greyBubbleTail)),
    loadReplayTriviaImage(chrome.runtime.getURL(ASSET_PATHS.logo)),
    loadReplayTriviaImage(chrome.runtime.getURL(ASSET_PATHS.target)),
    loadReplayTriviaImage(chrome.runtime.getURL(ASSET_PATHS.tie)),
    loadReplayTriviaImage(chrome.runtime.getURL(ASSET_PATHS.trophy)),
    loadReplayTriviaImage(chrome.runtime.getURL(ASSET_PATHS.wrong))
  ]).then(([bestie, blueBubble, blocked, greenBubble, greyBubbleNoTail, greyBubbleTail, logo, target, tie, trophy, wrong]) => ({
    bestie: getLoadedImage(bestie),
    blueBubble: getLoadedImage(blueBubble),
    blocked: getLoadedImage(blocked),
    greenBubble: getLoadedImage(greenBubble),
    greyBubbleNoTail: getLoadedImage(greyBubbleNoTail),
    greyBubbleTail: getLoadedImage(greyBubbleTail),
    logo: getLoadedImage(logo),
    target: getLoadedImage(target),
    tie: getLoadedImage(tie),
    trophy: getLoadedImage(trophy),
    wrong: getLoadedImage(wrong)
  }));
  return replayTriviaAssetsPromise;
}

function getLoadedImage(result: PromiseSettledResult<HTMLImageElement>): HTMLImageElement | null {
  return result.status === 'fulfilled' ? result.value : null;
}

function loadReplayTriviaImage(src: string): Promise<HTMLImageElement> {
  if (typeof Image === 'undefined') return Promise.reject(new Error('Image is unavailable.'));
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${src}`));
    image.src = src;
    if (image.complete) resolve(image);
  });
}
