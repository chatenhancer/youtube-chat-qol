/**
 * Lifecycle registry for extension features that run in YouTube's live-chat
 * document.
 *
 * Feature modules register hooks when `enabled-features.ts` imports them. The
 * content entrypoint handles startup, options, the active content script
 * instance, and the one shared `MutationObserver`; this module stores hooks and
 * dispatches normalized events by lifecycle phase.
 *
 * The hooks assume a real YouTube chat DOM: message renderers, participant
 * renderers, YouTube menu popups, document visibility changes, and extension
 * UI injected into that page.
 *
 * Message and mutation hooks run in fixed `collect`, `enhance`, then `render`
 * passes. When several features see the same message or mutation, state
 * gathering happens before control wiring, and visible DOM rendering happens
 * last.
 *
 * Elements created through JSX from `shared/jsx-dom` are marked as
 * extension-managed. The shared observer ignores managed elements, so injected
 * buttons, cards, and popups do not look like new YouTube DOM work.
 */
import type { Options } from '../shared/options';
import { isExtensionManagedElement } from '../shared/managed-dom';
import { clearToast } from '../shared/toast';
import type { YouTubeMessageData } from '../youtube/message-data-events';

type LifecycleCallback = () => void;
type InitCallback = (context: FeatureLifecycleContext) => void;
type OptionsChangedCallback = (previousOptions: Options, nextOptions: Options) => void;
type VisibilityChangedCallback = (visibilityState: Document['visibilityState']) => void;
type MessageCallback = (message: HTMLElement, context: FeatureMessageContext) => void;
type MutationCallback = (batch: FeatureMutationBatch) => void;
type ParticipantCallback = (participant: HTMLElement) => void;
type PhasedCallbacks<T extends (...args: never[]) => void> = Record<FeatureLifecyclePhase, T[]>;
type FeatureMessageDispatchContext = Omit<FeatureMessageContext, 'messageData'> & {
  messageData?: Promise<YouTubeMessageData | null>;
};

/**
 * Ordered phases for repeated work on chat messages and observer batches.
 *
 * `collect` reads YouTube DOM and updates extension state.
 * `enhance` wires listeners, controls, or compact feature UI.
 * `render` changes visible DOM after collection/enhancement state is ready.
 */
export type FeatureLifecyclePhase = 'collect' | 'enhance' | 'render';
export type FeatureMessageSource = 'existing' | 'added' | 'changed';

/**
 * Phase-specific hooks for one repeated lifecycle surface.
 *
 * `message` and `mutation` registrations both use this shape. A registration
 * can include only the phase it needs, such as
 * `message: { enhance: wireMessage }`.
 */
export type FeaturePhasedLifecycle<T extends (...args: never[]) => void> = Partial<Record<FeatureLifecyclePhase, T>>;

/**
 * Save option updates requested by injected chat UI.
 *
 * Features receive this in `page.init` so content-script option normalization,
 * storage writes, and option-change fan-out stay in `content/index.ts`.
 */
export type SaveOptions = (values: Partial<Options>) => void;

export interface FeatureLifecycleContext {
  /**
   * Save a partial option update from an injected control.
   *
   * Settings menu toggles, composer translation controls, and other
   * YouTube-page UI call this when they change extension options. The content
   * entrypoint updates in-memory options, notifies feature hooks, and persists
   * the change to `chrome.storage.sync`.
   */
  saveOptions: SaveOptions;
}

export interface FeatureMessageContext {
  /**
   * Why this chat message renderer is being dispatched.
   *
   * `existing` is used during boot and visible-message recovery scans.
   * `added` is used for renderer nodes newly inserted by YouTube.
   * `changed` is used when YouTube mutates an existing renderer, including the
   * common case where message text appears after the renderer shell.
   */
  source: FeatureMessageSource;

