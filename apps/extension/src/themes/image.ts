import { MAX_THEME_GIF_BYTES, MAX_THEME_IMAGE_LENGTH } from '../shared/custom-themes';

/** Normalize static rasters; retain GIF bytes so their frames and timing survive. */
export async function readThemeImage(file: File): Promise<string> {
  const animated = file.type === 'image/gif';
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) ||
    file.size > (animated ? MAX_THEME_GIF_BYTES : 10 * 1024 * 1024)) {
    throw new Error('Unsupported theme image');
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (animated) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    }
    const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
    // ytcq-allow-raw-create-element: This image conversion canvas is never inserted into the document.
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let format = 'image/webp';
    let data = canvas.toDataURL(format, 0.75);
    // Safari can return PNG when WebP encoding is unavailable. Use JPEG for
    // opaque images, while keeping PNG's alpha channel for transparent artwork.
    if (data.length > MAX_THEME_IMAGE_LENGTH && data.startsWith('data:image/png;')) {
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = false;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] !== 255) {
          transparent = true;
          break;
        }
      }
      format = transparent ? 'image/png' : 'image/jpeg';
      if (!transparent) data = canvas.toDataURL(format, 0.75);
    }
    // Fit the existing stored-image limit without changing the theme format.
    // Each pass reduces the dimensions and redraws from the original image.
    while (data.length > MAX_THEME_IMAGE_LENGTH) {
      const ratio = Math.min(0.85, Math.sqrt(MAX_THEME_IMAGE_LENGTH / data.length) * 0.95);
      const width = Math.max(1, Math.floor(canvas.width * ratio));
      const height = Math.max(1, Math.floor(canvas.height * ratio));
      if (width === canvas.width && height === canvas.height) throw new Error('Image too large');
      canvas.width = width;
      canvas.height = height;
      context.drawImage(image, 0, 0, width, height);
      data = canvas.toDataURL(format, 0.75);
    }
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}
