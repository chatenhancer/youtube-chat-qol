/**
 * Translation rendering.
 *
 * Supports replacing YouTube's message text in-place or appending a smaller
 * translated line below the original. Original message DOM is remembered so
 * settings changes can restore chat messages cleanly.
 */
import { getLocalizedLanguageLabel, t } from '../../shared/i18n';
import { createTranslateIcon } from '../../shared/icons';
import { ytcqCreateElement } from '../../shared/managed-dom';
import { getOptions } from '../../shared/state';
import { normalizeComparableText } from '../../shared/text';
import {
  getMessageTextElement,
  rememberOriginalMessageText,
  restoreReplacedTranslation
} from '../../youtube/messages';
import { CHAT_SCROLLER_SELECTOR } from '../../youtube/selectors';
import {
  createNodesWithPlaceholders,
  restorePlaceholdersToText,
  type ProtectedToken
} from './protected-placeholders';
import type { TranslationResult } from './types';

const TOP_SCROLL_TOLERANCE_PX = 2;
const BOTTOM_SCROLL_TOLERANCE_PX = 6;

interface ChatScrollerSnapshot {
  scroller: HTMLElement;
  scrollTop: number;
  wasAtTop: boolean;
  wasAtBottom: boolean;
}

export function renderTranslation(
  message: HTMLElement,
  result: TranslationResult,
  originalText: string,
  protectedTokens: ProtectedToken[] = [],
  sourceText = originalText
): boolean {
  if (!message.isConnected) return false;
  if (!isMeaningfulTranslation(result, protectedTokens, sourceText)) return false;

  if (getOptions().translationDisplay === 'replace') {
    renderReplacementTranslation(message, result, originalText, protectedTokens);
    return true;
  }

  restoreReplacedTranslation(message);
  renderInlineTranslation(message, result, originalText, protectedTokens);
  return true;
}

export function clearTranslationRenderings(): void {
  const scrollerSnapshot = captureChatScrollerSnapshot();
  document.querySelectorAll('.ytcq-translation-replaced').forEach(restoreReplacedTranslation);
  document.querySelectorAll('.ytcq-translation').forEach((node) => node.remove());
  document.querySelectorAll<HTMLElement>('[data-ytcq-translation-key]')
    .forEach((message) => delete message.dataset.ytcqTranslationKey);
  restoreChatScrollerAfterTranslationClear(scrollerSnapshot);
}

export function removeTranslation(message: HTMLElement): void {
  message.querySelector(':scope .ytcq-translation')?.remove();
  restoreReplacedTranslation(message);
}

function renderInlineTranslation(
  message: HTMLElement,
  result: TranslationResult,
  originalText: string,
  protectedTokens: ProtectedToken[] = []
): void {
  const content = message.querySelector('#content') || message;
  const existing = message.querySelector<HTMLElement>(':scope .ytcq-translation');
  const translation = existing || createInlineTranslationElement(result, protectedTokens);

  if (existing) {
    existing.replaceWith(createInlineTranslationElement(result, protectedTokens));
    return;
  }

  if (!existing) content.appendChild(translation);
}

function renderReplacementTranslation(
  message: HTMLElement,
  result: TranslationResult,
  originalText: string,
  protectedTokens: ProtectedToken[] = []
): void {
  const messageText = getMessageTextElement(message);
  if (!messageText) {
    renderInlineTranslation(message, result, originalText, protectedTokens);
    return;
  }

  message.querySelector(':scope .ytcq-translation')?.remove();
  rememberOriginalMessageText(message, messageText, originalText);

  message.classList.add('ytcq-translation-replaced');
  message.dataset.ytcqReplacedTranslation = 'true';
  messageText.classList.add('ytcq-translation-replaced-text');
  messageText.lang = result.targetLanguage;
  messageText.title = getReplacementTranslationTitle(result, originalText);
  messageText.replaceChildren(...createNodesWithPlaceholders(result.text, protectedTokens));
  messageText.appendChild(createReplacedTranslationIcon());
}