  /**
   * Sanitized page-world metadata for this YouTube message renderer.
   *
   * Features can await the promise when they need data exposed by YouTube's
   * page context, such as stable message IDs. The promise resolves outside the
   * synchronous collect/enhance/render pass; immediate DOM wiring happens
   * before this data is available.
   */
  messageData: Promise<YouTubeMessageData | null>;
}

export interface FeatureMutationBatch {
  /**
   * Added DOM elements from observer records after managed nodes are removed.
   *
   * This is the primary input for structural UI work such as finding newly
   * opened YouTube menus, emoji pickers, chat header changes, or composer
   * controls. The lifecycle dispatcher does not mutate it after creation.
   */
  addedElements: Element[];

  /**
   * Mutation records that were not fully ignored by the shared observer.
   *
   * `addedElements` covers most added-node work. These records preserve the
   * original mutation target for cases such as YouTube menu popups or the chat
   * header. Because the records are still the browser's original records, mixed
   * node lists can include managed extension nodes. Chat message changes are
   * dispatched separately through `message` hooks with `source: 'changed'`.
   */
  mutations: MutationRecord[];
}

export interface FeaturePageLifecycle {
  /**
   * Runs after options load and the first chat message/participant scan ends.
   *
   * This covers one-time work that needs normalized options or already-open
   * YouTube surfaces, such as enhancing a menu that existed before the observer
   * started. Work that does not depend on the completed first pass usually fits
   * in `init`, `message`, or `mutation`.
   */
  boot?: LifecycleCallback;

  /**
   * Runs once after stale cleanup and locale setup, before options load.
   *
   * This covers document listeners, storage subscriptions, local state loading,
   * and feature setup that does not depend on current option values. The
   * context provides `saveOptions` for injected controls that need to update
   * extension settings.
   */
  init?: InitCallback;

  /**
   * Runs before a fresh content script instance initializes feature state.
   *
   * This removes injected DOM, data attributes, timers, or small page state
   * that can survive an extension reload/update inside the same YouTube tab.
   * It runs before options or feature state are loaded.
   */
  cleanupStale?: LifecycleCallback;

  /**
   * Runs when the extension asks this page to reset in-page feature state.
   *
   * This closes panels, clears in-page caches, and undoes message DOM changes
   * in the current YouTube page. Browser storage is unchanged by page reset
   * hooks.
   */
  reset?: LifecycleCallback;

  /**
   * Runs after content-script options have been normalized and changed.
   *
   * Feature UI refreshes, derived-state clears, and visible-chat reprocessing
   * after a settings change happen here. Callbacks receive both the previous
   * and next normalized option snapshots.
   */
  optionsChanged?: OptionsChangedCallback;

  /**
   * Runs after a foreground tab recovery scan has reprocessed visible messages.
   *
   * Bounded follow-up work that benefits from the fresh scan runs here, such as
   * translation backfill. Immediate foreground/background transitions use
   * `visibilityChanged`.
   */
  visibleRecovery?: LifecycleCallback;

  /**
   * Runs immediately when the chat document visibility changes.
   *
   * Behavior tied to the transition itself runs here, such as keeping the
   * native chat scroller at the live edge or cancelling timers. Foreground work
   * that depends on visible messages being rescanned runs in `visibleRecovery`.
   */
  visibilityChanged?: VisibilityChangedCallback;
}

export interface FeatureParticipantLifecycle {
  /**
   * Runs for YouTube participant-list renderers discovered by the entrypoint.
   *
   * This is for participant surfaces only. Chat messages, including author
   * chips inside message renderers, go through the `message` hooks.
   */
  enhance?: ParticipantCallback;
}

export interface FeatureObserverIgnoreLifecycle {
  /**
   * Optional filter for added nodes that are feature-owned, not YouTube work.
   *
   * Managed JSX covers normal extension UI. This hook covers
   * feature-owned edits to YouTube-rendered DOM, such as keyword highlight
   * wrappers, where marking a new element as managed is not enough by itself.
   */
  addedNode?: (element: Element) => boolean;

