/**
 * Content feature lifecycle hooks.
 *
 * Feature modules register the work they own at module load, while the content
 * entrypoint owns the single MutationObserver and only runs lifecycle phases.
 * This is intentionally content-scoped rather than `shared`: it depends on the
 * live-chat DOM observer model and should not become an API for popup,
 * background, or docs code.
 *
 * The important convention is that feature import order should not carry
 * behavioral meaning. Message and mutation work is split into collect, enhance,
 * and render phases so ordering is expressed by intent instead of by the
 * enabled-feature import list.
 *
 * Extension-created UI should use `ytcqCreateElement()` from
 * `shared/managed-dom`. That marks the element as extension-owned, letting the
 * shared observer ignore our own DOM mutations without fragile per-feature
 * selector lists.
 */
import type { Options } from '../shared/options';
import { isExtensionManagedElement } from '../shared/managed-dom';
import { clearToast } from '../shared/toast';

type LifecycleCallback = () => void;
type InitCallback = (context: FeatureLifecycleContext) => void;
type OptionsChangedCallback = (previousOptions: Options, nextOptions: Options) => void;
type VisibilityChangedCallback = (visibilityState: Document['visibilityState']) => void;
type MessageCallback = (message: HTMLElement, context: FeatureMessageContext) => void;
type MutationCallback = (batch: FeatureMutationBatch) => void;
type ParticipantCallback = (participant: HTMLElement) => void;
type PhasedCallbacks<T extends (...args: never[]) => void> = Record<FeatureLifecyclePhase, T[]>;

/**
 * Ordered phases for repeated message/mutation work.
 *
 * `collect` reads YouTube DOM and updates local state.
 * `enhance` wires controls/listeners or adds lightweight feature UI.
 * `render` applies DOM renderings that depend on collected state.
 */
export type FeatureLifecyclePhase = 'collect' | 'enhance' | 'render';

/**
 * Optional collect/enhance/render hooks for one repeated lifecycle surface.
 *
 * Used by both `message` and `mutation` registrations. Most features only need
 * one phase, so call sites stay compact: `message: { enhance: wireMessage }`.
 */
export type FeaturePhasedLifecycle<T extends (...args: never[]) => void> = Partial<Record<FeatureLifecyclePhase, T>>;

/**
 * Persist extension options from feature code.
 *
 * Features receive this through `init` instead of importing storage helpers
 * directly, so option normalization and side effects stay centralized in the
 * content entrypoint.
 */
export type SaveOptions = (values: Partial<Options>) => void;

export interface FeatureLifecycleContext {
  /**
   * Save a partial option update.
   *
   * Use this for user actions in injected UI, such as settings menu toggles or
   * composer translation changes. It updates in-memory options, runs side
   * effects, and writes to `chrome.storage.sync`.
   */
  saveOptions: SaveOptions;
}

export interface FeatureMessageContext {
  /**
   * Whether this message is a newly added top-level chat renderer.
   *
   * `true` means the message came from a new renderer and live-only actions,
   * such as queueing translation, may run. `false` is used for existing
   * messages on boot or containing renderers touched by child mutations, where
   * features should usually wire/highlight only and avoid duplicate live work.
   */
  allowTranslate: boolean;
}

export interface FeatureMutationBatch {
  /**
   * Added DOM elements after extension-owned nodes have been filtered out.
   *
   * Use this for structural UI work such as finding newly opened YouTube menus
   * or emoji pickers. Do not mutate this array.
   */
  addedElements: Element[];

  /**
   * Deduplicated YouTube chat message renderers whose text or children changed.
   *
   * Use this for late-loaded message text handling, such as retrying Inbox,
   * focus, user history, or translation work after YouTube fills `#message`.
   */
  changedMessages: HTMLElement[];

  /**
   * Raw mutation records from the shared observer.
   *
   * Prefer `addedElements` and `changedMessages`. Use raw records only when a
   * feature needs to inspect a non-message target, such as the chat header or a
   * YouTube menu popup.
   */
  mutations: MutationRecord[];
}

export interface FeaturePageLifecycle {
  /**
   * Runs after options are loaded and existing chat messages/participants have
   * been processed.
   *
   * Use for one-time scans of already-open YouTube surfaces, such as currently
   * open menus. Most features should prefer `init`, message hooks, or mutation
   * hooks instead.
   */
  boot?: LifecycleCallback;

  /**
   * Runs once during content-script initialization before options are loaded.
   *
   * Use for document-level event listeners, storage subscriptions, and feature
   * setup that does not require current option values. The `saveOptions`
   * callback is available through the context.
   */
  init?: InitCallback;

