import { describe, expect, it, vi } from 'vitest';

import {
  drawPlaygroundCanvasAvatar,
  getPlaygroundCanvasAvatarBaselineOffset
} from './playground-avatar';

describe('Playground canvas avatar', () => {
  it('uses text metrics to optically center avatar initials', () => {
    const context = createMockContext({
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2,
      width: 8
    });

    drawPlaygroundCanvasAvatar(context as unknown as CanvasRenderingContext2D, {
      displayName: 'You',
      userId: 'host-user'
    }, 40, 50, 17);

    expect(context.arc).toHaveBeenCalledWith(40, 50, 17, 0, Math.PI * 2);
    expect(context.textBaseline).toBe('alphabetic');
    expect(context.font).toBe('500 17px Roboto, Arial, sans-serif');
    expect(context.fillText).toHaveBeenCalledWith('Y', 40, 54);
  });

  it('falls back to a font-size offset when detailed metrics are unavailable', () => {
    expect(getPlaygroundCanvasAvatarBaselineOffset({ width: 8 } as TextMetrics, 20)).toBe(7);
  });
});

function createMockContext(metrics: Partial<TextMetrics>) {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    fill: vi.fn(),
    fillStyle: '',
    fillText: vi.fn(),
    font: '',
    measureText: vi.fn(() => metrics as TextMetrics),
    restore: vi.fn(),
    save: vi.fn(),
    textAlign: 'start',
    textBaseline: 'alphabetic'
  };
}