  /**
   * Optional filter for feature-owned mutation targets.
   *
   * Managed JSX covers normal extension UI. This hook covers
   * temporary observer feedback from feature-owned changes to YouTube DOM that
   * cannot be represented as managed extension elements.
   */
  mutation?: (element: Element) => boolean;
}

export interface FeatureLifecycle {
  /**
   * Page-level hooks for setup, cleanup, options, and visibility.
   *
   * These hooks cover work tied to the content-script instance or whole chat
   * document. Repeated chat renderer work is handled by `message`; repeated
   * structural DOM work is handled by `mutation`.
   */
  page?: FeaturePageLifecycle;

  /**
   * Phased work for YouTube chat message renderers.
   *
   * These hooks cover message text, author data, per-message controls,
   * mention/inbox logic, translation rendering, and other behavior attached to
   * `yt-live-chat-*-message-renderer` nodes.
   */
  message?: FeaturePhasedLifecycle<MessageCallback>;

  /**
   * Phased work for non-message DOM changes from the shared observer.
   *
   * These hooks cover newly opened YouTube menus, emoji pickers, composer
   * controls, chat header changes, and other structural surfaces. Chat message
   * renderer changes are dispatched through `message`.
   */
  mutation?: FeaturePhasedLifecycle<MutationCallback>;

  /**
   * Hooks for YouTube's participant list surface.
   */
  participant?: FeatureParticipantLifecycle;

  /**
   * Custom observer suppression for feature-owned edits to YouTube DOM.
   *
   * Managed extension elements cover normal injected UI. These filters cover
   * feature-owned mutations to YouTube nodes that would otherwise feed back into
   * the shared observer.
   */
  observerIgnore?: FeatureObserverIgnoreLifecycle;
}

const bootCallbacks: LifecycleCallback[] = [];
const initCallbacks: InitCallback[] = [];
const messageCallbacks = createPhasedCallbacks<MessageCallback>();
const mutationCallbacks = createPhasedCallbacks<MutationCallback>();
const staleCleanupCallbacks: LifecycleCallback[] = [clearToast];
const resetCallbacks: LifecycleCallback[] = [clearToast];
const optionsChangedCallbacks: OptionsChangedCallback[] = [];
const visibleRecoveryCallbacks: LifecycleCallback[] = [];
const visibilityChangedCallbacks: VisibilityChangedCallback[] = [];
const participantCallbacks: ParticipantCallback[] = [];
const observerIgnoreAddedNodeCallbacks: ((element: Element) => boolean)[] = [];
const observerIgnoreMutationCallbacks: ((element: Element) => boolean)[] = [];
let featuresSuspended = false;

/**
 * Register hooks for one enabled content feature or focused sub-feature.
 *
 * Feature modules call this at module top level from files imported by
 * `enabled-features.ts`.
 * `content/index.ts` owns the broad `MutationObserver`, current-instance
 * checks, and dispatch. Registered hooks receive the resulting message,
 * mutation, participant, option, and visibility events.
 *
 * Hook sets can cover one lifecycle surface or several. `collect` is the state
 * phase, `enhance` is the listener/control phase, and `render` is the visible
 * DOM phase that runs after collected state is ready.
 *
 * @param lifecycle The hook set owned by the registering feature.
 *
 * @example
 * ```ts
 * registerFeatureLifecycle({
 *   page: { init: initFeature, reset: resetFeature },
 *   message: { collect: recordMessage, enhance: wireMessageControls },
 *   mutation: { enhance: refreshOpenPanels }
 * });
 * ```
 */
