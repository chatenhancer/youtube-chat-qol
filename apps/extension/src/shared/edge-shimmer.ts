/** Canvas edge shimmer shared by chat startup and the theme preview. */
export const EDGE_SHIMMER_DURATION_MS = 1350;

const CANVAS_SCALE = 0.7;
// YouTube clips visual overflow at the chat iframe boundary, so keep the glow's energy inside it.
const PERIMETER_INSET = 3;

export function drawEdgeShimmerFrame(
  target: HTMLCanvasElement,
  progress: number,
  gradientHeight?: number
): void {
  const rect = target.getBoundingClientRect();
  const width = Math.max(1, rect.width || window.innerWidth);
  const height = Math.max(1, rect.height || window.innerHeight);
  const pixelWidth = Math.ceil(width * CANVAS_SCALE);
  const pixelHeight = Math.ceil(height * CANVAS_SCALE);

  if (target.width !== pixelWidth || target.height !== pixelHeight) {
    target.width = pixelWidth;
    target.height = pixelHeight;
  }

  const context = target.getContext('2d');
  if (!context) return;

  context.clearRect(0, 0, pixelWidth, pixelHeight);
  context.save();
  context.scale(CANVAS_SCALE, CANVAS_SCALE);

  context.globalAlpha = getActivationOpacity(progress);
  context.globalCompositeOperation = 'lighter';
  drawQuietPerimeter(context, width, height);
  drawShimmerPerimeter(context, width, height, easeOutCubic(progress), gradientHeight || height);
  context.restore();
}

function getActivationOpacity(progress: number): number {
  if (progress < 0.16) return progress / 0.16;
  if (progress > 0.76) return Math.max(0, (1 - progress) / 0.24);
  return 1;
}

function drawQuietPerimeter(
  context: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  drawPerimeterStroke(context, width, height, 'rgba(62, 166, 255, 0.48)', 5);
}

function drawShimmerPerimeter(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  gradientHeight: number
): void {
  drawPerimeterStroke(
    context,
    width,
    height,
    createShimmerGradient(context, width, height, progress, gradientHeight),
    10
  );
}

function drawPerimeterStroke(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  strokeStyle: string | CanvasGradient,
  lineWidth: number
): void {
  const inset = PERIMETER_INSET;
  const radius = Math.min(18, width / 2 - inset, height / 2 - inset);

  context.save();
  context.strokeStyle = strokeStyle;
  context.lineWidth = lineWidth;
  strokeRoundedRect(context, inset, inset, width - inset * 2, height - inset * 2, radius);
  context.restore();
}

function createShimmerGradient(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  gradientHeight: number
): CanvasGradient {
  const rotation = progress * Math.PI * 2 - Math.PI * 0.8;
  // Fit the gradient's angles to the same proportions without scaling the border or blur.
  const scaleY = Math.max(1, height - PERIMETER_INSET * 2) /
    Math.max(1, gradientHeight - PERIMETER_INSET * 2);
  const projectAngle = (angle: number): number => Math.atan2(Math.sin(angle) * scaleY, Math.cos(angle));
  const startAngle = scaleY === 1 ? rotation : projectAngle(rotation);
  const gradient = context.createConicGradient(
    startAngle,
    width / 2,
    height / 2
  );
  function addColorStop(position: number, color: string): void {
    if (scaleY !== 1 && position > 0 && position < 1) {
      const angle = projectAngle(rotation + position * Math.PI * 2) - startAngle;
      position = (angle + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2);
    }
    gradient.addColorStop(position, color);
  }
  addColorStop(0, 'rgba(62, 166, 255, 0)');
  addColorStop(0.08, 'rgba(62, 166, 255, 0)');
  addColorStop(0.12, 'rgba(62, 166, 255, 0.5)');
  addColorStop(0.155, 'rgba(125, 211, 252, 1)');
  addColorStop(0.175, 'rgba(255, 255, 255, 1)');
  addColorStop(0.195, 'rgba(125, 211, 252, 1)');
  addColorStop(0.25, 'rgba(126, 87, 255, 0.42)');
  addColorStop(0.34, 'rgba(62, 166, 255, 0)');
  addColorStop(1, 'rgba(62, 166, 255, 0)');
  return gradient;
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function strokeRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
  context.stroke();
}
