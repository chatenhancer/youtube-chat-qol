/**
 * Main live-chat content script.
 *
 * This file is the wiring layer: it loads options, watches YouTube's live chat
 * iframe for new renderers, and delegates each behavior to feature modules.
 * Keeping DOM observation centralized makes mutation-driven behavior easier to
 * reason about.
 */
import { enhanceEmojiPicker, handleEmojiPickerClick, initFrequentEmojis, resetFrequentEmojis } from '../features/frequent-emojis';
import { initChatCommands, resetChatCommandsState } from '../features/chat-commands';
import { enhanceMenu } from '../features/menus';
import { handleMessageMenuActivation, wireMessageContext } from '../features/menus/message-menu';
import { configureSettingsMenu, refreshSettingsMenus } from '../features/menus/settings-menu';
import {
  handlePotentialInbox,
  highlightPotentialInboxKeywords,
  initInbox,
  resetInboxState,
  scheduleInboxButtonWire
} from '../features/inbox';
import { initSound } from '../features/inbox/sound';
import { keepChatAtLiveEdge, scheduleKeepChatAtLiveEdge } from '../features/live-edge';
import { closeProfileCard, wireParticipantProfileClick, wireProfileClick } from '../features/profile-popup';
import { wireAuthorNameMention } from '../features/reply';
import {
  clearTranslations,
  getRetroactiveTranslationMessages,
  MAX_RETROACTIVE_TRANSLATIONS,
  queueMessageTranslation
} from '../features/translation/queue';
import { recordUserMessage } from '../features/user-message-history';
import { DEFAULT_OPTIONS, getTargetLanguageUpdate, normalizeOptions, type Options } from '../shared/options';
import { getOptions, setOptions } from '../shared/state';
import { CHAT_MESSAGE_SELECTOR, PARTICIPANT_SELECTOR } from '../youtube/selectors';

let observer: MutationObserver | null = null;
let visibilityRecoveryTimer = 0;

init();

function init(): void {
  initFrequentEmojis();
  initSound();
  initInbox();
  initChatCommands(saveOptions);
  configureSettingsMenu(saveOptions);

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
    applyOptionSideEffects(previousOptions, getOptions());
    refreshSettingsMenus();
  });

  chrome.runtime.onMessage.addListener((message: { type?: string }) => {
    if (message?.type !== 'ytcq:reset-page') return;
    resetPageState();
  });
}

function boot(): void {
  processExistingMessages(getOptions().targetLanguage ? MAX_RETROACTIVE_TRANSLATIONS : 0);
  processExistingParticipants();
  document.querySelectorAll('ytd-menu-popup-renderer').forEach(enhanceMenu);
  document.querySelectorAll('yt-emoji-picker-renderer').forEach(enhanceEmojiPicker);
  scheduleInboxButtonWire();
  document.addEventListener('click', handleEmojiPickerClick, true);
  document.addEventListener('pointerdown', handleMessageMenuActivation, true);
  document.addEventListener('click', handleMessageMenuActivation, true);
  document.addEventListener('keydown', handleMessageMenuActivation, true);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  observer = new MutationObserver((mutations) => {
    let shouldWireInboxButton = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        const targetMenu = mutation.target instanceof Element
          ? mutation.target.closest('ytd-menu-popup-renderer')
          : null;
        if (targetMenu) {
          enhanceMenu(targetMenu);
        }
        if (mutation.target instanceof Element && mutation.target.closest('yt-live-chat-header-renderer')) {
          shouldWireInboxButton = true;
        }
        retryTranslationForLateMessageText(mutation.target);
        recordMessageForLateText(mutation.target);
      } else if (mutation.type === 'characterData') {
        retryTranslationForLateMessageText(mutation.target);
        recordMessageForLateText(mutation.target);
      }

      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.closest('.ytcq-frequent-emoji-row')) continue;
        if (isExtensionManagedAddedNode(node)) continue;
        if (
          node.matches('yt-live-chat-header-renderer') ||
          node.querySelector('yt-live-chat-header-renderer')
        ) {
          shouldWireInboxButton = true;
        }
        if (node.matches(CHAT_MESSAGE_SELECTOR) && node instanceof HTMLElement) {
          enhanceMessage(node, { allowTranslate: true });
        }
        if (node.matches(PARTICIPANT_SELECTOR) && node instanceof HTMLElement) {
          enhanceParticipant(node);
        }
        const containingMessage = node.closest<HTMLElement>(CHAT_MESSAGE_SELECTOR);
        if (containingMessage && !node.matches(CHAT_MESSAGE_SELECTOR)) {
          enhanceMessage(containingMessage, { allowTranslate: false });
        }
        const containingParticipant = node.closest<HTMLElement>(PARTICIPANT_SELECTOR);
        if (containingParticipant && !node.matches(PARTICIPANT_SELECTOR)) {
          enhanceParticipant(containingParticipant);
        }
        if (node.matches('ytd-menu-popup-renderer')) {
          enhanceMenu(node);
        }
        if (node.matches('yt-emoji-picker-renderer')) {
          enhanceEmojiPicker(node);
        }
        const containingMenu = node.closest('ytd-menu-popup-renderer');
        if (containingMenu) {
          enhanceMenu(containingMenu);
        }
        const containingEmojiPicker = node.closest('yt-emoji-picker-renderer');
        if (containingEmojiPicker) {
          enhanceEmojiPicker(containingEmojiPicker);
        }
        for (const message of node.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR)) {
          enhanceMessage(message, { allowTranslate: true });
        }
        for (const participant of node.querySelectorAll<HTMLElement>(PARTICIPANT_SELECTOR)) {
          enhanceParticipant(participant);
        }
        for (const menu of node.querySelectorAll('ytd-menu-popup-renderer')) {
          enhanceMenu(menu);
        }
        for (const picker of node.querySelectorAll('yt-emoji-picker-renderer')) {
          enhanceEmojiPicker(picker);
        }
      }
    }

    if (shouldWireInboxButton) {
      scheduleInboxButtonWire();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

function processExistingMessages(translateLimit: number): void {
  const messages = Array.from(document.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR));
  messages.forEach((message) => {
    enhanceMessage(message, { allowTranslate: false });
  });

  if (!getOptions().targetLanguage || translateLimit <= 0) return;

  getRetroactiveTranslationMessages(messages, translateLimit)
    .forEach((message) => queueMessageTranslation(message, { backfill: true }));
}