export function registerFeatureLifecycle(lifecycle: FeatureLifecycle): void {
  const { page, message, mutation, participant, observerIgnore } = lifecycle;
  if (page?.boot) bootCallbacks.push(page.boot);
  if (page?.init) initCallbacks.push(page.init);
  if (page?.cleanupStale) staleCleanupCallbacks.push(page.cleanupStale);
  if (page?.reset) resetCallbacks.push(page.reset);
  if (page?.optionsChanged) optionsChangedCallbacks.push(page.optionsChanged);
  if (page?.visibleRecovery) visibleRecoveryCallbacks.push(page.visibleRecovery);
  if (page?.visibilityChanged) visibilityChangedCallbacks.push(page.visibilityChanged);
  registerPhasedCallbacks(messageCallbacks, message);
  registerPhasedCallbacks(mutationCallbacks, mutation);
  if (participant?.enhance) participantCallbacks.push(participant.enhance);
  if (observerIgnore?.addedNode) observerIgnoreAddedNodeCallbacks.push(observerIgnore.addedNode);
  if (observerIgnore?.mutation) observerIgnoreMutationCallbacks.push(observerIgnore.mutation);
}

/**
 * Run feature `page.init` hooks.
 *
 * The content entrypoint calls this once after stale UI cleanup and locale setup
 * but before stored options are loaded. The context contains the small set of
 * services that injected chat UI needs from the entrypoint.
 */
export function initFeatures(context: FeatureLifecycleContext): void {
  initCallbacks.forEach((callback) => runFeatureCallback(() => callback(context)));
}

/**
 * Run feature `page.boot` hooks after the initial chat scan.
 *
 * At this point options are normalized, existing message renderers have gone
 * through `message` hooks, and existing participant renderers have gone through
 * participant hooks.
 */
export function bootFeatures(): void {
  if (featuresSuspended) return;
  runLifecycleCallbacks(bootCallbacks);
}

/**
 * Run feature `page.optionsChanged` hooks after options are normalized.
 *
 * @param previousOptions Normalized option values before the update.
 * @param nextOptions Current normalized option values.
 */
export function handleFeatureOptionsChanged(previousOptions: Options, nextOptions: Options): void {
  if (featuresSuspended) return;
  optionsChangedCallbacks.forEach((callback) =>
    runFeatureCallback(() => callback(previousOptions, nextOptions))
  );
}

/**
 * Run feature `page.visibleRecovery` hooks after foreground message recovery.
 *
 * The content entrypoint calls this after it has rescanned currently visible
 * message renderers on a foreground transition.
 */
export function recoverVisibleFeatures(): void {
  if (featuresSuspended) return;
  runLifecycleCallbacks(visibleRecoveryCallbacks);
}

/**
 * Run feature `page.visibilityChanged` hooks for a document visibility change.
 *
 * These hooks are not gated by feature suspension so cleanup paths can still
 * notify timer-owning features if needed.
 *
 * @param visibilityState The current `document.visibilityState` value.
 */
export function handleFeatureVisibilityChanged(visibilityState: Document['visibilityState']): void {
  visibilityChangedCallbacks.forEach((callback) =>
    runFeatureCallback(() => callback(visibilityState))
  );
}

/**
 * Dispatch a YouTube chat message renderer through all message phases.
 *
 * When `messageData` is omitted, this helper supplies an empty metadata
 * promise.
 *
 * @param message A renderer matching the extension's chat message selector.
 * @param context Per-message flags and optional page-world metadata request.
 */
export function handleFeatureMessage(message: HTMLElement, context: FeatureMessageDispatchContext): void {
  if (featuresSuspended) return;
  const featureContext: FeatureMessageContext = {
    ...context,
    messageData: context.messageData || Promise.resolve(null)
  };
  runPhasedCallbacks(messageCallbacks, (callback) => callback(message, featureContext));
}

/**
 * Dispatch one normalized observer batch through all mutation phases.
 *
 * The batch is for non-message structural work. Changed chat messages are
 * dispatched separately through `handleFeatureMessage`.
 *
 * @param batch Observer data prepared by the content entrypoint.
 */
