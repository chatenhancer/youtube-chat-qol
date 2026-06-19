import type { BountyHuntingAssets } from './types';

export const BOUNTY_HUNTING_FONT_BARNUM = 'YtcqBountyHuntingBarnum';
export const BOUNTY_HUNTING_FONT_BARTLE = 'YtcqBountyHuntingBartle';
export const BOUNTY_HUNTING_FONT_TEX_MEX = 'YtcqBountyHuntingTexMex';

const ASSET_PATHS = {
  avatarRing: 'games/bounty-hunting/avatar-ring.webp',
  bountyClaimedStamp: 'games/bounty-hunting/bountyclaimed-stamp.webp',
  bountyDescBg: 'games/bounty-hunting/bountydescbg.webp',
  bountyOpenStamp: 'games/bounty-hunting/bountyopen-stamp.webp',
  buttonBg: 'games/bounty-hunting/buttonbg.webp',
  buttonBgDarker: 'games/bounty-hunting/buttonbg-darker.webp',
  divider: 'games/bounty-hunting/divider.webp',
  goldStar: 'games/bounty-hunting/goldstar.webp',
  liveScoreBg: 'games/bounty-hunting/livescorebg.webp',
  logo: 'games/bounty-hunting/logo.webp',
  paperBg: 'games/bounty-hunting/paperbg.webp',
  roundOverBg: 'games/bounty-hunting/roundoverbg.webp',
  roundOverTitle: 'games/bounty-hunting/roundover-title.webp',
  silverStar: 'games/bounty-hunting/silverstart.webp',
  titleDecorLeft: 'games/bounty-hunting/titledecor-left.webp',
  titleDecorRight: 'games/bounty-hunting/titledecor-right.webp',
  woodenRibbon: 'games/bounty-hunting/wooden-ribbon.webp'
} as const;

const FONT_PATHS = [
  {
    family: BOUNTY_HUNTING_FONT_BARNUM,
    descriptors: { weight: '370 1000' },
    path: 'games/bounty-hunting/barnum-variable.ttf'
  },
  {
    family: BOUNTY_HUNTING_FONT_BARTLE,
    path: 'games/bounty-hunting/bbh-bartle.ttf'
  },
  {
    family: BOUNTY_HUNTING_FONT_TEX_MEX,
    path: 'games/bounty-hunting/tex-mex.otf'
  }
] as const;

export const EMPTY_BOUNTY_HUNTING_ASSETS: BountyHuntingAssets = {
  avatarRing: null,
  bountyClaimedStamp: null,
  bountyDescBg: null,
  bountyOpenStamp: null,
  buttonBg: null,
  buttonBgDarker: null,
  divider: null,
  fontsReady: false,
  goldStar: null,
  liveScoreBg: null,
  logo: null,
  paperBg: null,
  roundOverBg: null,
  roundOverTitle: null,
  silverStar: null,
  titleDecorLeft: null,
  titleDecorRight: null,
  woodenRibbon: null
};

let bountyHuntingAssetsPromise: Promise<BountyHuntingAssets> | null = null;

export function getBountyHuntingAssets(): Promise<BountyHuntingAssets> {
  bountyHuntingAssetsPromise ||= Promise.allSettled([
    loadBountyHuntingImage(chrome.runtime.getURL(ASSET_PATHS.avatarRing)),
    loadBountyHuntingImage(chrome.runtime.getURL(ASSET_PATHS.bountyClaimedStamp)),
    loadBountyHuntingImage(chrome.runtime.getURL(ASSET_PATHS.bountyDescBg)),
    loadBountyHuntingImage(chrome.runtime.getURL(ASSET_PATHS.bountyOpenStamp)),
    loadBountyHuntingImage(chrome.runtime.getURL(ASSET_PATHS.buttonBg)),
    loadBountyHuntingImage(chrome.runtime.getURL(ASSET_PATHS.buttonBgDarker)),
    loadBountyHuntingImage(chrome.runtime.getURL(ASSET_PATHS.divider)),
    loadBountyHuntingImage(chrome.runtime.getURL(ASSET_PATHS.goldStar)),
    loadBountyHuntingImage(chrome.runtime.getURL(ASSET_PATHS.liveScoreBg)),
    loadBountyHuntingImage(chrome.runtime.getURL(ASSET_PATHS.logo)),
    loadBountyHuntingImage(chrome.runtime.getURL(ASSET_PATHS.paperBg)),
    loadBountyHuntingImage(chrome.runtime.getURL(ASSET_PATHS.roundOverBg)),
    loadBountyHuntingImage(chrome.runtime.getURL(ASSET_PATHS.roundOverTitle)),
    loadBountyHuntingImage(chrome.runtime.getURL(ASSET_PATHS.silverStar)),
    loadBountyHuntingImage(chrome.runtime.getURL(ASSET_PATHS.titleDecorLeft)),
    loadBountyHuntingImage(chrome.runtime.getURL(ASSET_PATHS.titleDecorRight)),
    loadBountyHuntingImage(chrome.runtime.getURL(ASSET_PATHS.woodenRibbon)),
    loadBountyHuntingFonts()
  ]).then(([
    avatarRing,
    bountyClaimedStamp,
    bountyDescBg,
    bountyOpenStamp,
    buttonBg,
    buttonBgDarker,
    divider,
    goldStar,
    liveScoreBg,
    logo,
    paperBg,
    roundOverBg,
    roundOverTitle,
    silverStar,
    titleDecorLeft,
    titleDecorRight,
    woodenRibbon,
    fontsReady
  ]) => ({
    avatarRing: getLoadedImage(avatarRing),
    bountyClaimedStamp: getLoadedImage(bountyClaimedStamp),
    bountyDescBg: getLoadedImage(bountyDescBg),
    bountyOpenStamp: getLoadedImage(bountyOpenStamp),
    buttonBg: getLoadedImage(buttonBg),
    buttonBgDarker: getLoadedImage(buttonBgDarker),
    divider: getLoadedImage(divider),
    fontsReady: fontsReady.status === 'fulfilled' ? fontsReady.value : false,
    goldStar: getLoadedImage(goldStar),
    liveScoreBg: getLoadedImage(liveScoreBg),
    logo: getLoadedImage(logo),
    paperBg: getLoadedImage(paperBg),
    roundOverBg: getLoadedImage(roundOverBg),
    roundOverTitle: getLoadedImage(roundOverTitle),
    silverStar: getLoadedImage(silverStar),
    titleDecorLeft: getLoadedImage(titleDecorLeft),
    titleDecorRight: getLoadedImage(titleDecorRight),
    woodenRibbon: getLoadedImage(woodenRibbon)
  }));
  return bountyHuntingAssetsPromise;
}

function getLoadedImage(result: PromiseSettledResult<HTMLImageElement>): HTMLImageElement | null {
  return result.status === 'fulfilled' ? result.value : null;
}

function loadBountyHuntingImage(src: string): Promise<HTMLImageElement> {
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

async function loadBountyHuntingFonts(): Promise<boolean> {
  if (typeof FontFace === 'undefined' || !document.fonts?.add) return false;

  const results = await Promise.allSettled(FONT_PATHS.map(async (font) => {
    const descriptors = 'descriptors' in font ? font.descriptors : undefined;
    const face = new FontFace(font.family, `url(${chrome.runtime.getURL(font.path)})`, descriptors);
    const loaded = await face.load();
    document.fonts.add(loaded);
  }));
  return results.some((result) => result.status === 'fulfilled');
}