  /**
   * Runs before the new content script initializes feature state.
   *
   * Use for removing stale DOM or data attributes left behind when an extension
   * update/reload leaves old injected UI in the page.
   */
  cleanupStale?: LifecycleCallback;

  /**
   * Runs when the background asks the page to reset extension UI/state.
   *
   * Use for closing panels, clearing in-page caches, and restoring mutated
   * message DOM. Persistent browser storage cleanup belongs in the feature's
   * storage path, not here.
   */
  reset?: LifecycleCallback;

  /**
   * Runs after normalized options change.
   *
   * Use for feature-specific reactions to settings changes. The content
   * entrypoint owns reading/writing options; features own their own UI/cache
   * refresh behavior.
   */
  optionsChanged?: OptionsChangedCallback;

  /**
   * Runs after the page returns to the foreground and visible messages have
   * been scanned again.
   *
   * Use for capped recovery work that should happen after background-tab live
   * edge recovery, such as translation backfill. This is not a general
   * visibility listener; features that need raw foreground/background events
   * should use `visibilityChanged`.
   */
  visibleRecovery?: LifecycleCallback;

  /**
   * Runs when the document visibility changes.
   *
   * Use for feature behavior that specifically reacts to tab foreground or
   * background transitions. Keep ordinary foreground recovery work in
   * `visibleRecovery`, which runs after the content entrypoint has rescanned
   * visible messages.
   */
  visibilityChanged?: VisibilityChangedCallback;
}

export interface FeatureParticipantLifecycle {
  /**
   * Runs for participant-list renderers discovered by the content entrypoint.
   *
   * Use this only for participant surfaces; chat messages should use the
   * message phase hooks.
   */
  enhance?: ParticipantCallback;
}

export interface FeatureObserverIgnoreLifecycle {
  /**
   * Optional custom added-node filter.
   *
   * Prefer `ytcqCreateElement()` for extension-created UI. This callback is an
   * escape hatch for feature-owned mutations to YouTube DOM that would otherwise
   * be observed as fresh YouTube work, such as live keyword highlighting.
   */
  addedNode?: (element: Element) => boolean;

  /**
   * Optional custom mutation-target filter.
   *
   * Prefer `ytcqCreateElement()` for extension-created UI. This callback is an
   * escape hatch for temporarily ignoring observer feedback while a feature is
   * mutating YouTube-owned DOM.
   */
  mutation?: (element: Element) => boolean;
}

export interface FeatureLifecycle {
  /**
   * One-time page lifecycle hooks.
   *
   * Use this group for setup, stale UI cleanup, late boot work, and page reset
   * cleanup. Repeated chat renderer work belongs in `message` or `mutation`.
   */
  page?: FeaturePageLifecycle;

  /**
   * Phased work for YouTube chat message renderers.
   *
   * `collect` updates feature state, `enhance` wires behavior/UI controls, and
   * `render` changes visible message content after state is ready.
   */
  message?: FeaturePhasedLifecycle<MessageCallback>;

  /**
   * Phased work for normalized MutationObserver batches.
   *
   * Use this for late-loaded text, newly opened YouTube menus, emoji pickers,
   * composer controls, or other DOM changes found by the shared observer.
   */
  mutation?: FeaturePhasedLifecycle<MutationCallback>;

  /**
   * Participant-list hooks.
   */
  participant?: FeatureParticipantLifecycle;

