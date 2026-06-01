import { describe, expect, it } from 'vitest';
import {
  createInboxIcon,
  formatBadgeCount,
  setInboxIcon
} from './icons';
import {
  INBOX_ICON_PATH,
  INBOX_TEXT_ICON_PATH
} from '../../shared/icons';

describe('inbox icon helpers', () => {
  it('swaps the existing path between outline and text inbox variants', () => {
    const container = document.createElement('span');
    container.append(createInboxIcon());

    setInboxIcon(container, true);
    expect(container.querySelector('path')?.getAttribute('d')).toBe(INBOX_TEXT_ICON_PATH);

    setInboxIcon(container, false);
    expect(container.querySelector('path')?.getAttribute('d')).toBe(INBOX_ICON_PATH);
  });

  it('formats large badge counts in the compact YouTube-style form', () => {
    expect(formatBadgeCount(0)).toBe('0');
    expect(formatBadgeCount(42)).toBe('42');
    expect(formatBadgeCount(100)).toBe('99+');
  });
});
