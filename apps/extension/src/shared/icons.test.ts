import { describe, expect, it } from 'vitest';
import {
  createAddIcon,
  createAvatarRingIcon,
  AVATAR_RING_ACTIVE_BADGE_PATH,
  AVATAR_RING_ADD_BADGE_PATH,
  createLiteModeIcon,
  createChannelIcon,
  createInboxIcon,
  createLockIcon,
  createSoundBellIcon,
  createSplitTranslateIcon,
  createSvgIcon,
  createTranslateIcon
} from './icons';

describe('shared SVG icon factories', () => {
  it('creates inert SVG wrappers with the supplied viewBox and drawing', () => {
    const icon = createSvgIcon('0 0 24 24', 'M0 0L24 24');

    expect(icon.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(icon.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(icon.getAttribute('focusable')).toBe('false');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.querySelector('path')?.getAttribute('d')).toBe('M0 0L24 24');
  });

  it('provides distinct drawings for different actions and Inbox states', () => {
    const icons = [
      createAddIcon(), createTranslateIcon(), createChannelIcon(),
      createLiteModeIcon(), createLockIcon(), createInboxIcon(), createInboxIcon(true)
    ];
    const drawings = icons.map((icon) => icon.querySelector('path')?.getAttribute('d'));

    expect(drawings.every(Boolean)).toBe(true);
    expect(new Set(drawings).size).toBe(icons.length);
    expect(icons.every((icon) => icon.hasAttribute('viewBox'))).toBe(true);
  });

  it('creates split translate icons with configurable classes', () => {
    const icon = createSplitTranslateIcon({
      iconClassName: 'translate-icon',
      sourceClassName: 'translate-source',
      targetClassName: 'translate-target'
    });

    expect(icon.getAttribute('class')).toBe('translate-icon');
    expect([...icon.querySelectorAll('path')].map((path) => path.getAttribute('class'))).toEqual([
      'translate-source', 'translate-target'
    ]);
  });

  it('distinguishes quiet and ringing sound states', () => {
    expect(createSoundBellIcon().querySelector('.ytcq-bell-ring')).toBeNull();
    expect(createSoundBellIcon(true).querySelector('.ytcq-bell-ring')).not.toBeNull();
  });

  it('distinguishes adding a marked user from an already marked user', () => {
    const addIcon = createAvatarRingIcon();
    const activeIcon = createAvatarRingIcon(true);
    expect(addIcon.querySelector('.ytcq-avatar-ring-icon-badge-symbol')?.getAttribute('d')).toBe(
      AVATAR_RING_ADD_BADGE_PATH
    );
    expect(activeIcon.querySelector('.ytcq-avatar-ring-icon-badge-symbol')?.getAttribute('d')).toBe(
      AVATAR_RING_ACTIVE_BADGE_PATH
    );
  });
});
