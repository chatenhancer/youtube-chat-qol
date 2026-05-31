/**
 * Browser-tab inbox alert.
 *
 * YouTube live chat runs inside an iframe, but the iframe is same-origin with
 * the watch page. When possible, update the top document's title/favicon so a
 * background tab can signal unread inbox messages without adding more controls.
 */
const ALERT_FAVICON_CLASS = 'ytcq-tab-alert-favicon';
const ALERT_STATE_DATASET_KEY = 'ytcqTabAlertActive';
const TITLE_PREFIX_PATTERN = /^\((?:\d+|99\+)\)\s+/;
const FAVICON_SELECTOR = 'link[rel~="icon"], link[rel~="shortcut"][rel~="icon"]';
const ALERT_FAVICON_SIZES = ['32x32', '48x48', '96x96', '144x144'];

let listenersAttached = false;
let alertActive = false;
let originalFaviconLinks: HTMLLinkElement[] = [];

export function initInboxTabAlert(): void {
  if (listenersAttached) return;
  listenersAttached = true;

  addClearListeners(document, window);

  const topDocument = getTopDocument();
  const topWindow = getTopWindow();
  if (topDocument && topDocument !== document) {
    addClearListeners(topDocument, topWindow || window);
  }
}

export function showInboxTabAlert(unreadCount: number): void {
  if (isCurrentTabActive()) {
    clearInboxTabAlert();
    return;
  }

  const topDocument = getTopDocument();
  if (!topDocument) return;

  alertActive = true;
  topDocument.documentElement.dataset[ALERT_STATE_DATASET_KEY] = 'true';
  topDocument.title = `(${formatAlertCount(unreadCount)}) ${stripAlertPrefix(topDocument.title)}`;
  setAlertFavicon(topDocument);
}

export function clearInboxTabAlert(): void {
  const topDocument = getTopDocument();
  if (!topDocument) return;

  const alertFavicons = getAlertFaviconLinks(topDocument);
  if (alertActive || alertFavicons.length || topDocument.documentElement.dataset[ALERT_STATE_DATASET_KEY] === 'true') {
    topDocument.title = stripAlertPrefix(topDocument.title);
    removeAlertFavicons(topDocument);
    restoreOriginalFavicon(topDocument);
    delete topDocument.documentElement.dataset[ALERT_STATE_DATASET_KEY];
  }

  alertActive = false;
  originalFaviconLinks = [];
}

export function isCurrentTabActive(): boolean {
  const topDocument = getTopDocument();
  if (!topDocument) {
    return document.visibilityState === 'visible';
  }

  return topDocument.visibilityState === 'visible';
}

function addClearListeners(targetDocument: Document, targetWindow: Window): void {
  targetDocument.addEventListener('visibilitychange', clearAlertIfTabActive, true);
  targetWindow.addEventListener('focus', clearAlertIfTabActive, true);
  targetDocument.addEventListener('pointerdown', clearAlertIfTabActive, true);
  targetDocument.addEventListener('keydown', clearAlertIfTabActive, true);
}

function clearAlertIfTabActive(): void {
  if (isCurrentTabActive()) {
    clearInboxTabAlert();
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

  if (!originalFaviconLinks.length) {
    originalFaviconLinks = getPageFaviconLinks(topDocument).map((link) => link.cloneNode(true) as HTMLLinkElement);
  }

  getPageFaviconLinks(topDocument).forEach((link) => link.remove());
  removeAlertFavicons(topDocument);

  const href = createAlertFaviconHref();
  ALERT_FAVICON_SIZES.forEach((size) => {
    const link = topDocument.createElement('link');
    link.className = ALERT_FAVICON_CLASS;
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    link.setAttribute('sizes', size);
    link.href = href;
    head.append(link);
  });
}

function restoreOriginalFavicon(topDocument: Document): void {
  const head = topDocument.head || topDocument.documentElement;
  if (!head) return;

  getAlertFaviconLinks(topDocument).forEach((link) => link.remove());
  if (!originalFaviconLinks.length) return;
  getPageFaviconLinks(topDocument).forEach((link) => link.remove());

  originalFaviconLinks.forEach((link) => {
    head.append(link.cloneNode(true));
  });
}

function getPageFaviconLinks(topDocument: Document): HTMLLinkElement[] {
  return Array.from(topDocument.querySelectorAll<HTMLLinkElement>(FAVICON_SELECTOR))
    .filter((link) => !link.classList.contains(ALERT_FAVICON_CLASS));
}

function getAlertFaviconLinks(topDocument: Document): HTMLLinkElement[] {
  return Array.from(topDocument.querySelectorAll<HTMLLinkElement>(`.${ALERT_FAVICON_CLASS}`));
}

function removeAlertFavicons(topDocument: Document): void {
  getAlertFaviconLinks(topDocument).forEach((link) => link.remove());
}

function createAlertFaviconHref(): string {
  return `data:image/svg+xml,${encodeURIComponent(createAlertFaviconSvg())}#${Date.now()}`;
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
