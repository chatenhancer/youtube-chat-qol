import { jsx, el } from '../../../../shared/jsx-dom';
import { getStickAroundAssets } from './assets';

const PREVIEW_WIDTH = 92;
const PREVIEW_HEIGHT = 48;
const PREVIEW_SUPERSAMPLE = 2;

export function renderStickAroundPreview(container: HTMLElement): void {
  const pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const backingScale = pixelRatio * PREVIEW_SUPERSAMPLE;
  const canvas = el<HTMLCanvasElement>(
    <canvas
      class="ytcq-games-preview-canvas"
      width={Math.round(PREVIEW_WIDTH * backingScale)}
      height={Math.round(PREVIEW_HEIGHT * backingScale)}
      aria-hidden="true"
    />
  );
  container.append(canvas);

  const context = canvas.getContext('2d');
  if (!context) return;
  if (typeof context.setTransform === 'function') {
    context.setTransform(backingScale, 0, 0, backingScale, 0, 0);
  }
  drawFallbackPreview(context);

  void getStickAroundAssets()
    .then((assets) => {
      if (assets.logo) drawLogoPreview(context, assets.logo);
    })
    .catch(() => undefined);
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
  context.fillStyle = '#ff4044';
  drawBubble(context, 8, 7, 44, -12);
  drawBubble(context, 52, 5, 31, 34);
  drawStickFigure(context, 24, 40, '#202124');
  drawStickFigure(context, 64, 40, '#235071');
}

function drawBubble(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  rotationDegrees: number
): void {
  if (typeof context.save !== 'function' || typeof context.beginPath !== 'function') {
    context.fillRect(x, y, width, 14);
    context.fillStyle = 'rgba(255, 255, 255, 0.45)';
    context.fillRect(x + 8, y + 5, width - 16, 3);
    context.fillStyle = '#ff4044';
    return;
  }

  context.save();
  context.translate(x + width / 2, y + 7);
  context.rotate((rotationDegrees * Math.PI) / 180);
  if (typeof context.roundRect === 'function') {
    context.beginPath();
    context.roundRect(-width / 2, -7, width, 14, 7);
    context.fill();
  } else {
    context.fillRect(-width / 2, -7, width, 14);
  }
  context.fillStyle = 'rgba(255, 255, 255, 0.45)';
  context.fillRect(-width / 2 + 8, -2, width - 16, 3);
  context.restore();
}

function drawStickFigure(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string
): void {
  if (typeof context.beginPath !== 'function') {
    context.fillStyle = color;
    context.fillRect(x - 3, y - 22, 6, 6);
    context.fillRect(x - 1, y - 16, 2, 12);
    context.fillRect(x - 7, y - 11, 14, 2);
    context.fillRect(x - 6, y - 4, 12, 2);
    return;
  }

  context.strokeStyle = color;
  context.lineWidth = 2;
  context.lineCap = 'round';
  context.beginPath();
  context.arc(x, y - 18, 4, 0, Math.PI * 2);
  context.moveTo(x, y - 14);
  context.lineTo(x, y - 7);
  context.moveTo(x, y - 12);
  context.lineTo(x - 7, y - 8);
  context.moveTo(x, y - 12);
  context.lineTo(x + 7, y - 15);
  context.moveTo(x, y - 7);
  context.lineTo(x - 6, y);
  context.moveTo(x, y - 7);
  context.lineTo(x + 6, y);
  context.stroke();
}
