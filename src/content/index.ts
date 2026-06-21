/**
 * Main live-chat content script.
 *
 * This file is the wiring layer: it loads options, watches YouTube's live chat
 * iframe for new renderers, and delegates each behavior to feature modules.
 *
 * `enabled-features` is imported for lifecycle registration side effects. This
 * entrypoint owns the single MutationObserver; features should register
 * lifecycle hooks rather than creating their own observers.
 */
import './enabled-features';
import {
  bootFeatures,
  cleanupStaleFeatures,
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
  type FeatureMutationBatch
} from './lifecycle';
import { DEFAULT_OPTIONS, getTargetLanguageUpdate, normalizeOptions, type Options } from '../shared/options';
import { getOptions, setOptions } from '../shared/state';
import { initUiLocaleFromDocument } from '../shared/i18n';
import { requestYouTubeMessageData, type YouTubeMessageData } from '../youtube/message-data';
import { CHAT_MESSAGE_SELECTOR, PARTICIPANT_SELECTOR } from '../youtube/selectors';

let observer: MutationObserver | null = null;
let visibilityRecoveryTimer = 0;

void init();

async function init(): Promise<void> {
  cleanupStaleFeatures();
  await initUiLocaleFromDocument();
  initFeatures({ saveOptions });

  chrome.storage.sync.get(DEFAULT_OPTIONS, (storedOptions) => {
    setOptions(normalizeOptions(storedOptions));
    boot();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;

    const previousOptions = getOptions();
    const nextOptions = { ...previousOptions };
    for (const key of Object.keys(DEFAULT_OPTIONS) as (keyof Options)[]) {
      if (changes[key]) {
        nextOptions[key] = changes[key].newValue as never;
      }
    }

    setOptions(normalizeOptions(nextOptions));
    notifyFeatureOptionsChanged(previousOptions, getOptions());
  });

  chrome.runtime.onMessage.addListener((message: { type?: string }, _sender, sendResponse) => {
    if (message?.type === 'ytcq:chat-attached-ping') {
      sendResponse({ attached: true });
      return false;
    }

    if (message?.type !== 'ytcq:reset-page') return false;
    resetPageState();
    return false;
  });
}

