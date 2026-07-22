/**
 * Main live-chat content script.
 *
 * This file is the wiring layer: it loads options, watches YouTube's live chat
 * iframe for new renderers, and delegates each behavior to feature modules.
 *
 * `enabled-features` is imported for feature registration side effects. This
 * entrypoint owns the single MutationObserver; features should register
 * feature hooks rather than creating their own observers.
 */
import './enabled-features';
import {
  bootFeatures,
  cleanupFeatures,
  handleFeatureMessage,
  handleFeatureMutations,
  handleFeatureOptionsChanged,
  handleFeatureParticipant,
  handleFeatureVisibilityChanged,
  initFeatures,
  recoverVisibleFeatures,
  resetFeatures,
  shouldIgnoreFeatureAddedNode,
  shouldIgnoreFeatureMutation,
  suspendFeatures,
  type FeatureMessageSource,
  type FeatureMutationBatch
} from './dispatcher';
import { DEFAULT_OPTIONS, getTargetLanguageUpdate, normalizeOptions, type Options } from '../shared/options';
import {
  DEFAULT_CHAT_SKIN,
  type ChatSkinTheme
} from '../shared/chat-skins';
import { getOptions, setOptions } from '../shared/state';
import { initUiLocaleFromDocument } from '../shared/i18n';
import { OBSERVED_MANAGED_REMOVAL_ATTRIBUTE } from '../shared/managed-dom';
import {
  startYouTubeChatFeedRecordStore,
  stopYouTubeChatFeedRecordStore
} from '../youtube/chat-feed/records';
import { injectYouTubeChatFeedPage } from '../youtube/chat-feed/page-injection';
import { CHAT_MESSAGE_SELECTOR, PARTICIPANT_SELECTOR } from '../youtube/selectors';

interface NormalizedMutationBatch {
  changedMessages: HTMLElement[];
  featureBatch: FeatureMutationBatch;
}

const CONTENT_INSTANCE_ATTRIBUTE = 'data-ytcq-content-instance';
const CONTENT_INSTANCE_CLAIM_EVENT = 'ytcq:content-instance-claim';
const CONTENT_INSTANCE_ID = `${Date.now()}-${Math.random()}`;
const CHAT_SKIN_ATTRIBUTE = 'data-ytcq-chat-skin';
const CHAT_SKIN_THEME_ATTRIBUTE = 'data-ytcq-chat-skin-theme';
const YOUTUBE_DARK_ATTRIBUTE = 'dark';

let observer: MutationObserver | null = null;
let visibilityRecoveryTimer = 0;
let contentSuspended = false;

claimContentInstance();
injectYouTubeChatFeedPage();
void init();

async function init(): Promise<void> {
  cleanupFeatures();
  await initUiLocaleFromDocument();
  if (!isCurrentContentInstance()) return;
  startYouTubeChatFeedRecordStore();
  initFeatures({ saveOptions });

  chrome.storage.sync.get(DEFAULT_OPTIONS, (storedOptions) => {
    if (!isCurrentContentInstance()) return;
    setOptions(normalizeOptions(storedOptions));
    applyChatSkin(getOptions());
    boot();
  });

  chrome.storage.onChanged.addListener(handleStorageChanged);
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);
}

function handleStorageChanged(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string
): void {
  if (!isCurrentContentInstance()) return;
  if (areaName !== 'sync') return;

  const previousOptions = getOptions();
  const nextOptions = { ...previousOptions };
  for (const key of Object.keys(DEFAULT_OPTIONS) as (keyof Options)[]) {
    if (changes[key]) {
      nextOptions[key] = changes[key].newValue as never;
    }
  }

  setOptions(normalizeOptions(nextOptions));
  applyChatSkin(getOptions());
  notifyFeatureOptionsChanged(previousOptions, getOptions());
}

function handleRuntimeMessage(
  message: { type?: string },
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
): false {
  if (!isCurrentContentInstance()) return false;
  if (message?.type === 'ytcq:chat-attached-ping') {
    sendResponse({ attached: true });
    return false;
  }

  if (message?.type !== 'ytcq:reset-page') return false;
  resetPageState();
  return false;
}

