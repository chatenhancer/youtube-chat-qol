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
});
