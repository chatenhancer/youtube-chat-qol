/**
 * Translation rendering.
 *
 * Supports replacing YouTube's message text in-place or appending a smaller
 * translated line below the original. Original message DOM is remembered so
 * settings changes can restore chat messages cleanly.
 */
import { getLanguageLabel } from '../../shared/languages';
import { getOptions } from '../../shared/state';
import { normalizeComparableText } from '../../shared/text';
import {
  getMessageTextElement,
  rememberOriginalMessageText,
  restoreReplacedTranslation
} from '../../youtube/messages';
import {
  createNodesWithEmojiPlaceholders,
  restoreEmojiPlaceholdersToText,
  type EmojiToken
} from './emojiPlaceholders';

export interface TranslationResult {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export function renderTranslation(
  message: HTMLElement,
  result: TranslationResult,
  originalText: string,
  emojiTokens: EmojiToken[] = []
): boolean {
  if (!message.isConnected) return false;
  const translatedText = restoreEmojiPlaceholdersToText(result.text, emojiTokens);
  if (normalizeComparableText(translatedText) === normalizeComparableText(originalText)) return false;

  if (getOptions().translationDisplay === 'replace') {
    renderReplacementTranslation(message, result, originalText, emojiTokens);
    return true;
  }

  restoreReplacedTranslation(message);
  renderInlineTranslation(message, result, originalText, emojiTokens);
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
  emojiTokens: EmojiToken[] = []
): void {
  const content = message.querySelector('#content') || message;
  const existing = message.querySelector<HTMLElement>(':scope .ytcq-translation');
  const translation = existing || document.createElement('div');

  translation.className = 'ytcq-translation';
  translation.lang = result.targetLanguage;
  translation.title = result.sourceLanguage
    ? `Translated from ${getLanguageLabel(result.sourceLanguage)}`
    : 'Translated message';
  translation.textContent = '';

  const prefix = document.createElement('span');
  prefix.className = 'ytcq-translation-prefix';
  prefix.textContent = 'Translated:';

  const body = document.createElement('span');
  body.append(...createNodesWithEmojiPlaceholders(result.text, emojiTokens));

  translation.append(prefix, body);
  if (!existing) content.appendChild(translation);
}

function renderReplacementTranslation(
  message: HTMLElement,
  result: TranslationResult,
  originalText: string,
  emojiTokens: EmojiToken[] = []
): void {
  const messageText = getMessageTextElement(message);
  if (!messageText) {
    renderInlineTranslation(message, result, originalText, emojiTokens);
    return;
  }

  message.querySelector(':scope .ytcq-translation')?.remove();
  rememberOriginalMessageText(message, messageText, originalText);

  message.classList.add('ytcq-translation-replaced');
  message.dataset.ytcqReplacedTranslation = 'true';
  messageText.classList.add('ytcq-translation-replaced-text');
  messageText.lang = result.targetLanguage;
  messageText.title = getReplacementTranslationTitle(result, originalText);
  messageText.replaceChildren(...createNodesWithEmojiPlaceholders(result.text, emojiTokens));
  messageText.appendChild(createReplacedTranslationIcon());
}

function getReplacementTranslationTitle(result: TranslationResult, originalText: string): string {
  if (!originalText) return 'Original message';
  return result.sourceLanguage
    ? `Translated from ${getLanguageLabel(result.sourceLanguage)}: ${originalText}`
    : `Original: ${originalText}`;
}

function createReplacedTranslationIcon(): HTMLElement {
  const icon = document.createElement('span');
  icon.className = 'ytcq-replaced-translation-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 0 24 24" width="14" focusable="false"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17a15.7 15.7 0 01-2.86 4.63A15.07 15.07 0 017.22 7H5.2a17.2 17.2 0 002.77 5.03l-5.09 5.02L4.3 18.47l5.01-5.01 3.11 3.11.45-1.5ZM18.5 10h-2L12 22h2l1.13-3h4.74L21 22h2l-4.5-12Zm-2.62 7l1.62-4.33L19.12 17h-3.24Z"></path></svg>';
  return icon;
}
