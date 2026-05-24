/**
 * Translation rendering.
 *
 * Supports replacing YouTube's message text in-place or appending a smaller
 * translated line below the original. Original message DOM is remembered so
 * settings changes can restore chat messages cleanly.
 */
import { getLocalizedLanguageLabel, t } from '../../shared/i18n';
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

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const TRANSLATION_ICON_PATH = 'M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17a15.7 15.7 0 01-2.86 4.63A15.07 15.07 0 017.22 7H5.2a17.2 17.2 0 002.77 5.03l-5.09 5.02L4.3 18.47l5.01-5.01 3.11 3.11.45-1.5ZM18.5 10h-2L12 22h2l1.13-3h4.74L21 22h2l-4.5-12Zm-2.62 7l1.62-4.33L19.12 17h-3.24Z';

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
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '14');
  svg.setAttribute('focusable', 'false');

  const path = document.createElementNS(SVG_NAMESPACE, 'path');
  path.setAttribute('d', TRANSLATION_ICON_PATH);
  svg.appendChild(path);
  return svg;
}

function hasReliableSourceLanguage(result: TranslationResult): boolean {
  if (!result.sourceLanguage || !result.targetLanguage) return false;
  return normalizeLanguageCode(result.sourceLanguage) !== normalizeLanguageCode(result.targetLanguage);
}

function normalizeLanguageCode(language: string): string {
  return String(language || '').toLowerCase().split('-')[0];
}