function boot(): void {
  if (!isCurrentContentInstance()) return;
  processExistingMessages();
  processExistingParticipants();
  bootFeatures();
  document.addEventListener('visibilitychange', handleVisibilityChange);

  observer = new MutationObserver((mutations) => {
    if (!isCurrentContentInstance()) {
      suspendContentInstance();
      return;
    }

    const batch = createNormalizedMutationBatch(mutations);
    const handledMessages = new WeakSet<HTMLElement>();
    handleFeatureMutations(batch.featureBatch);
    batch.featureBatch.addedElements.forEach((element) => handleAddedElement(element, handledMessages));
    batch.changedMessages.forEach((message) => {
      handleFeatureMessageOnce(message, 'changed', handledMessages);
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true
  });
}

function processExistingMessages(): void {
  if (!isCurrentContentInstance()) return;
  const messages = Array.from(document.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR));
  messages.forEach((message) => {
    handleFeatureMessage(message, { source: 'existing' });
  });
}

function processExistingParticipants(): void {
  if (!isCurrentContentInstance()) return;
  document.querySelectorAll<HTMLElement>(PARTICIPANT_SELECTOR).forEach(handleFeatureParticipant);
}

function scheduleVisibleMessageRecovery(): void {
  if (!isCurrentContentInstance()) return;
  if (document.visibilityState === 'hidden') return;
  if (visibilityRecoveryTimer) window.clearTimeout(visibilityRecoveryTimer);
  visibilityRecoveryTimer = window.setTimeout(() => {
    visibilityRecoveryTimer = 0;
    processExistingMessages();
    recoverVisibleFeatures();
  }, 300);
}

function handleVisibilityChange(): void {
  if (!isCurrentContentInstance()) return;
  handleFeatureVisibilityChanged(document.visibilityState);
  if (document.visibilityState === 'hidden') {
    return;
  }

  scheduleVisibleMessageRecovery();
}

function createNormalizedMutationBatch(mutations: MutationRecord[]): NormalizedMutationBatch {
  const addedElements: Element[] = [];
  const changedMessages = new Set<HTMLElement>();
  const featureMutations: MutationRecord[] = [];

  mutations.forEach((mutation) => {
    if (shouldIgnoreObserverMutation(mutation)) return;

    featureMutations.push(mutation);

    if (mutation.type === 'childList' || mutation.type === 'characterData') {
      const message = getChangedMessageForMutation(mutation);
      if (message) changedMessages.add(message);
    }

    mutation.addedNodes.forEach((node) => {
      if (!(node instanceof Element)) return;
      if (shouldIgnoreFeatureAddedNode(node)) return;
      addedElements.push(node);
    });
  });

  return {
    changedMessages: [...changedMessages],
    featureBatch: {
      addedElements,
      mutations: featureMutations
    }
  };
}

function handleAddedElement(
  element: Element,
  handledMessages: WeakSet<HTMLElement>
): void {
  if (element.matches(CHAT_MESSAGE_SELECTOR) && element instanceof HTMLElement) {
    handleFeatureMessageOnce(element, 'added', handledMessages);
  }
  if (element.matches(PARTICIPANT_SELECTOR) && element instanceof HTMLElement) {
    handleFeatureParticipant(element);
  }

  const containingMessage = element.closest<HTMLElement>(CHAT_MESSAGE_SELECTOR);
  if (containingMessage && !element.matches(CHAT_MESSAGE_SELECTOR)) {
    handleFeatureMessageOnce(containingMessage, 'changed', handledMessages);
  }

  const containingParticipant = element.closest<HTMLElement>(PARTICIPANT_SELECTOR);
  if (containingParticipant && !element.matches(PARTICIPANT_SELECTOR)) {
    handleFeatureParticipant(containingParticipant);
  }

  element.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR).forEach((message) => {
    handleFeatureMessageOnce(message, 'added', handledMessages);
  });
  element.querySelectorAll<HTMLElement>(PARTICIPANT_SELECTOR).forEach(handleFeatureParticipant);
}

function handleFeatureMessageOnce(
  message: HTMLElement,
  source: FeatureMessageSource,
  handledMessages: WeakSet<HTMLElement>
): void {
  if (handledMessages.has(message)) return;
  handledMessages.add(message);
  handleFeatureMessage(message, { source });
}

function getChangedMessageForMutation(mutation: MutationRecord): HTMLElement | null {
  const targetElement = mutation.target instanceof Element
    ? mutation.target
    : mutation.target.parentElement;
  if (!targetElement || shouldIgnoreFeatureMutation(targetElement)) return null;
  return targetElement.closest<HTMLElement>(CHAT_MESSAGE_SELECTOR);
}

function shouldIgnoreObserverMutation(mutation: MutationRecord): boolean {
  const targetElement = mutation.target instanceof Element
    ? mutation.target
    : mutation.target.parentElement;
  if (targetElement && shouldIgnoreFeatureMutation(targetElement)) return true;
  if (mutation.type !== 'childList') return false;

  const changedNodes = [
    ...Array.from(mutation.addedNodes),
    ...Array.from(mutation.removedNodes)
  ];
  if (!changedNodes.length) return false;
  if (shouldDispatchManagedRemovalFromChatMessage(targetElement, mutation)) return false;
  return changedNodes.every(shouldIgnoreObserverNode);
}

