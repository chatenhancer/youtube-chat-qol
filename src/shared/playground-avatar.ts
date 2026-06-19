import {
  getPlaygroundAvatarPresentation,
  type PlaygroundAvatarIdentity
} from './playground-identity';

export interface PlaygroundCanvasAvatarOptions {
  fontFamily?: string;
  fontWeight?: number;
  minFontSize?: number;
}

export function drawPlaygroundCanvasAvatar(
  context: CanvasRenderingContext2D,
  identity: PlaygroundAvatarIdentity,
  x: number,
  y: number,
  radius: number,
  options: PlaygroundCanvasAvatarOptions = {}
): void {
  const presentation = getPlaygroundAvatarPresentation(identity);
  const fontSize = Math.max(options.minFontSize ?? 12, radius);
  const fontFamily = options.fontFamily ?? 'Roboto, Arial, sans-serif';
  const fontWeight = options.fontWeight ?? 500;

  context.save();
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = presentation.backgroundColor;
  context.fill();
  context.fillStyle = presentation.foregroundColor;
  context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  context.fillText(
    presentation.initial,
    x,
    y + getPlaygroundCanvasAvatarBaselineOffset(context.measureText(presentation.initial), fontSize)
  );
  context.restore();
}

export function getPlaygroundCanvasAvatarBaselineOffset(metrics: TextMetrics, fontSize: number): number {
  const ascent = metrics.actualBoundingBoxAscent;
  const descent = metrics.actualBoundingBoxDescent;
  if (Number.isFinite(ascent) && Number.isFinite(descent) && ascent > 0) {
    return (ascent - descent) / 2;
  }
  return fontSize * 0.35;
}
