/**
 * Read the current YouTube video position from an accessible watch page.
 *
 * Live-chat content scripts normally run in YouTube's same-origin iframe, so
 * the parent watch page and its video element are directly accessible.
 */
export function getCurrentYouTubeVideoOffsetSeconds(): number | null {
  const contexts = [window.top, window.parent, window];

  for (const context of contexts) {
    if (!context) continue;

    try {
      const currentTime = context.document.querySelector<HTMLVideoElement>('video')?.currentTime;
      if (typeof currentTime === 'number' && Number.isFinite(currentTime) && currentTime >= 0) {
        return Math.floor(currentTime);
      }
    } catch {
      // Embedded or pop-out chat may not share an origin with its parent.
    }
  }

  return null;
}
