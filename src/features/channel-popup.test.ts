import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getChannelUrl,
  openChannelWindow
} from './channel-popup';

describe('channel popup helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefers stable channel ids over author handles', () => {
    expect(getChannelUrl('UC Example/Channel', '@ExampleCreator')).toBe(
      'https://www.youtube.com/channel/UC%20Example%2FChannel'
    );
  });

  it('falls back to a clean author handle when no channel id exists', () => {
    expect(getChannelUrl(undefined, '@ExampleCreator Verified Verified')).toBe(
      'https://www.youtube.com/@ExampleCreator'
    );
  });

  it('returns an empty URL when neither a channel id nor handle is available', () => {
    expect(getChannelUrl(undefined, 'Example Creator')).toBe('');
  });

  it('does not open an empty channel URL', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    openChannelWindow('');

    expect(open).not.toHaveBeenCalled();
  });

  it('opens valid channel URLs in a popup-sized window', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    openChannelWindow('https://www.youtube.com/@ExampleCreator');

    expect(open).toHaveBeenCalledWith(
      'https://www.youtube.com/@ExampleCreator',
      'ytcq-profile',
      expect.stringContaining('width=486')
    );
    expect(open).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.stringContaining('height=680')
    );
  });

  it('positions the channel popup inside the available screen bounds', () => {
    mockWindowNumber('screenX', 20);
    mockWindowNumber('screenY', 40);
    mockWindowNumber('outerWidth', 320);
    mockWindowNumber('outerHeight', 500);
    mockScreenNumber('availWidth', 420);
    mockScreenNumber('availHeight', 360);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    openChannelWindow('https://www.youtube.com/@ExampleCreator');

    const features = String(open.mock.calls[0]?.[2]);
    expect(features).toContain('left=12');
    expect(features).toContain('top=12');
  });

  it('positions the channel popup relative to the embedded chat frame when available', () => {
    Object.defineProperty(window, 'frameElement', {
      configurable: true,
      value: {
        getBoundingClientRect: () => ({
          bottom: 550,
          height: 500,
          left: 20,
          right: 320,
          top: 50,
          width: 300,
          x: 20,
          y: 50,
          toJSON: () => ({})
        })
      }
    });
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: {
        innerHeight: 800,
        outerHeight: 900,
        screenX: 100,
        screenY: 200
      }
    });
    mockScreenNumber('availLeft', 50);
    mockScreenNumber('availTop', 30);
    mockScreenNumber('availWidth', 1200);
    mockScreenNumber('availHeight', 900);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    openChannelWindow('https://www.youtube.com/@ExampleCreator');

    const features = String(open.mock.calls[0]?.[2]);
    expect(features).toContain('left=432');
    expect(features).toContain('top=238');
  });

  it('falls back to the standalone window position when the frame position cannot be read', () => {
    Object.defineProperty(window, 'frameElement', {
      configurable: true,
      get: () => {
        throw new Error('frame unavailable');
      }
    });
    mockWindowNumber('screenX', 80);
    mockWindowNumber('screenY', 120);
    mockWindowNumber('outerWidth', 640);
    mockWindowNumber('outerHeight', 720);
    mockScreenNumber('availWidth', 1600);
    mockScreenNumber('availHeight', 1000);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    openChannelWindow('https://www.youtube.com/@ExampleCreator');

    const features = String(open.mock.calls[0]?.[2]);
    expect(features).toContain('left=732');
    expect(features).toContain('top=140');
  });
});

function mockWindowNumber(key: 'outerHeight' | 'outerWidth' | 'screenX' | 'screenY', value: number): void {
  Object.defineProperty(window, key, {
    configurable: true,
    value
  });
}

function mockScreenNumber(key: 'availHeight' | 'availLeft' | 'availTop' | 'availWidth', value: number): void {
  Object.defineProperty(window.screen, key, {
    configurable: true,
    value
  });
}
