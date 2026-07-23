/** Native chat-list ownership for Lite mode. */

export const NATIVE_LIST_SELECTOR = ['yt-live-chat-item-list-renderer', '#chat > #item-list'].join(
  ','
);
export const NATIVE_HIDDEN_CLASS = 'ytcq-lite-native-hidden';
export const NATIVE_PENDING_SEED_CLASS = 'ytcq-lite-native-seed-pending';
export const NATIVE_DISCARDED_ATTRIBUTE = 'data-ytcq-lite-native-discarded';

// Kept only so a new extension build can recover DOM retained by an older one.
export const NATIVE_RETAINER_ATTRIBUTE = 'data-ytcq-lite-native-retainer';
const MAX_TRACKED_DETACHED_NATIVE_LISTS = 8;

const detachedNativeListRefs: Array<WeakRef<HTMLElement>> = [];
let detachedNativeListRepopulationCount = 0;

export interface DetachedNativeListDiagnostics {
  aliveCount: number;
  reclaimedDescendantCount: number;
  repopulationCount: number;
  trackedCount: number;
}

/**
 * Removes the native renderer without retaining an extension reference to it.
 */
export function discardNativeList(nativeList: HTMLElement): void {
  // YouTube can retain the custom-element host through its template instance.
  // After disconnecting it, sever the expensive message subtree so a retained
  // host cannot keep thousands of descendants, decoded images, and listeners.
  nativeList.remove();
  nativeList.replaceChildren();
  detachedNativeListRefs.push(new WeakRef(nativeList));
  detachedNativeListRefs.splice(
    0,
    Math.max(0, detachedNativeListRefs.length - MAX_TRACKED_DETACHED_NATIVE_LISTS)
  );
  document.documentElement.setAttribute(NATIVE_DISCARDED_ATTRIBUTE, 'true');
}

/**
 * Samples detached native lists without keeping them alive. If YouTube still
 * owns and repopulates one, clear only that detached subtree and report the
 * reclaimed descendants so performance tests can prove whether it occurs.
 */
export function inspectDetachedNativeLists(): DetachedNativeListDiagnostics {
  let aliveCount = 0;
  let reclaimedDescendantCount = 0;
  const survivingRefs: Array<WeakRef<HTMLElement>> = [];
  detachedNativeListRefs.forEach((ref) => {
    const nativeList = ref.deref();
    if (!nativeList) return;
    aliveCount += 1;
    survivingRefs.push(ref);
    const descendantCount = nativeList.querySelectorAll('*').length;
    if (!descendantCount) return;
    reclaimedDescendantCount += descendantCount;
    detachedNativeListRepopulationCount += 1;
    nativeList.replaceChildren();
  });
  detachedNativeListRefs.length = 0;
  detachedNativeListRefs.push(...survivingRefs);
  return {
    aliveCount,
    reclaimedDescendantCount,
    repopulationCount: detachedNativeListRepopulationCount,
    trackedCount: detachedNativeListRefs.length
  };
}

export function resetDetachedNativeListDiagnostics(): void {
  detachedNativeListRefs.length = 0;
  detachedNativeListRepopulationCount = 0;
}

export function isNativeFeedDiscarded(): boolean {
  return document.documentElement.hasAttribute(NATIVE_DISCARDED_ATTRIBUTE);
}

export function revealConnectedNativeLists(): void {
  document
    .querySelectorAll<HTMLElement>([
      `.${NATIVE_HIDDEN_CLASS}`,
      `.${NATIVE_PENDING_SEED_CLASS}`
    ].join(','))
    .forEach(revealNativeList);
}

/**
 * Removes stale Lite UI and migrates the previous retained-node implementation.
 * A discarded marker is intentionally preserved: only a document reload can
 * rebuild a feed that the current document no longer owns.
 */
export function cleanupStaleLiteModeDom(): void {
  document
    .querySelectorAll<HTMLTemplateElement>(`template[${NATIVE_RETAINER_ATTRIBUTE}]`)
    .forEach((retainer) => {
      const retainedNativeList = retainer.content.querySelector<HTMLElement>(NATIVE_LIST_SELECTOR);
      if (retainedNativeList) {
        const connectedNativeList = findNativeList();
        if (connectedNativeList) revealNativeList(connectedNativeList);
        else {
          mountNativeList(retainedNativeList);
          revealNativeList(retainedNativeList);
        }
      }
      retainer.remove();
    });
  document.querySelectorAll<HTMLElement>('.ytcq-lite-root').forEach((root) => root.remove());
  revealConnectedNativeLists();
  if (findNativeList()) {
    document.documentElement.removeAttribute(NATIVE_DISCARDED_ATTRIBUTE);
  }
}

export function findNativeList(): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>(NATIVE_LIST_SELECTOR)).find(
      (element) => !element.closest(`template[${NATIVE_RETAINER_ATTRIBUTE}]`)
    ) || null
  );
}

function mountNativeList(nativeList: HTMLElement): void {
  const chatRenderer = document.querySelector<HTMLElement>('yt-live-chat-renderer');
  if (!chatRenderer) {
    (document.body || document.documentElement).append(nativeList);
    return;
  }
  const input = chatRenderer.querySelector<HTMLElement>('yt-live-chat-message-input-renderer');
  chatRenderer.insertBefore(nativeList, input?.parentElement === chatRenderer ? input : null);
}

function revealNativeList(nativeList: HTMLElement): void {
  nativeList.classList.remove(
    NATIVE_HIDDEN_CLASS,
    NATIVE_PENDING_SEED_CLASS
  );
  if (nativeList.getAttribute('aria-hidden') === 'true') {
    nativeList.removeAttribute('aria-hidden');
  }
}