export function createInlineTranslationElement(
  result: TranslationResult,
  protectedTokens: ProtectedToken[] = []
): HTMLElement {
  const translation = ytcqCreateElement('div');
  translation.className = 'ytcq-translation';
  translation.lang = result.targetLanguage;
  translation.title = hasReliableSourceLanguage(result)
    ? t('translatedFrom', { language: getLocalizedLanguageLabel(result.sourceLanguage) })
    : t('translatedMessage');

  const prefix = ytcqCreateElement('span');
  prefix.className = 'ytcq-translation-prefix';
  prefix.textContent = t('translated');

  const body = ytcqCreateElement('span');
  body.append(...createNodesWithPlaceholders(result.text, protectedTokens));

  translation.append(prefix, body);
  return translation;
}

export function isMeaningfulTranslation(
  result: TranslationResult,
  protectedTokens: ProtectedToken[] = [],
  sourceText = ''
): boolean {
  const translatedText = restorePlaceholdersToText(result.text, protectedTokens);
  const comparableSourceText = restorePlaceholdersToText(sourceText, protectedTokens);
  return normalizeComparableText(translatedText) !== normalizeComparableText(comparableSourceText);
}

export function getReplacementTranslationTitle(result: TranslationResult, originalText: string): string {
  if (!originalText) return t('originalMessage');
  return hasReliableSourceLanguage(result)
    ? t('translatedFromOriginal', { language: getLocalizedLanguageLabel(result.sourceLanguage), text: originalText })
    : t('original', { text: originalText });
}

export function createReplacedTranslationIcon(): HTMLElement {
  const icon = ytcqCreateElement('span');
  icon.className = 'ytcq-replaced-translation-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.appendChild(createTranslationSvgIcon());
  return icon;
}

function createTranslationSvgIcon(): SVGSVGElement {
  return createTranslateIcon();
}

function hasReliableSourceLanguage(result: TranslationResult): boolean {
  if (!result.sourceLanguage || !result.targetLanguage) return false;
  return normalizeLanguageCode(result.sourceLanguage) !== normalizeLanguageCode(result.targetLanguage);
}

function normalizeLanguageCode(language: string): string {
  return String(language || '').toLowerCase().split('-')[0];
}

function captureChatScrollerSnapshot(): ChatScrollerSnapshot | null {
  const scroller = document.querySelector<HTMLElement>(CHAT_SCROLLER_SELECTOR);
  if (!scroller) return null;

  return {
    scroller,
    scrollTop: scroller.scrollTop,
    wasAtTop: scroller.scrollTop <= TOP_SCROLL_TOLERANCE_PX,
    wasAtBottom: scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - BOTTOM_SCROLL_TOLERANCE_PX
  };
}

function restoreChatScrollerAfterTranslationClear(snapshot: ChatScrollerSnapshot | null): void {
  if (!snapshot) return;

  window.requestAnimationFrame(() => {
    const { scroller } = snapshot;
    if (!scroller.isConnected) return;

    if (snapshot.wasAtTop) {
      scroller.scrollTop = 0;
    } else if (snapshot.wasAtBottom) {
      scroller.scrollTop = scroller.scrollHeight;
    } else {
      const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      scroller.scrollTop = Math.min(snapshot.scrollTop, maxScrollTop);
    }

    notifyChatListLayoutChanged(scroller);
  });
}

function notifyChatListLayoutChanged(scroller: HTMLElement): void {
  const listRenderer = scroller.closest('yt-live-chat-item-list-renderer');
  const chatRenderer = scroller.closest('yt-live-chat-renderer');
  const resizeTargets = new Set<Element>([scroller]);
  if (listRenderer) resizeTargets.add(listRenderer);
  if (chatRenderer) resizeTargets.add(chatRenderer);

  // YouTube's Polymer chat list can cache message row heights while scrolled up.
  // Bulk translation removal shrinks rows, so notify it before the stale offset shows as blank space.
  resizeTargets.forEach((target) => {
    target.dispatchEvent(new CustomEvent('iron-resize', { bubbles: true, composed: true }));
  });
  scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
  window.dispatchEvent(new Event('resize'));
}