export function handleFeatureMutations(batch: FeatureMutationBatch): void {
  if (featuresSuspended) return;
  runPhasedCallbacks(mutationCallbacks, (callback) => callback(batch));
}

/**
 * Dispatch a YouTube participant-list renderer to participant hooks.
 *
 * @param participant A renderer from the participants list, not a chat message.
 */
export function handleFeatureParticipant(participant: HTMLElement): void {
  if (featuresSuspended) return;
  participantCallbacks.forEach((callback) => runFeatureCallback(() => callback(participant)));
}

/**
 * Return whether an added node is extension-owned DOM work.
 *
 * Managed elements are ignored automatically before feature-specific filters
 * run.
 *
 * @param element Added element from the shared observer.
 */
export function shouldIgnoreFeatureAddedNode(element: Element): boolean {
  return shouldIgnoreFeatureObserverElement(element, observerIgnoreAddedNodeCallbacks);
}

/**
 * Return whether a mutation target is extension-owned DOM work.
 *
 * Managed elements are ignored automatically before feature-specific filters
 * run.
 *
 * @param element Mutation target element from the shared observer.
 */
export function shouldIgnoreFeatureMutation(element: Element): boolean {
  return shouldIgnoreFeatureObserverElement(element, observerIgnoreMutationCallbacks);
}

/**
 * Remove stale extension UI and markers before normal feature startup.
 *
 * This handles extension reload/update cases where a YouTube tab keeps old
 * injected DOM even though a fresh content script is starting.
 */
export function cleanupStaleFeatures(): void {
  runLifecycleCallbacks(staleCleanupCallbacks);
}

/**
 * Stop normal feature dispatch and clean up injected UI for this instance.
 *
 * This is used when another content script instance claims the page or the old
 * script can no longer reliably talk to the extension context. Visible feature
 * controls are removed so they do not race the new instance or fail when users
 * interact with them.
 */
export function suspendFeatures(): void {
  if (featuresSuspended) return;
  featuresSuspended = true;
  cleanupStaleFeatures();
}

/**
 * Reset feature-owned state in the current YouTube page.
 *
 * This does not clear browser storage. It asks features to close panels, clear
 * in-page caches, and undo visible DOM mutations. Reset hooks still run after
 * suspension so teardown can finish cleanly.
 */
export function resetFeatures(): void {
  runLifecycleCallbacks(resetCallbacks);
}

function runLifecycleCallbacks(callbacks: LifecycleCallback[]): void {
  callbacks.forEach((callback) => runFeatureCallback(callback));
}

function createPhasedCallbacks<T extends (...args: never[]) => void>(): PhasedCallbacks<T> {
  return {
    collect: [],
    enhance: [],
    render: []
  };
}

function registerPhasedCallbacks<T extends (...args: never[]) => void>(
  target: PhasedCallbacks<T>,
  source: FeaturePhasedLifecycle<T> | undefined
): void {
  if (source?.collect) target.collect.push(source.collect);
  if (source?.enhance) target.enhance.push(source.enhance);
  if (source?.render) target.render.push(source.render);
}

function runPhasedCallbacks<T extends (...args: never[]) => void>(
  callbacks: PhasedCallbacks<T>,
  run: (callback: T) => void
): void {
  callbacks.collect.forEach((callback) => runFeatureCallback(() => run(callback)));
  callbacks.enhance.forEach((callback) => runFeatureCallback(() => run(callback)));
  callbacks.render.forEach((callback) => runFeatureCallback(() => run(callback)));
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
    reportFeatureLifecycleError(error);
    return undefined;
  }
}

function reportFeatureLifecycleError(error: unknown): void {
  const reportError = (globalThis as { reportError?: (error: unknown) => void }).reportError;
  if (typeof reportError !== 'function') return;

  try {
    reportError(error);
  } catch {
    // Keep feature dispatch isolated even if the browser reporter is unavailable.
  }
}