function shouldIgnoreObserverNode(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  if (
    !node.isConnected &&
    node.hasAttribute(OBSERVED_MANAGED_REMOVAL_ATTRIBUTE)
  ) {
    return false;
  }
  return shouldIgnoreFeatureAddedNode(node);
}

function shouldDispatchManagedRemovalFromChatMessage(
  targetElement: Element | null,
  mutation: MutationRecord
): boolean {
  if (!targetElement?.closest(CHAT_MESSAGE_SELECTOR)) return false;
  return Array.from(mutation.removedNodes).some(shouldIgnoreObserverNode);
}

function saveOptions(values: Partial<Options>): void {
  if (!isCurrentContentInstance()) return;
  const previousOptions = getOptions();
  const nextValues = values.targetLanguage !== undefined
    ? {
        ...values,
        ...getTargetLanguageUpdate(
          values.targetLanguage,
          values.lastTranslationTarget || previousOptions.targetLanguage || previousOptions.lastTranslationTarget
        )
      }
    : values;
  setOptions(normalizeOptions({ ...previousOptions, ...nextValues }));
  applyChatSkin(getOptions());
  notifyFeatureOptionsChanged(previousOptions, getOptions());
  chrome.storage.sync.set(nextValues);
}

function applyChatSkin(options: Pick<Options, 'chatSkin'>): void {
  const previousSkin = document.documentElement.getAttribute(CHAT_SKIN_ATTRIBUTE) || DEFAULT_CHAT_SKIN;
  const previousTheme = document.documentElement.getAttribute(CHAT_SKIN_THEME_ATTRIBUTE);
  const resolvedTheme = options.chatSkin === DEFAULT_CHAT_SKIN
    ? null
    : resolveChatSkinTheme();

  if (previousSkin === options.chatSkin && previousTheme === resolvedTheme) {
    return;
  }

  if (options.chatSkin === DEFAULT_CHAT_SKIN) {
    document.documentElement.removeAttribute(CHAT_SKIN_ATTRIBUTE);
    document.documentElement.removeAttribute(CHAT_SKIN_THEME_ATTRIBUTE);
    return;
  }

  document.documentElement.setAttribute(CHAT_SKIN_ATTRIBUTE, options.chatSkin);
  document.documentElement.setAttribute(CHAT_SKIN_THEME_ATTRIBUTE, resolvedTheme ?? resolveChatSkinTheme());
}

function resolveChatSkinTheme(): ChatSkinTheme {
  return document.documentElement.hasAttribute(YOUTUBE_DARK_ATTRIBUTE) ? 'dark' : 'light';
}

function notifyFeatureOptionsChanged(previousOptions: Options, nextOptions: Options): void {
  if (!isCurrentContentInstance()) return;
  handleFeatureOptionsChanged(previousOptions, nextOptions);
}

function resetPageState(): void {
  if (!isCurrentContentInstance()) return;
  const previousOptions = getOptions();
  setOptions(DEFAULT_OPTIONS);
  applyChatSkin(DEFAULT_OPTIONS);
  resetFeatures();
  notifyFeatureOptionsChanged(previousOptions, DEFAULT_OPTIONS);
}

function claimContentInstance(): void {
  document.addEventListener(CONTENT_INSTANCE_CLAIM_EVENT, handleContentInstanceClaim);
  document.documentElement.setAttribute(CONTENT_INSTANCE_ATTRIBUTE, CONTENT_INSTANCE_ID);
  document.dispatchEvent(new CustomEvent(CONTENT_INSTANCE_CLAIM_EVENT, {
    detail: { id: CONTENT_INSTANCE_ID }
  }));
}

function handleContentInstanceClaim(event: Event): void {
  const claimedId = event instanceof CustomEvent && typeof event.detail?.id === 'string'
    ? event.detail.id
    : document.documentElement.getAttribute(CONTENT_INSTANCE_ATTRIBUTE);
  if (claimedId && claimedId !== CONTENT_INSTANCE_ID) {
    suspendContentInstance();
  }
}

function isCurrentContentInstance(): boolean {
  return !contentSuspended &&
    document.documentElement.getAttribute(CONTENT_INSTANCE_ATTRIBUTE) === CONTENT_INSTANCE_ID;
}

function suspendContentInstance(): void {
  if (contentSuspended) return;
  contentSuspended = true;
  if (visibilityRecoveryTimer) {
    window.clearTimeout(visibilityRecoveryTimer);
    visibilityRecoveryTimer = 0;
  }
  observer?.disconnect();
  observer = null;
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  document.removeEventListener(CONTENT_INSTANCE_CLAIM_EVENT, handleContentInstanceClaim);
  chrome.storage.onChanged.removeListener(handleStorageChanged);
  chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
  stopYouTubeChatFeedRecordStore();
  suspendFeatures();
}
