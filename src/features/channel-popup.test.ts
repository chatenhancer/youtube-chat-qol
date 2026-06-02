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
});

function mockWindowNumber(key: 'outerHeight' | 'outerWidth' | 'screenX' | 'screenY', value: number): void {
  Object.defineProperty(window, key, {
    configurable: true,
    value
  });
}

function mockScreenNumber(key: 'availHeight' | 'availWidth', value: number): void {
  Object.defineProperty(window.screen, key, {
    configurable: true,
    value
  });
}
