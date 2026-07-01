import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Stick Around preview', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('lets CSS scale the preview canvas to the compact lobby card', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { renderStickAroundPreview } = await import('./preview');
    const container = document.createElement('div');

    renderStickAroundPreview(container);

    const canvas = container.querySelector<HTMLCanvasElement>('canvas');
    expect(canvas?.className).toBe('ytcq-games-preview-canvas');
    expect(canvas?.style.width).toBe('');
    expect(canvas?.style.height).toBe('');
  });
});
