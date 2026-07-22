/**
 * Dispatches content-script events to features running in YouTube live chat.
 *
 * `enabled-features.ts` imports each feature, and the feature calls
 * `registerFeature` to subscribe to the events it needs. `content/index.ts`
 * owns startup and the shared `MutationObserver`, normalizes browser events,
 * and sends them here.
 *
 * One failing hook does not stop the others, and features must not depend on
 * registration order. Mutation hooks run before message hooks for the same
 * observer batch. Cross-feature data should use shared feeds or stable IDs.
 * Extension-managed UI is ignored so adding it does not trigger feature work.
 */
import type { Options } from '../shared/options';
import { isExtensionManagedElement } from '../shared/managed-dom';
import { clearToast } from '../shared/toast';

type LifecycleCallback = () => void;
type InitCallback = (context: FeatureInitContext) => void;
type OptionsChangedCallback = (previousOptions: Options, nextOptions: Options) => void;
type VisibilityChangedCallback = (visibilityState: Document['visibilityState']) => void;
type MessageCallback = (message: HTMLElement, context: FeatureMessageContext) => void;
type MutationCallback = (batch: FeatureMutationBatch) => void;
type ParticipantCallback = (participant: HTMLElement) => void;
export type FeatureMessageSource = 'existing' | 'added' | 'changed';

/** Save a partial option update through the content script. */
export type SaveOptions = (values: Partial<Options>) => void;

/** Services available to `page.init` hooks. */
export interface FeatureInitContext {
  saveOptions: SaveOptions;
}

export interface FeatureMessageContext {
  /** `existing` for scans, `added` for insertion, or `changed` for later DOM updates. */
  source: FeatureMessageSource;
}

/** Observer data for structural feature work. Message hooks run separately. */
export interface FeatureMutationBatch {
  /** Added elements after extension-owned nodes have been filtered out. */
  addedElements: Element[];

  /**
   * Original records not fully ignored by the shared observer. Mixed node lists
   * can still contain managed nodes. Message changes are dispatched separately.
   */
  mutations: MutationRecord[];
}

export interface FeaturePageLifecycle {
  /** Runs after options load and the first message and participant scans. */
  boot?: LifecycleCallback;

  /** Runs after stale cleanup and locale setup, before options load. */
  init?: InitCallback;

  /**
   * Runs before initialization and when this content instance stops. It must be
   * idempotent and safe to call before `init`.
   */
  cleanup?: LifecycleCallback;

  /** Resets in-page state without clearing browser storage. */
  reset?: LifecycleCallback;

  /** Runs after normalized options change. */
  optionsChanged?: OptionsChangedCallback;

  /** Runs after a foreground rescan of visible messages. */
  visibleRecovery?: LifecycleCallback;

  /** Runs immediately when the chat document visibility changes. */
  visibilityChanged?: VisibilityChangedCallback;
}

/** Extra filters for feature-owned edits to YouTube-rendered DOM. */
export interface FeatureObserverIgnore {
  /**
   * Return true for an added node the feature owns. Managed extension elements
   * are already ignored automatically.
   */
  addedNode?: (element: Element) => boolean;

  /** Return true for a mutation target changed by the feature itself. */
  mutation?: (element: Element) => boolean;
}

export interface ContentFeature {
  /** Whole-page setup, cleanup, options, and visibility hooks. */
  page?: FeaturePageLifecycle;

  /** Runs for a YouTube chat message renderer. */
  message?: MessageCallback;

  /** Runs once for each normalized non-message observer batch. */
  mutation?: MutationCallback;

  /** Runs for a YouTube participant-list renderer. */
  participant?: ParticipantCallback;

  /** Prevents feature-owned YouTube DOM edits from feeding back into the observer. */
  observerIgnore?: FeatureObserverIgnore;
}

const bootCallbacks: LifecycleCallback[] = [];
const initCallbacks: InitCallback[] = [];
const messageCallbacks: MessageCallback[] = [];
const mutationCallbacks: MutationCallback[] = [];
const cleanupCallbacks: LifecycleCallback[] = [clearToast];
const resetCallbacks: LifecycleCallback[] = [clearToast];
const optionsChangedCallbacks: OptionsChangedCallback[] = [];
const visibleRecoveryCallbacks: LifecycleCallback[] = [];
const visibilityChangedCallbacks: VisibilityChangedCallback[] = [];
const participantCallbacks: ParticipantCallback[] = [];
const observerIgnoreAddedNodeCallbacks: ((element: Element) => boolean)[] = [];
const observerIgnoreMutationCallbacks: ((element: Element) => boolean)[] = [];
let featuresSuspended = false;

