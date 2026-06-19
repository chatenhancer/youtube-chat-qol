import { ytcqCreateElement } from '../../../../shared/managed-dom';

const LOGO_PATH = 'games/bounty-hunting/logo.webp';
const PREVIEW_WIDTH = 92;
const PREVIEW_HEIGHT = 48;
const PREVIEW_SUPERSAMPLE = 2;

let bountyHuntingPreviewLogoPromise: Promise<HTMLImageElement> | null = null;

export function renderBountyHuntingPreview(container: HTMLElement): void {
  const canvas = ytcqCreateElement('canvas');
  canvas.className = 'ytcq-games-preview-canvas';
  const pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const backingScale = pixelRatio * PREVIEW_SUPERSAMPLE;
  canvas.width = Math.round(PREVIEW_WIDTH * backingScale);
  canvas.height = Math.round(PREVIEW_HEIGHT * backingScale);
  canvas.style.width = `${PREVIEW_WIDTH}px`;
  canvas.style.height = `${PREVIEW_HEIGHT}px`;
  canvas.setAttribute('aria-hidden', 'true');
  container.append(canvas);

  const context = canvas.getContext('2d');
  if (!context) return;
  if (typeof context.setTransform === 'function') {
    context.setTransform(backingScale, 0, 0, backingScale, 0, 0);
  }
  context.imageSmoothingEnabled = true;
  drawFallbackPreview(context);

  if (typeof Image === 'undefined') return;
  void getBountyHuntingPreviewLogo().then((logo) => {
    drawLogoPreview(context, logo);
  }).catch(() => undefined);
}

function drawLogoPreview(context: CanvasRenderingContext2D, logo: HTMLImageElement): void {
  context.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);

  const scale = Math.min(PREVIEW_WIDTH / logo.naturalWidth, PREVIEW_HEIGHT / logo.naturalHeight);
  const width = logo.naturalWidth * scale;
  const height = logo.naturalHeight * scale;
  context.drawImage(
    logo,
    Math.round((PREVIEW_WIDTH - width) / 2),
    Math.round((PREVIEW_HEIGHT - height) / 2),
    Math.round(width),
    Math.round(height)
  );
}

function drawFallbackPreview(context: CanvasRenderingContext2D): void {
  context.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  if (typeof context.fillText !== 'function') return;
  context.fillStyle = '#f20d0d';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '800 15px Georgia, serif';
  context.fillText('WILD CHAT', PREVIEW_WIDTH / 2, PREVIEW_HEIGHT / 2);
}

function getBountyHuntingPreviewLogo(): Promise<HTMLImageElement> {
  bountyHuntingPreviewLogoPromise ||= loadBountyHuntingPreviewImage(chrome.runtime.getURL(LOGO_PATH));
  return bountyHuntingPreviewLogoPromise;
}

function loadBountyHuntingPreviewImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${src}`));
    image.src = src;
    if (image.complete) resolve(image);
  });
}
