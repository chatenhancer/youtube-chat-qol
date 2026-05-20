/**
 * Browser-tab mention alert.
 *
 * YouTube live chat runs inside an iframe, but the iframe is same-origin with
 * the watch page. When possible, update the top document's title/favicon so a
 * background tab can signal unread chat mentions without adding more controls.
 */
const ALERT_FAVICON_ID = 'ytcq-tab-alert-favicon';
const ALERT_STATE_DATASET_KEY = 'ytcqTabAlertActive';
const TITLE_PREFIX_PATTERN = /^\((?:\d+|99\+)\)\s+/;

let listenersAttached = false;
let alertActive = false;

export function initMentionTabAlert(): void {
  if (listenersAttached) return;
  listenersAttached = true;

  addVisibilityListener(document);
  addFocusListener(window);

  const topDocument = getTopDocument();
  if (topDocument && topDocument !== document) {
    addVisibilityListener(topDocument);
  }

  const topWindow = getTopWindow();
  if (topWindow && topWindow !== window) {
    addFocusListener(topWindow);
  }
}

export function showMentionTabAlert(unreadCount: number): void {
  if (isCurrentTabActive()) {
    clearMentionTabAlert();
    return;
  }

  const topDocument = getTopDocument();
  if (!topDocument) return;

  alertActive = true;
  topDocument.documentElement.dataset[ALERT_STATE_DATASET_KEY] = 'true';
  topDocument.title = `(${formatAlertCount(unreadCount)}) ${stripAlertPrefix(topDocument.title)}`;
  setAlertFavicon(topDocument);
}

export function clearMentionTabAlert(): void {
  const topDocument = getTopDocument();
  if (!topDocument) return;

  const alertFavicon = topDocument.getElementById(ALERT_FAVICON_ID);
  if (alertActive || alertFavicon || topDocument.documentElement.dataset[ALERT_STATE_DATASET_KEY] === 'true') {
    topDocument.title = stripAlertPrefix(topDocument.title);
    alertFavicon?.remove();
    delete topDocument.documentElement.dataset[ALERT_STATE_DATASET_KEY];
  }

  alertActive = false;
}

export function isCurrentTabActive(): boolean {
  const topDocument = getTopDocument();
  if (!topDocument) {
    return document.visibilityState === 'visible' && document.hasFocus();
  }

  return topDocument.visibilityState === 'visible' && topDocument.hasFocus();
}

function addVisibilityListener(targetDocument: Document): void {
  targetDocument.addEventListener('visibilitychange', clearAlertIfTabActive, true);
}

function addFocusListener(targetWindow: Window): void {
  targetWindow.addEventListener('focus', clearAlertIfTabActive, true);
}

function clearAlertIfTabActive(): void {
  if (isCurrentTabActive()) {
    clearMentionTabAlert();
  }
}

function getTopDocument(): Document | null {
  try {
    return window.top?.document || document;
  } catch {
    return document;
  }
}

function getTopWindow(): Window | null {
  try {
    return window.top || window;
  } catch {
    return window;
  }
}

function setAlertFavicon(topDocument: Document): void {
  const head = topDocument.head || topDocument.documentElement;
  if (!head) return;

  let link = topDocument.getElementById(ALERT_FAVICON_ID) as HTMLLinkElement | null;
  if (!link) {
    link = topDocument.createElement('link');
    link.id = ALERT_FAVICON_ID;
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    head.append(link);
  }

  link.href = `data:image/svg+xml,${encodeURIComponent(createAlertFaviconSvg())}`;
}

function createAlertFaviconSvg(): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
    '<rect x="7" y="14" width="50" height="36" rx="11" fill="#f00"/>',
    '<path d="M27 24v16l16-8-16-8Z" fill="#fff"/>',
    '<circle cx="49" cy="15" r="12" fill="#3ea6ff" stroke="#fff" stroke-width="4"/>',
    '</svg>'
  ].join('');
}

function stripAlertPrefix(title: string): string {
  return title.replace(TITLE_PREFIX_PATTERN, '');
}

function formatAlertCount(count: number): string {
  if (count > 99) return '99+';
  return String(Math.max(1, count));
}
