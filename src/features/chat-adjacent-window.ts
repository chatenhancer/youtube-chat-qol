const DEFAULT_WINDOW_MARGIN = 12;

export interface ChatAdjacentWindowOptions {
  height: number;
  width: number;
}

export function getChatAdjacentWindowFeatures(options: ChatAdjacentWindowOptions): string {
  const position = getChatAdjacentWindowPosition(options);
  return [
    'popup=yes',
    `width=${options.width}`,
    `height=${options.height}`,
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

function getChatAdjacentWindowPosition(options: ChatAdjacentWindowOptions): { left: number; top: number } {
  const screenRect = getAvailableScreenRect();
  const chatRect = getChatScreenRect();

  let left = chatRect.left - options.width - DEFAULT_WINDOW_MARGIN;
  if (left < screenRect.left + DEFAULT_WINDOW_MARGIN) {
    left = chatRect.left + chatRect.width + DEFAULT_WINDOW_MARGIN;
  }

  const top = chatRect.top + Math.max(DEFAULT_WINDOW_MARGIN, (chatRect.height - options.height) / 2);

  const leftMin = screenRect.left + DEFAULT_WINDOW_MARGIN;
  const leftMax = screenRect.left + screenRect.width - options.width - DEFAULT_WINDOW_MARGIN;
  const topMin = screenRect.top + DEFAULT_WINDOW_MARGIN;
  const topMax = screenRect.top + screenRect.height - options.height - DEFAULT_WINDOW_MARGIN;

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
