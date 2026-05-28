/**
 * Inbox SVG helpers.
 *
 * Creates and swaps the outlined/full Inbox icons plus shared badge formatting
 * used by the header button and card controls.
 */
import {
  createAddIcon,
  createInboxIcon,
  INBOX_ICON_PATH,
  INBOX_TEXT_ICON_PATH
} from '../../shared/icons';

export { createAddIcon, createInboxIcon };

export function setInboxIcon(container: HTMLElement, inboxText: boolean): void {
  const icon = container.querySelector<SVGSVGElement>('svg');
  const path = icon?.querySelector<SVGPathElement>('path');
  const nextPath = inboxText ? INBOX_TEXT_ICON_PATH : INBOX_ICON_PATH;
  if (path && path.getAttribute('d') !== nextPath) {
    path.setAttribute('d', nextPath);
  }
}

export function formatBadgeCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}
