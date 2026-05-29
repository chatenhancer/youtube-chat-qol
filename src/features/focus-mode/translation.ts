/**
 * Focus mode translation rendering.
 *
 * Renders focus-panel message text with any available live-chat translation
 * state in the same style used by profile cards.
 */
import { getOptions } from '../../shared/state';
import { appendRichMessageText } from '../../youtube/rich-text';
import { createNodesWithPlaceholders } from '../translation/protected-placeholders';
import {
  createInlineTranslationElement,
  createReplacedTranslationIcon,
  getReplacementTranslationTitle,
  isMeaningfulTranslation
} from '../translation/render';
import type { MessageTranslationRecord } from '../translation/types';
import type { FocusRecord } from './types';

export function renderFocusMessageText(item: HTMLElement, bubble: HTMLElement, record: FocusRecord): void {
  const translation = getVisibleFocusMessageTranslation(record);

  if (translation && getOptions().translationDisplay === 'replace') {
    item.classList.add('ytcq-translation-replaced');
    bubble.classList.add('ytcq-translation-replaced-text');
    bubble.lang = translation.result.targetLanguage;
    bubble.title = getReplacementTranslationTitle(translation.result, record.text);
    bubble.append(
      ...createNodesWithPlaceholders(translation.result.text, translation.protectedTokens),
      createReplacedTranslationIcon()
    );
    return;
  }

  appendRichMessageText(bubble, record.text, [], record.contentParts);
  if (translation) {
    bubble.append(createInlineTranslationElement(translation.result, translation.protectedTokens));
  }
}

function getVisibleFocusMessageTranslation(record: FocusRecord): MessageTranslationRecord | undefined {
  const translation = record.translation;
  const targetLanguage = getOptions().targetLanguage;
  if (!translation || !targetLanguage) return undefined;
  if (translation.result.targetLanguage !== targetLanguage) return undefined;
  if (!isMeaningfulTranslation(translation.result, translation.protectedTokens, translation.sourceText)) return undefined;
  return translation;
}
