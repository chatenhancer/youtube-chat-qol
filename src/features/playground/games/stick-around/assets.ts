import type { StickAroundAnimationFrame, StickAroundAssets, StickAroundFrameRect } from './types';

export const STICK_AROUND_FONT_BYTESIZED = 'YtcqStickAroundBytesized';

const ASSET_PATHS = {
  font: 'games/stick-around/bytesized-regular.ttf',
  logo: 'games/stick-around/logo.png',
  spritesheet: 'games/stick-around/stick_all_animations_spritesheet.png',
  spritesheetData: 'games/stick-around/stick_all_animations_spritesheet.json'
} as const;

const EMPTY_ASSETS: StickAroundAssets = {
  animations: {},
  fontsReady: false,
  logo: null,
  spritesheet: null
};

interface AsepriteFrameData {
  duration?: number;
  frame?: Partial<StickAroundFrameRect>;
}

interface AsepriteSpritesheetData {
  frames?: Record<string, AsepriteFrameData>;
}

let stickAroundAssetsPromise: Promise<StickAroundAssets> | null = null;

export function getStickAroundAssets(): Promise<StickAroundAssets> {
  stickAroundAssetsPromise ||= loadStickAroundAssets();
  return stickAroundAssetsPromise;
}

async function loadStickAroundAssets(): Promise<StickAroundAssets> {
  const [fontsReady, logo, spritesheet, spritesheetData] = await Promise.allSettled([
    loadStickAroundFonts(),
    loadStickAroundImage(chrome.runtime.getURL(ASSET_PATHS.logo)),
    loadStickAroundImage(chrome.runtime.getURL(ASSET_PATHS.spritesheet)),
    loadStickAroundSpritesheetData(chrome.runtime.getURL(ASSET_PATHS.spritesheetData))
  ]);

  return {
    animations: getLoadedSpritesheetData(spritesheetData),
    fontsReady: fontsReady.status === 'fulfilled' ? fontsReady.value : false,
    logo: getLoadedImage(logo),
    spritesheet: getLoadedImage(spritesheet)
  };
}

function getLoadedImage(result: PromiseSettledResult<HTMLImageElement>): HTMLImageElement | null {
  return result.status === 'fulfilled' ? result.value : null;
}

function getLoadedSpritesheetData(
  result: PromiseSettledResult<Record<string, StickAroundAnimationFrame[]>>
): Record<string, StickAroundAnimationFrame[]> {
  return result.status === 'fulfilled' ? result.value : EMPTY_ASSETS.animations;
}

async function loadStickAroundSpritesheetData(src: string): Promise<Record<string, StickAroundAnimationFrame[]>> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Failed to load ${src}`);
  return parseStickAroundSpritesheetData(await response.json() as unknown);
}

export function parseStickAroundSpritesheetData(value: unknown): Record<string, StickAroundAnimationFrame[]> {
  const data = value as AsepriteSpritesheetData;
  const frames = data && typeof data === 'object' ? data.frames : undefined;
  if (!frames || typeof frames !== 'object') return {};

  const animations: Record<string, StickAroundAnimationFrame[]> = {};
  Object.entries(frames).forEach(([name, entry]) => {
    const frame = normalizeFrameRect(entry.frame);
    if (!frame) return;
    const animationName = name.split('_')[0] || 'idle';
    animations[animationName] ||= [];
    animations[animationName].push({
      duration: Number.isFinite(entry.duration) ? Math.max(40, Number(entry.duration)) : 120,
      frame,
      name
    });
  });

  Object.values(animations).forEach((animationFrames) => {
    animationFrames.sort((left, right) => left.name.localeCompare(right.name));
  });
  return animations;
}

function normalizeFrameRect(value: Partial<StickAroundFrameRect> | undefined): StickAroundFrameRect | null {
  if (!value) return null;
  const { h, w, x, y } = value;
  if (!Number.isFinite(h) || !Number.isFinite(w) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    h: Math.max(1, Number(h)),
    w: Math.max(1, Number(w)),
    x: Math.max(0, Number(x)),
    y: Math.max(0, Number(y))
  };
}

function loadStickAroundImage(src: string): Promise<HTMLImageElement> {
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

async function loadStickAroundFonts(): Promise<boolean> {
  if (typeof FontFace === 'undefined' || !document.fonts?.add) return false;

  const face = new FontFace(
    STICK_AROUND_FONT_BYTESIZED,
    `url(${chrome.runtime.getURL(ASSET_PATHS.font)})`
  );
  const loaded = await face.load();
  document.fonts.add(loaded);
  return true;
}
