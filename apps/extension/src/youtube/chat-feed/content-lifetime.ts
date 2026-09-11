import { CONTENT_INSTANCE_ATTRIBUTE, CONTENT_INSTANCE_CLAIM_EVENT } from '../../shared/content-instance';
import { saveReconnectDraft } from '../reconnect-draft';

/**
 * Firefox removes content CSS and destroys the isolated script on disable, so
 * its runtime-port listener cannot restore chat. Observe CSS removal from the
 * existing page-world script instead. The empty probe needs no polling or
 * animation and never participates in YouTube's layout.
 */
export function watchContentStylesheet(): () => void {
  if (typeof ResizeObserver !== 'function') return () => undefined;

  const probe = document.createElement('span');
  probe.id = 'ytcq-content-lifetime';
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none;contain:strict';
  document.documentElement.append(probe);

  let armed = false;
  let reloadTimer = 0;
  const hasStylesheet = () => getComputedStyle(probe).height === '1px';
  const observer = new ResizeObserver(checkStylesheet);
  observer.observe(probe);
  document.addEventListener('visibilitychange', checkStylesheet);
  // A background tab may not render before disable. Content claims happen
  // after CSS injection, so arm even when ResizeObserver has not run yet.
  document.addEventListener(CONTENT_INSTANCE_CLAIM_EVENT, checkStylesheet);
  checkStylesheet();

  function checkStylesheet(): void {
    window.clearTimeout(reloadTimer);
    if (hasStylesheet()) {
      armed = true;
      return;
    }
    if (!armed || !probe.isConnected || document.visibilityState === 'hidden') return;
    if (!document.documentElement.hasAttribute(CONTENT_INSTANCE_ATTRIBUTE)) return;

    // A normal extension reload can briefly remove CSS before reinjecting it.
    reloadTimer = window.setTimeout(() => {
      if (!probe.isConnected || hasStylesheet() || document.visibilityState === 'hidden') return;
      saveReconnectDraft();
      cleanup();
      // Lite may have discarded the native list. A chat-only reload also
      // removes stranded controls and skin attributes without stopping video.
      location.reload();
    }, 250);
  }

  function cleanup(): void {
    window.clearTimeout(reloadTimer);
    observer.disconnect();
    document.removeEventListener('visibilitychange', checkStylesheet);
    document.removeEventListener(CONTENT_INSTANCE_CLAIM_EVENT, checkStylesheet);
    probe.remove();
  }

  return cleanup;
}
