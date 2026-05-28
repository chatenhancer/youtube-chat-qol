/**
 * Inbox SVG helpers.
 *
 * Creates and swaps the outlined/full Inbox icons plus shared badge formatting
 * used by the header button and card controls.
 */
import { createSvgIcon } from '../../shared/icons';

const INBOX_ICON_VIEW_BOX = '0 0 24 24';
const INBOX_ICON_PATH = 'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm0 12h-4a3 3 0 0 1-6 0H5V5h14v10Z';
const INBOX_TEXT_ICON_PATH = 'M5 21a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5Zm0-6h4a3 3 0 0 0 6 0h4V5H5v10Zm3-5h8V8H8v2Zm0 3h6v-2H8v2Z';
const ADD_ICON_PATH = 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2Z';

export function createInboxIcon(inboxText = false): SVGSVGElement {
  return createSvgIcon(INBOX_ICON_VIEW_BOX, inboxText ? INBOX_TEXT_ICON_PATH : INBOX_ICON_PATH);
}

export function setInboxIcon(container: HTMLElement, inboxText: boolean): void {
  const icon = container.querySelector<SVGSVGElement>('svg');
  const path = icon?.querySelector<SVGPathElement>('path');
  const nextPath = inboxText ? INBOX_TEXT_ICON_PATH : INBOX_ICON_PATH;
  if (path && path.getAttribute('d') !== nextPath) {
    path.setAttribute('d', nextPath);
  }
}

export function createAddIcon(): SVGSVGElement {
  return createSvgIcon(INBOX_ICON_VIEW_BOX, ADD_ICON_PATH);
}

export function formatBadgeCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}
