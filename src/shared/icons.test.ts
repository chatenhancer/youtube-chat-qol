import { describe, expect, it } from 'vitest';
import {
  ADD_ICON_PATH,
  AVATAR_RING_ACTIVE_BADGE_PATH,
  AVATAR_RING_ADD_BADGE_PATH,
  BOLT_ICON_PATH,
  ICON_VIEW_BOX,
  INBOX_ICON_PATH,
  INBOX_TEXT_ICON_PATH,
  LOCK_ICON_PATH,
  MATERIAL_ICON_VIEW_BOX,
  TRANSLATE_ICON_PATH,
  createAddIcon,
  createAvatarRingIcon,
  createBoltIcon,
  createChannelIcon,
  createInboxIcon,
  createLockIcon,
  createSplitTranslateIcon,
  createSvgIcon,
  createTranslateIcon
} from './icons';

describe('shared SVG icon factories', () => {
  it('creates accessible inert SVG wrappers with the requested viewBox and path', () => {
    const icon = createSvgIcon(ICON_VIEW_BOX, ADD_ICON_PATH);

    expect(icon.getAttribute('viewBox')).toBe(ICON_VIEW_BOX);
    expect(icon.getAttribute('focusable')).toBe('false');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.querySelector('path')?.getAttribute('d')).toBe(ADD_ICON_PATH);
  });

  it('creates inbox icon variants from the shared paths', () => {
    expect(createInboxIcon().querySelector('path')?.getAttribute('d')).toBe(INBOX_ICON_PATH);
    expect(createInboxIcon(true).querySelector('path')?.getAttribute('d')).toBe(INBOX_TEXT_ICON_PATH);
  });

  it('uses the expected view boxes for material and non-material icons', () => {
    expect(createAddIcon().getAttribute('viewBox')).toBe(ICON_VIEW_BOX);
    expect(createTranslateIcon().getAttribute('viewBox')).toBe(MATERIAL_ICON_VIEW_BOX);
    expect(createTranslateIcon().querySelector('path')?.getAttribute('d')).toBe(TRANSLATE_ICON_PATH);
    expect(createChannelIcon().getAttribute('viewBox')).toBe(MATERIAL_ICON_VIEW_BOX);
    expect(createBoltIcon().getAttribute('viewBox')).toBe(MATERIAL_ICON_VIEW_BOX);
    expect(createBoltIcon().querySelector('path')?.getAttribute('d')).toBe(BOLT_ICON_PATH);
    expect(createBoltIcon().getAttribute('fill')).toBeNull();
    expect(createLockIcon().getAttribute('viewBox')).toBe(MATERIAL_ICON_VIEW_BOX);
    expect(createLockIcon().querySelector('path')?.getAttribute('d')).toBe(LOCK_ICON_PATH);
  });

  it('creates split translate icons with configurable classes', () => {
    const icon = createSplitTranslateIcon({
      iconClassName: 'translate-icon',
      sourceClassName: 'translate-source',
      targetClassName: 'translate-target'
    });
    const paths = [...icon.querySelectorAll('path')];

    expect(icon.getAttribute('class')).toBe('translate-icon');
    expect(icon.getAttribute('viewBox')).toBe(MATERIAL_ICON_VIEW_BOX);
    expect(paths.map((path) => path.getAttribute('class'))).toEqual(['translate-source', 'translate-target']);
  });

  it('creates an avatar-and-ring icon with add and active badge states', () => {
    const addIcon = createAvatarRingIcon();
    const activeIcon = createAvatarRingIcon(true);

    expect(addIcon.getAttribute('viewBox')).toBe(ICON_VIEW_BOX);
    expect(addIcon.querySelector('.ytcq-avatar-ring-icon-outline')).not.toBeNull();
    expect(
      addIcon.querySelector('.ytcq-avatar-ring-icon-badge-symbol')?.getAttribute('d')
    ).toBe(AVATAR_RING_ADD_BADGE_PATH);
    expect(
      activeIcon.querySelector('.ytcq-avatar-ring-icon-badge-symbol')?.getAttribute('d')
    ).toBe(AVATAR_RING_ACTIVE_BADGE_PATH);
  });
});
