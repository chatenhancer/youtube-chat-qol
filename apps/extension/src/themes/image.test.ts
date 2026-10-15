import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_THEME_GIF_BYTES, MAX_THEME_IMAGE_LENGTH, normalizeThemeImage } from '../shared/custom-themes';
import { readThemeImage } from './image';

const smallWebp = 'data:image/webp;base64,AAAA';
const smallPng = 'data:image/png;base64,AAAA';
const smallJpeg = 'data:image/jpeg;base64,AAAA';
const largePng = `data:image/png;base64,${'A'.repeat(MAX_THEME_IMAGE_LENGTH)}`;

describe('theme image import', () => {
  const decode = vi.fn<() => Promise<void>>();
  const drawImage = vi.fn();
  const getImageData = vi.fn();
  const createObjectURL = vi.fn(() => 'blob:theme-image');
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    decode.mockResolvedValue(undefined);
    getImageData.mockReturnValue({ data: new Uint8ClampedArray([20, 30, 40, 255]) });
    vi.stubGlobal('Image', class {
      naturalWidth = 1600;
      naturalHeight = 800;
      src = '';
      decode = decode;
    });
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage, getImageData
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(smallWebp);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps the existing WebP output and aspect ratio when it fits', async () => {
    expect(await readThemeImage(new File(['image'], 'image.png', { type: 'image/png' }))).toBe(smallWebp);
    expect(drawImage).toHaveBeenCalledWith(expect.any(Image), 0, 0, 1200, 600);
    expect(getImageData).not.toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:theme-image');
  });

  it('uses JPEG for an opaque image when Safari falls back to an oversized PNG', async () => {
    vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockReturnValueOnce(largePng).mockReturnValue(smallJpeg);
    const result = await readThemeImage(new File(['image'], 'photo.png', { type: 'image/png' }));
    expect(result).toBe(smallJpeg);
    expect(normalizeThemeImage(result)).toBe(result);
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenLastCalledWith('image/jpeg', 0.75);
    expect(drawImage).toHaveBeenCalledOnce();
  });

  it('retains transparency and reduces PNG dimensions to fit the stored limit', async () => {
    getImageData.mockReturnValue({ data: new Uint8ClampedArray([20, 30, 40, 128]) });
    vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockImplementation(function (this: HTMLCanvasElement) {
      return this.width > 900 ? largePng : smallPng;
    });
    const result = await readThemeImage(new File(['image'], 'frame.png', { type: 'image/png' }));
    expect(result).toBe(smallPng);
    expect(normalizeThemeImage(result)).toBe(result);
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenLastCalledWith('image/png', 0.75);
    const [, , , width, height] = drawImage.mock.lastCall!;
    expect(width).toBeLessThan(1200);
    expect(Math.abs(width / height - 2)).toBeLessThan(0.01);
  });

  it('also fits oversized WebP output without losing its alpha support', async () => {
    vi.mocked(HTMLCanvasElement.prototype.toDataURL)
      .mockReturnValueOnce(`data:image/webp;base64,${'A'.repeat(MAX_THEME_IMAGE_LENGTH)}`)
      .mockReturnValue(smallWebp);
    expect(await readThemeImage(new File(['image'], 'image.png', { type: 'image/png' }))).toBe(smallWebp);
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenLastCalledWith('image/webp', 0.75);
    expect(getImageData).not.toHaveBeenCalled();
  });

  it('preserves GIF bytes without canvas conversion', async () => {
    const result = await readThemeImage(new File(['GIF89a'], 'animated.gif', { type: 'image/gif' }));
    expect(result).toBe('data:image/gif;base64,R0lGODlh');
    expect(drawImage).not.toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:theme-image');
  });

  it.each([
    ['image/svg+xml', 10], ['image/png', 10 * 1024 * 1024 + 1], ['image/gif', MAX_THEME_GIF_BYTES + 1]
  ])('keeps the upload limits for %s (%i bytes)', async (type, size) => {
    const file = new File(['image'], 'image', { type });
    Object.defineProperty(file, 'size', { value: size });
    await expect(readThemeImage(file)).rejects.toThrow('Unsupported theme image');
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
