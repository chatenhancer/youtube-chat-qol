import { getOptions } from '../shared/state';

const CHANNEL_WINDOW_WIDTH = 486;
const CHANNEL_WINDOW_HEIGHT = 680;
const CHANNEL_WINDOW_MARGIN = 12;

export function getChannelUrl(channelId: string | undefined, authorName: string): string {
  if (channelId) {
    return `https://www.youtube.com/channel/${encodeURIComponent(channelId)}`;
  }

  if (authorName?.startsWith('@')) {
    return `https://www.youtube.com/${authorName}`;
  }

  return '';
}

export function openChannelWindow(url: string): void {
  if (!url) return;

  const features = getOptions().openProfilesInPopup
    ? getChannelWindowFeatures()
    : 'noopener';
  window.open(url, 'ytcq-profile', features);
}

function getChannelWindowFeatures(): string {
  const position = getChannelWindowPosition();
  return [
    'popup=yes',
    `width=${CHANNEL_WINDOW_WIDTH}`,
    `height=${CHANNEL_WINDOW_HEIGHT}`,
    `left=${position.left}`,
    `top=${position.top}`,
    'menubar=no',
    'toolbar=no',
    'location=yes',
    'status=no',
    'scrollbars=yes',
    'resizable=yes'
  ].join(',');
}

function getChannelWindowPosition(): { left: number; top: number } {
  const screenRect = getAvailableScreenRect();
  const chatRect = getChatScreenRect();

  let left = chatRect.left - CHANNEL_WINDOW_WIDTH - CHANNEL_WINDOW_MARGIN;
  if (left < screenRect.left + CHANNEL_WINDOW_MARGIN) {
    left = chatRect.left + chatRect.width + CHANNEL_WINDOW_MARGIN;
  }

  const top = chatRect.top + Math.max(CHANNEL_WINDOW_MARGIN, (chatRect.height - CHANNEL_WINDOW_HEIGHT) / 2);

  const leftMin = screenRect.left + CHANNEL_WINDOW_MARGIN;
  const leftMax = screenRect.left + screenRect.width - CHANNEL_WINDOW_WIDTH - CHANNEL_WINDOW_MARGIN;
  const topMin = screenRect.top + CHANNEL_WINDOW_MARGIN;
  const topMax = screenRect.top + screenRect.height - CHANNEL_WINDOW_HEIGHT - CHANNEL_WINDOW_MARGIN;

  return {
    left: Math.round(clamp(left, leftMin, leftMax)),
    top: Math.round(clamp(top, topMin, topMax))
  };
}

function getChatScreenRect(): { left: number; top: number; width: number; height: number } {
  try {
    const frame = window.frameElement as HTMLElement | null;
    if (frame && window.parent !== window) {
      const frameRect = frame.getBoundingClientRect();
      const parentChromeTop = Math.max(0, window.parent.outerHeight - window.parent.innerHeight);

      return {
        left: window.parent.screenX + frameRect.left,
        top: window.parent.screenY + parentChromeTop + frameRect.top,
        width: frameRect.width,
        height: frameRect.height
      };
    }
  } catch {
    // Fall through to the standalone chat-window approximation.
  }

  return {
    left: window.screenX,
    top: window.screenY,
    width: window.outerWidth || window.innerWidth,
    height: window.outerHeight || window.innerHeight
  };
}

function getAvailableScreenRect(): { left: number; top: number; width: number; height: number } {
  const screenWithOffsets = window.screen as Screen & { availLeft?: number; availTop?: number };
  const left = Number.isFinite(screenWithOffsets.availLeft) ? Number(screenWithOffsets.availLeft) : 0;
  const top = Number.isFinite(screenWithOffsets.availTop) ? Number(screenWithOffsets.availTop) : 0;

  return {
    left,
    top,
    width: window.screen.availWidth || window.screen.width,
    height: window.screen.availHeight || window.screen.height
  };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}
