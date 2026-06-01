import { beforeEach, describe, expect, it, vi } from 'vitest';

const channelPopupMocks = vi.hoisted(() => ({
  openChannelWindow: vi.fn()
}));

vi.mock('../channel-popup', () => channelPopupMocks);

import { createAvatarElement, createProfileAvatarButton } from './elements';

describe('profile popup element helpers', () => {
  beforeEach(() => {
    channelPopupMocks.openChannelWindow.mockClear();
  });

  it('creates a non-referrer avatar image for profile cards', () => {
    const avatar = createAvatarElement('https://example.com/avatar.jpg');

    expect(avatar.dataset.ytcqManaged).toBe('true');
    expect(avatar.className).toBe('ytcq-profile-card-avatar');
    expect(avatar.src).toBe('https://example.com/avatar.jpg');
    expect(avatar.alt).toBe('');
    expect(avatar.referrerPolicy).toBe('no-referrer');
  });

  it('wraps the avatar in a channel button with an open-channel icon', () => {
    const avatar = createAvatarElement('https://example.com/avatar.jpg');
    const button = createProfileAvatarButton(avatar, 'https://www.youtube.com/@viewer');

    expect(button.type).toBe('button');
    expect(button.className).toBe('ytcq-profile-card-avatar-button');
    expect(button.title).toBe('Open channel');
    expect(button.getAttribute('aria-label')).toBe('Open channel');
    expect(button.contains(avatar)).toBe(true);
    expect(button.querySelector('.ytcq-profile-card-avatar-open-icon')).not.toBeNull();

    button.click();
    expect(channelPopupMocks.openChannelWindow).toHaveBeenCalledWith('https://www.youtube.com/@viewer');
  });
});
