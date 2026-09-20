export interface ThemeImageColor {
  color: string;
  opacity: number;
}

export type ThemeImageColors = ReadonlyMap<string, ThemeImageColor | null>;

/** A small, alpha-weighted sample of a normalized local raster. */
export async function readThemeImageColor(source: string): Promise<ThemeImageColor> {
  const image = new Image();
  image.src = source;
  await image.decode();
  // ytcq-allow-raw-create-element: This sampling canvas is never inserted into the document.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  context.drawImage(image, 0, 0, 16, 16);
  const pixels = context.getImageData(0, 0, 16, 16).data;
  const channels = [0, 0, 0];
  let alpha = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const opacity = pixels[index + 3] / 255;
    alpha += opacity;
    for (let channel = 0; channel < 3; channel++) channels[channel] += pixels[index + channel] * opacity;
  }
  return {
    color: '#' + channels.map(value => Math.round(alpha ? value / alpha : 0).toString(16).padStart(2, '0')).join(''),
    opacity: alpha / (16 * 16)
  };
}