  /**
   * Custom observer suppression hooks for feature-owned YouTube DOM mutations.
   *
   * Most features should not need this. Prefer creating UI with
   * `ytcqCreateElement()`, which marks extension-owned DOM automatically.
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

/**
 * Register lifecycle hooks for one enabled content feature.
 *
 * Call this at module top level from a module imported by
 * `enabled-features.ts`. Do not create a separate `MutationObserver` in a
 * feature module; instead, register message/mutation hooks here and let
 * `content/index.ts` fan out the shared observer events.
 *
 * Hooks are optional. Register only the phases the feature owns, and prefer the
 * earliest phase that matches the work:
 * collect for state, enhance for wiring/UI controls, render for visible message
 * rendering.
 *
 * @param lifecycle The hooks owned by a feature or focused sub-feature. Each
 * hook is called by the content entrypoint at the matching lifecycle point.
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
 * Run all feature initialization hooks.
 *
 * Called once by the content entrypoint after stale UI cleanup and locale setup.
 *
 * @param context Shared services passed from the content entrypoint to feature
 * init hooks. Keep cross-feature services here instead of importing content
 * internals from feature modules.
 */
export function initFeatures(context: FeatureLifecycleContext): void {
  initCallbacks.forEach((callback) => callback(context));
}

/**
 * Run boot hooks after options and existing messages have been loaded.
 *
 * Boot is later than `init`: use it only for work that needs normalized options
 * and the first pass over existing YouTube renderers to be complete.
 */
export function bootFeatures(): void {
  runLifecycleCallbacks(bootCallbacks);
}

/**
 * Run feature option-change hooks after normalized options have changed.
 *
 * @param previousOptions Options before the update.
 * @param nextOptions Current normalized options.
 */
export function handleFeatureOptionsChanged(previousOptions: Options, nextOptions: Options): void {
  optionsChangedCallbacks.forEach((callback) => callback(previousOptions, nextOptions));
}

/**
 * Run feature hooks after foreground live-edge recovery rescans messages.
 */
export function recoverVisibleFeatures(): void {
  runLifecycleCallbacks(visibleRecoveryCallbacks);
}

/**
 * Run feature hooks for a document visibility state change.
 *
 * @param visibilityState Current `document.visibilityState` value.
 */
export function handleFeatureVisibilityChanged(visibilityState: Document['visibilityState']): void {
  visibilityChangedCallbacks.forEach((callback) => callback(visibilityState));
}

/**
 * Dispatch a chat message renderer through collect, enhance, then render.
 *
 * @param message A YouTube chat message renderer, normally matching
 * `CHAT_MESSAGE_SELECTOR`.
 * @param context Per-message dispatch flags, most importantly whether live-only
 * work such as initial translation queueing is allowed for this pass.
 */
export function handleFeatureMessage(message: HTMLElement, context: FeatureMessageContext): void {
  runPhasedCallbacks(messageCallbacks, (callback) => callback(message, context));
}

/**
 * Dispatch one normalized observer batch through collect, enhance, then render.
 *
 * @param batch A shared observer batch created by the content entrypoint. The
 * batch already filters extension-managed DOM and deduplicates changed message
 * renderers, so feature hooks should use it instead of scanning raw mutations
 * from scratch.
 */
export function handleFeatureMutations(batch: FeatureMutationBatch): void {
  runPhasedCallbacks(mutationCallbacks, (callback) => callback(batch));
}

/**
 * Dispatch a participant renderer to participant-specific feature hooks.
 *
 * @param participant A YouTube participant renderer from the participants list,
 * not a normal chat message renderer.
 */
export function handleFeatureParticipant(participant: HTMLElement): void {
  participantCallbacks.forEach((callback) => callback(participant));
}

/**
 * Whether an added node should be ignored by the shared observer.
 *
 * Extension UI created through `ytcqCreateElement()` is automatically ignored.
 *
 * @param element Added DOM element from the shared MutationObserver.
 */
export function shouldIgnoreFeatureAddedNode(element: Element): boolean {
  return shouldIgnoreFeatureObserverElement(element, observerIgnoreAddedNodeCallbacks);
}

/**
 * Whether a mutation target should be ignored by the shared observer.
 *
 * Extension UI created through `ytcqCreateElement()` is automatically ignored.
 *
 * @param element Mutation target element from the shared MutationObserver.
 */
export function shouldIgnoreFeatureMutation(element: Element): boolean {
  return shouldIgnoreFeatureObserverElement(element, observerIgnoreMutationCallbacks);
}

/**
 * Remove stale extension UI/markers from prior content script instances.
 *
 * This is mainly for extension reload/update recovery, where old injected DOM
 * can remain in the page while a fresh content script instance starts.
 */
export function cleanupStaleFeatures(): void {
  runLifecycleCallbacks(staleCleanupCallbacks);
}

/**
 * Reset in-page feature state after a full extension reset.
 *
 * This does not clear browser storage. It only asks features to remove visible
 * page state, close panels, and undo DOM mutations in the current YouTube page.
 */
export function resetFeatures(): void {
  runLifecycleCallbacks(resetCallbacks);
}

function runLifecycleCallbacks(callbacks: LifecycleCallback[]): void {
  callbacks.forEach((callback) => callback());
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
  callbacks.collect.forEach(run);
  callbacks.enhance.forEach(run);
  callbacks.render.forEach(run);
}

function shouldIgnoreFeatureObserverElement(
  element: Element,
  callbacks: ((element: Element) => boolean)[]
): boolean {
  if (isExtensionManagedElement(element)) return true;
  return callbacks.some((callback) => callback(element));
}