/** Register one feature's hooks during `enabled-features.ts` module loading. */
export function registerFeature(feature: ContentFeature): void {
  const { page, message, mutation, participant, observerIgnore } = feature;
  if (page?.boot) bootCallbacks.push(page.boot);
  if (page?.init) initCallbacks.push(page.init);
  if (page?.cleanup) cleanupCallbacks.push(page.cleanup);
  if (page?.reset) resetCallbacks.push(page.reset);
  if (page?.optionsChanged) optionsChangedCallbacks.push(page.optionsChanged);
  if (page?.visibleRecovery) visibleRecoveryCallbacks.push(page.visibleRecovery);
  if (page?.visibilityChanged) visibilityChangedCallbacks.push(page.visibilityChanged);
  if (message) messageCallbacks.push(message);
  if (mutation) mutationCallbacks.push(mutation);
  if (participant) participantCallbacks.push(participant);
  if (observerIgnore?.addedNode) observerIgnoreAddedNodeCallbacks.push(observerIgnore.addedNode);
  if (observerIgnore?.mutation) observerIgnoreMutationCallbacks.push(observerIgnore.mutation);
}

/** Initialize features after cleanup and locale setup, but before options load. */
export function initFeatures(context: FeatureInitContext): void {
  initCallbacks.forEach((callback) => runFeatureCallback(() => callback(context)));
}

/** Boot features after options load and the initial chat scan finishes. */
export function bootFeatures(): void {
  if (featuresSuspended) return;
  runLifecycleCallbacks(bootCallbacks);
}

/** Notify features after normalized options change. */
export function handleFeatureOptionsChanged(previousOptions: Options, nextOptions: Options): void {
  if (featuresSuspended) return;
  optionsChangedCallbacks.forEach((callback) =>
    runFeatureCallback(() => callback(previousOptions, nextOptions))
  );
}

/** Run follow-up work after foreground message recovery. */
export function recoverVisibleFeatures(): void {
  if (featuresSuspended) return;
  runLifecycleCallbacks(visibleRecoveryCallbacks);
}

/** Notify features immediately when document visibility changes. */
export function handleFeatureVisibilityChanged(visibilityState: Document['visibilityState']): void {
  if (featuresSuspended) return;
  visibilityChangedCallbacks.forEach((callback) =>
    runFeatureCallback(() => callback(visibilityState))
  );
}

/** Dispatch a chat message renderer to every message hook. */
export function handleFeatureMessage(message: HTMLElement, context: FeatureMessageContext): void {
  if (featuresSuspended) return;
  messageCallbacks.forEach((callback) =>
    runFeatureCallback(() => callback(message, context))
  );
}

/** Dispatch one observer batch for structural work. Message hooks run separately. */
export function handleFeatureMutations(batch: FeatureMutationBatch): void {
  if (featuresSuspended) return;
  mutationCallbacks.forEach((callback) => runFeatureCallback(() => callback(batch)));
}

/** Dispatch a participant-list renderer to every participant hook. */
export function handleFeatureParticipant(participant: HTMLElement): void {
  if (featuresSuspended) return;
  participantCallbacks.forEach((callback) => runFeatureCallback(() => callback(participant)));
}

/** Return whether an added node belongs to the extension. */
export function shouldIgnoreFeatureAddedNode(element: Element): boolean {
  return shouldIgnoreFeatureObserverElement(element, observerIgnoreAddedNodeCallbacks);
}

/** Return whether a mutation target was changed by the extension. */
export function shouldIgnoreFeatureMutation(element: Element): boolean {
  return shouldIgnoreFeatureObserverElement(element, observerIgnoreMutationCallbacks);
}

/** Run idempotent cleanup before initialization or when this instance stops. */
export function cleanupFeatures(): void {
  runLifecycleCallbacks(cleanupCallbacks);
}

/** Stop future feature events for this instance and clean up its features. */
export function suspendFeatures(): void {
  if (featuresSuspended) return;
  featuresSuspended = true;
  cleanupFeatures();
}

/** Reset in-page feature state without clearing browser storage. */
export function resetFeatures(): void {
  if (featuresSuspended) return;
  runLifecycleCallbacks(resetCallbacks);
}

function runLifecycleCallbacks(callbacks: LifecycleCallback[]): void {
  callbacks.forEach((callback) => runFeatureCallback(callback));
}

function shouldIgnoreFeatureObserverElement(
  element: Element,
  callbacks: ((element: Element) => boolean)[]
): boolean {
  if (isExtensionManagedElement(element)) return true;
  return callbacks.some((callback) => runFeatureCallback(() => callback(element)) === true);
}

function runFeatureCallback<T>(run: () => T): T | undefined {
  try {
    return run();
  } catch (error) {
    reportFeatureDispatchError(error);
    return undefined;
  }
}

function reportFeatureDispatchError(error: unknown): void {
  const reportError = (globalThis as { reportError?: (error: unknown) => void }).reportError;
  if (typeof reportError !== 'function') return;

  try {
    reportError(error);
  } catch {
    // Keep feature dispatch isolated even if the browser reporter is unavailable.
  }
}
