/**
 * HELP-A-FRIEND! Trivia lobby preview.
 *
 * Keeps the picker card lightweight while reusing the game logo that ships
 * with the extension bundle.
 */
import { ytcqCreateElement } from '../../../../shared/managed-dom';

const LOGO_PATH = 'games/replay-trivia/logo.png';
const PREVIEW_WIDTH = 92;
const PREVIEW_HEIGHT = 48;
const PREVIEW_SUPERSAMPLE = 2;

let replayTriviaPreviewLogoPromise: Promise<HTMLImageElement> | null = null;

export function renderReplayTriviaPreview(container: HTMLElement): void {
  const canvas = ytcqCreateElement('canvas');
  canvas.className = 'ytcq-games-preview-canvas';
  const pixelRatio = getPreviewPixelRatio();
  const backingScale = pixelRatio * PREVIEW_SUPERSAMPLE;
  canvas.width = Math.round(PREVIEW_WIDTH * backingScale);
  canvas.height = Math.round(PREVIEW_HEIGHT * backingScale);
  canvas.style.width = `${PREVIEW_WIDTH}px`;
  canvas.style.height = `${PREVIEW_HEIGHT}px`;
  canvas.setAttribute('aria-hidden', 'true');
  container.append(canvas);

  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext('2d');
  } catch {
    return;
  }
  if (!context) return;
  if (typeof context.setTransform === 'function') {
    context.setTransform(backingScale, 0, 0, backingScale, 0, 0);
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  if (!canDrawDetailedPreview(context)) {
    drawBasicPreview(context);
    return;
  }

  drawFallbackPreview(context);
  if (typeof Image === 'undefined') return;

  void getReplayTriviaPreviewLogo().then((logo) => {
    drawLogoPreview(context, logo);
  }).catch(() => undefined);
}

function drawBasicPreview(context: CanvasRenderingContext2D): void {
  context.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  context.fillStyle = '#2b96f4';
  context.fillRect(24, 24, 58, 18);
  context.fillStyle = '#e8e8ea';
  context.fillRect(8, 8, 58, 15);
}

function drawFallbackPreview(context: CanvasRenderingContext2D): void {
  context.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  drawBubble(context, 5, 8, 58, 15, '#e8e8ea');
  drawBubble(context, 26, 25, 61, 16, '#2b96f4');
  context.fillStyle = '#303033';
  context.font = '700 10px Roboto, Arial, sans-serif';
  context.fillText('HELP', 18, 19);
  context.fillStyle = '#ffffff';
  context.font = '700 12px Roboto, Arial, sans-serif';
  context.fillText('Trivia', 40, 37);
}

function canDrawDetailedPreview(context: CanvasRenderingContext2D): boolean {
  const candidate = context as unknown as Record<string, unknown>;
  return [
    'beginPath',
    'closePath',
    'fill',
    'fillText',
    'lineTo',
    'moveTo',
    'quadraticCurveTo',
    'setTransform'
  ].every((method) => typeof candidate[method] === 'function');
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

function drawBubble(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string
): void {
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(x + 8, y);
  context.lineTo(x + width - 8, y);
  context.quadraticCurveTo(x + width, y, x + width, y + 8);
  context.lineTo(x + width, y + height - 8);
  context.quadraticCurveTo(x + width, y + height, x + width - 8, y + height);
  context.lineTo(x + 8, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - 8);
  context.lineTo(x, y + 8);
  context.quadraticCurveTo(x, y, x + 8, y);
  context.closePath();
  context.fill();
}

function getReplayTriviaPreviewLogo(): Promise<HTMLImageElement> {
  replayTriviaPreviewLogoPromise ||= loadReplayTriviaPreviewImage(chrome.runtime.getURL(LOGO_PATH));
  return replayTriviaPreviewLogoPromise;
}

function loadReplayTriviaPreviewImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${src}`));
    image.src = src;
    if (image.complete) resolve(image);
  });
}

function getPreviewPixelRatio(): number {
  return Math.max(1, Math.min(2, window.devicePixelRatio || 1));
}
