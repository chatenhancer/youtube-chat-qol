interface GameLoadingSpinnerOptions {
  color: string;
  lineWidth?: number;
  now: number;
  radius?: number;
  trackColor?: string;
  x: number;
  y: number;
}

const SPINNER_TURN_MS = 900;
const SPINNER_SWEEP_RADIANS = Math.PI * 1.45;

export function drawGameLoadingSpinner(
  context: CanvasRenderingContext2D,
  {
    color,
    lineWidth = 3,
    now,
    radius = 12,
    trackColor = 'rgba(0, 0, 0, 0.12)',
    x,
    y
  }: GameLoadingSpinnerOptions
): void {
  const startAngle = ((now % SPINNER_TURN_MS) / SPINNER_TURN_MS) * Math.PI * 2;

  context.save();
  context.lineCap = 'round';
  context.lineWidth = lineWidth;
  context.strokeStyle = trackColor;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.stroke();

  context.strokeStyle = color;
  context.beginPath();
  context.arc(x, y, radius, startAngle, startAngle + SPINNER_SWEEP_RADIANS);
  context.stroke();
  context.restore();
}
