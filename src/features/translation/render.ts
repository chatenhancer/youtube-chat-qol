/**
 * Translation rendering.
 *
 * Supports replacing YouTube's message text in-place or appending a smaller
 * translated line below the original. Original message DOM is remembered so
 * settings changes can restore chat messages cleanly.
 */
import { getLocalizedLanguageLabel, t } from '../../shared/i18n';
import { createTranslateIcon } from '../../shared/icons';
import { getOptions } from '../../shared/state';
import { normalizeComparableText } from '../../shared/text';
import {
  getMessageTextElement,
  rememberOriginalMessageText,
  restoreReplacedTranslation
} from '../../youtube/messages';
import {
  createNodesWithPlaceholders,
  restorePlaceholdersToText,
  type ProtectedToken
} from './protected-placeholders';

export interface TranslationResult {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
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
  document.querySelectorAll('.ytcq-translation-replaced').forEach(restoreReplacedTranslation);
  document.querySelectorAll('.ytcq-translation').forEach((node) => node.remove());
  document.querySelectorAll<HTMLElement>('[data-ytcq-translation-key]')
    .forEach((message) => delete message.dataset.ytcqTranslationKey);
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
  const translation = document.createElement('div');
  translation.className = 'ytcq-translation';
  translation.lang = result.targetLanguage;
  translation.title = hasReliableSourceLanguage(result)
    ? t('translatedFrom', { language: getLocalizedLanguageLabel(result.sourceLanguage) })
    : t('translatedMessage');

  const prefix = document.createElement('span');
  prefix.className = 'ytcq-translation-prefix';
  prefix.textContent = t('translated');

  const body = document.createElement('span');
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
  const icon = document.createElement('span');
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
