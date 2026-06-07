/**
 * Focus mode translation rendering.
 *
 * Renders focus-panel message text with any available live-chat translation
 * state in the same style used by profile cards.
 */
import { getOptions } from '../../shared/state';
import { appendRichMessageText } from '../../youtube/rich-text';
import {
  createInlineTranslationElement,
  isMeaningfulTranslation,
  renderToggleableReplacementTranslation
} from '../translation/render';
import type { MessageTranslationRecord } from '../translation/types';
import type { FocusRecord } from './types';

export function renderFocusMessageText(item: HTMLElement, bubble: HTMLElement, record: FocusRecord): void {
  const translation = getVisibleFocusMessageTranslation(record);

  if (translation && getOptions().translationDisplay === 'replace') {
    renderToggleableReplacementTranslation({
      host: item,
      originalText: record.text,
      protectedTokens: translation.protectedTokens,
      renderOriginal: (target) => appendRichMessageText(target, record.text, [], record.contentParts),
      result: translation.result,
      textElement: bubble
    });
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