function processExistingParticipants(): void {
  document.querySelectorAll<HTMLElement>(PARTICIPANT_SELECTOR).forEach(enhanceParticipant);
}

function scheduleVisibleMessageRecovery(): void {
  if (document.visibilityState === 'hidden') return;
  if (visibilityRecoveryTimer) window.clearTimeout(visibilityRecoveryTimer);
  scheduleKeepChatAtLiveEdge();
  visibilityRecoveryTimer = window.setTimeout(() => {
    visibilityRecoveryTimer = 0;
    processExistingMessages(getOptions().targetLanguage ? MAX_RETROACTIVE_TRANSLATIONS : 0);
  }, 300);
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    keepChatAtLiveEdge();
    return;
  }

  scheduleVisibleMessageRecovery();
}

function enhanceMessage(message: HTMLElement, { allowTranslate }: { allowTranslate: boolean }): void {
  recordUserMessage(message);
  wireMessageContext(message);
  wireProfileClick(message);
  wireAuthorNameMention(message);

  if (allowTranslate) {
    handlePotentialInbox(message);
  } else {
    highlightPotentialInboxKeywords(message);
  }

  if (allowTranslate && getOptions().targetLanguage) {
    queueMessageTranslation(message);
  }
}

function enhanceParticipant(participant: HTMLElement): void {
  wireParticipantProfileClick(participant);
}

function retryTranslationForLateMessageText(target: Node): void {
  if (!getOptions().targetLanguage) return;

  const targetElement = target instanceof Element ? target : target.parentElement;
  if (!targetElement || isExtensionManagedMutation(targetElement)) return;

  const message = targetElement.closest<HTMLElement>(CHAT_MESSAGE_SELECTOR);
  if (!message || message.dataset.ytcqTranslationKey) return;

  queueMessageTranslation(message);
}

function recordMessageForLateText(target: Node): void {
  const targetElement = target instanceof Element ? target : target.parentElement;
  if (!targetElement || isExtensionManagedMutation(targetElement)) return;

  const message = targetElement.closest<HTMLElement>(CHAT_MESSAGE_SELECTOR);
  if (message) {
    recordUserMessage(message);
    handlePotentialInbox(message);
  }
}

function isExtensionManagedMutation(element: Element): boolean {
  const chatMessage = element.closest<HTMLElement>(CHAT_MESSAGE_SELECTOR);
  if (chatMessage?.dataset.ytcqInboxKeywordHighlighting === 'true') return true;

  return Boolean(element.closest([
    '.ytcq-translation',
    '.ytcq-replaced-translation-icon',
    '.ytcq-frequent-emoji-row',
    '.ytcq-profile-card',
    '.ytcq-inbox-card',
    'ytd-menu-popup-renderer'
  ].join(',')));
}

function isExtensionManagedAddedNode(element: Element): boolean {
  const chatMessage = element.closest<HTMLElement>(CHAT_MESSAGE_SELECTOR);
  if (chatMessage?.dataset.ytcqInboxKeywordHighlighting === 'true') return true;

  return Boolean(element.closest([
    '.ytcq-chat-keyword-highlight',
    '.ytcq-translation',
    '.ytcq-replaced-translation-icon',
    '.ytcq-profile-card',
    '.ytcq-inbox-card'
  ].join(',')));
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
  applyOptionSideEffects(previousOptions, getOptions());
  refreshSettingsMenus();
  chrome.storage.sync.set(nextValues);
}

function applyOptionSideEffects(previousOptions: Options, nextOptions: Options): void {
  const languageChanged = nextOptions.targetLanguage !== previousOptions.targetLanguage;
  const displayChanged = nextOptions.translationDisplay !== previousOptions.translationDisplay;

  if (languageChanged || displayChanged) {
    clearTranslations();
    if (nextOptions.targetLanguage) {
      processExistingMessages(MAX_RETROACTIVE_TRANSLATIONS);
    }
  }
}

function resetPageState(): void {
  const previousOptions = getOptions();
  setOptions(DEFAULT_OPTIONS);
  clearTranslations();
  resetInboxState();
  resetFrequentEmojis();
  resetChatCommandsState();
  closeProfileCard();
  document.querySelectorAll('.ytcq-toast').forEach((toast) => toast.remove());
  applyOptionSideEffects(previousOptions, DEFAULT_OPTIONS);
  refreshSettingsMenus();
  scheduleInboxButtonWire();
}
