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
    const data = canvas.toDataURL('image/webp', 0.75);
    if (data.length > MAX_THEME_IMAGE_LENGTH) throw new Error('Image too large');
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}
