/**
 * Main live-chat content script.
 *
 * This file is the wiring layer: it loads options, watches YouTube's live chat
 * iframe for new renderers, and delegates each behavior to feature modules.
 * Keeping DOM observation centralized makes mutation-driven behavior easier to
 * reason about.
 */
import { enhanceEmojiPicker, handleEmojiPickerClick, initFrequentEmojis } from '../features/frequentEmojis';
import { enhanceMenu } from '../features/menus';
import { handleMessageMenuActivation, wireMessageContext } from '../features/menus/messageMenu';
import { configureSettingsMenu, refreshSettingsMenus } from '../features/menus/settingsMenu';
import { handlePotentialMentionsInbox, initMentionsInbox, scheduleMentionsInboxButtonWire } from '../features/mentionsInbox';
import { handlePotentialMention, initMentionSound } from '../features/mentionSound';
import { wireProfileClick } from '../features/profilePopup';
import { handleShiftClickMention, wireAuthorNameMention } from '../features/reply';
import {
  clearTranslations,
  getRetroactiveTranslationMessages,
  MAX_RETROACTIVE_TRANSLATIONS,
  queueMessageTranslation
} from '../features/translation/queue';
import { recordUserMessage } from '../features/userMessageHistory';
import { DEFAULT_OPTIONS, normalizeOptions, type Options } from '../shared/options';
import { getOptions, setOptions } from '../shared/state';
import { CHAT_MESSAGE_SELECTOR } from '../youtube/selectors';

let observer: MutationObserver | null = null;
let visibilityRecoveryTimer = 0;

init();

function init(): void {
  initFrequentEmojis();
  initMentionSound();
  initMentionsInbox();
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
}

function boot(): void {
  processExistingMessages(getOptions().targetLanguage ? MAX_RETROACTIVE_TRANSLATIONS : 0);
  document.querySelectorAll('ytd-menu-popup-renderer').forEach(enhanceMenu);
  document.querySelectorAll('yt-emoji-picker-renderer').forEach(enhanceEmojiPicker);
  scheduleMentionsInboxButtonWire();
  document.addEventListener('click', handleEmojiPickerClick, true);
  document.addEventListener('pointerdown', handleMessageMenuActivation, true);
  document.addEventListener('click', handleMessageMenuActivation, true);
  document.addEventListener('click', handleShiftClickMention, true);
  document.addEventListener('keydown', handleMessageMenuActivation, true);
  document.addEventListener('visibilitychange', scheduleVisibleMessageRecovery);
  window.addEventListener('focus', scheduleVisibleMessageRecovery);

  observer = new MutationObserver((mutations) => {
    let shouldWireMentionsInboxButton = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        const targetMenu = mutation.target instanceof Element
          ? mutation.target.closest('ytd-menu-popup-renderer')
          : null;
        if (targetMenu) {
          enhanceMenu(targetMenu);
        }
        if (mutation.target instanceof Element && mutation.target.closest('yt-live-chat-header-renderer')) {
          shouldWireMentionsInboxButton = true;
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
        if (
          node.matches('yt-live-chat-header-renderer') ||
          node.querySelector('yt-live-chat-header-renderer')
        ) {
          shouldWireMentionsInboxButton = true;
        }
        if (node.matches(CHAT_MESSAGE_SELECTOR) && node instanceof HTMLElement) {
          enhanceMessage(node, { allowTranslate: true });
        }
        const containingMessage = node.closest<HTMLElement>(CHAT_MESSAGE_SELECTOR);
        if (containingMessage && !node.matches(CHAT_MESSAGE_SELECTOR)) {
          enhanceMessage(containingMessage, { allowTranslate: false });
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
        for (const menu of node.querySelectorAll('ytd-menu-popup-renderer')) {
          enhanceMenu(menu);
        }
        for (const picker of node.querySelectorAll('yt-emoji-picker-renderer')) {
          enhanceEmojiPicker(picker);
        }
      }
    }

    if (shouldWireMentionsInboxButton) {
      scheduleMentionsInboxButtonWire();
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

function scheduleVisibleMessageRecovery(): void {
  if (document.visibilityState === 'hidden') return;
  if (visibilityRecoveryTimer) window.clearTimeout(visibilityRecoveryTimer);
  visibilityRecoveryTimer = window.setTimeout(() => {
    visibilityRecoveryTimer = 0;
    processExistingMessages(getOptions().targetLanguage ? MAX_RETROACTIVE_TRANSLATIONS : 0);
  }, 300);
}

function enhanceMessage(message: HTMLElement, { allowTranslate }: { allowTranslate: boolean }): void {
  recordUserMessage(message);
  wireMessageContext(message);
  wireProfileClick(message);
  wireAuthorNameMention(message);

  if (allowTranslate) {
    handlePotentialMention(message);
    handlePotentialMentionsInbox(message);
  }

  if (allowTranslate && getOptions().targetLanguage) {
    queueMessageTranslation(message);
  }
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
  if (message) recordUserMessage(message);
}

function isExtensionManagedMutation(element: Element): boolean {
  return Boolean(element.closest([
    '.ytcq-translation',
    '.ytcq-replaced-translation-icon',
    '.ytcq-frequent-emoji-row',
    '.ytcq-profile-card',
    'ytd-menu-popup-renderer'
  ].join(',')));
}

function saveOptions(values: Partial<Options>): void {
  const previousOptions = getOptions();
  setOptions(normalizeOptions({ ...previousOptions, ...values }));
  applyOptionSideEffects(previousOptions, getOptions());
  refreshSettingsMenus();
  chrome.storage.sync.set(values);
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