function boot(): void {
  processExistingMessages();
  processExistingParticipants();
  bootFeatures();
  document.addEventListener('visibilitychange', handleVisibilityChange);

  observer = new MutationObserver((mutations) => {
    const batch = createFeatureMutationBatch(mutations);
    const requestedDataMessages = new WeakMap<HTMLElement, Promise<YouTubeMessageData | null>>();
    const handledMessages = new WeakSet<HTMLElement>();
    handleFeatureMutations(batch);
    batch.addedElements.forEach((element) => handleAddedElement(element, requestedDataMessages, handledMessages));
    batch.changedMessages.forEach((message) => {
      handleFeatureMessageOnce(message, {
        allowTranslate: false,
        messageData: requestYouTubeMessageDataOnce(message, requestedDataMessages)
      }, handledMessages);
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true
  });
}

function processExistingMessages(): void {
  const messages = Array.from(document.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR));
  messages.forEach((message) => {
    handleFeatureMessage(message, {
      allowTranslate: false,
      messageData: requestYouTubeMessageData(message)
    });
  });
}

function processExistingParticipants(): void {
  document.querySelectorAll<HTMLElement>(PARTICIPANT_SELECTOR).forEach(handleFeatureParticipant);
}

function scheduleVisibleMessageRecovery(): void {
  if (document.visibilityState === 'hidden') return;
  if (visibilityRecoveryTimer) window.clearTimeout(visibilityRecoveryTimer);
  visibilityRecoveryTimer = window.setTimeout(() => {
    visibilityRecoveryTimer = 0;
    processExistingMessages();
    recoverVisibleFeatures();
  }, 300);
}

function handleVisibilityChange(): void {
  handleFeatureVisibilityChanged(document.visibilityState);
  if (document.visibilityState === 'hidden') {
    return;
  }

  scheduleVisibleMessageRecovery();
}

function createFeatureMutationBatch(mutations: MutationRecord[]): FeatureMutationBatch {
  const addedElements: Element[] = [];
  const changedMessages = new Set<HTMLElement>();

  mutations.forEach((mutation) => {
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
    addedElements,
    changedMessages: [...changedMessages],
    mutations
  };
}

function handleAddedElement(
  element: Element,
  requestedDataMessages: WeakMap<HTMLElement, Promise<YouTubeMessageData | null>>,
  handledMessages: WeakSet<HTMLElement>
): void {
  if (element.matches(CHAT_MESSAGE_SELECTOR) && element instanceof HTMLElement) {
    handleFeatureMessageOnce(element, {
      allowTranslate: true,
      messageData: requestYouTubeMessageDataOnce(element, requestedDataMessages)
    }, handledMessages);
  }
  if (element.matches(PARTICIPANT_SELECTOR) && element instanceof HTMLElement) {
    handleFeatureParticipant(element);
  }

  const containingMessage = element.closest<HTMLElement>(CHAT_MESSAGE_SELECTOR);
  if (containingMessage && !element.matches(CHAT_MESSAGE_SELECTOR)) {
    handleFeatureMessageOnce(containingMessage, {
      allowTranslate: false,
      messageData: requestYouTubeMessageDataOnce(containingMessage, requestedDataMessages)
    }, handledMessages);
  }

  const containingParticipant = element.closest<HTMLElement>(PARTICIPANT_SELECTOR);
  if (containingParticipant && !element.matches(PARTICIPANT_SELECTOR)) {
    handleFeatureParticipant(containingParticipant);
  }

  element.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR).forEach((message) => {
    handleFeatureMessageOnce(message, {
      allowTranslate: true,
      messageData: requestYouTubeMessageDataOnce(message, requestedDataMessages)
    }, handledMessages);
  });
  element.querySelectorAll<HTMLElement>(PARTICIPANT_SELECTOR).forEach(handleFeatureParticipant);
}

function handleFeatureMessageOnce(
  message: HTMLElement,
  context: { allowTranslate: boolean; messageData: Promise<YouTubeMessageData | null> },
  handledMessages: WeakSet<HTMLElement>
): void {
  if (handledMessages.has(message)) return;
  handledMessages.add(message);
  handleFeatureMessage(message, context);
}

function requestYouTubeMessageDataOnce(
  message: HTMLElement,
  requestedDataMessages: WeakMap<HTMLElement, Promise<YouTubeMessageData | null>>
): Promise<YouTubeMessageData | null> {
  const existingRequest = requestedDataMessages.get(message);
  if (existingRequest) return existingRequest;
  const request = requestYouTubeMessageData(message);
  requestedDataMessages.set(message, request);
  return request;
}

function getChangedMessageForMutation(mutation: MutationRecord): HTMLElement | null {
  const targetElement = mutation.target instanceof Element
    ? mutation.target
    : mutation.target.parentElement;
  if (!targetElement || shouldIgnoreFeatureMutation(targetElement)) return null;
  return targetElement.closest<HTMLElement>(CHAT_MESSAGE_SELECTOR);
}

function saveOptions(values: Partial<Options>): void {
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
  notifyFeatureOptionsChanged(previousOptions, getOptions());
  chrome.storage.sync.set(nextValues);
}

function notifyFeatureOptionsChanged(previousOptions: Options, nextOptions: Options): void {
  handleFeatureOptionsChanged(previousOptions, nextOptions);
}

function resetPageState(): void {
  const previousOptions = getOptions();
  setOptions(DEFAULT_OPTIONS);
  resetFeatures();
  notifyFeatureOptionsChanged(previousOptions, DEFAULT_OPTIONS);
}
