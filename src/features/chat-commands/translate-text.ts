/**
 * Inline translation command helpers.
 *
 * Parses /translate arguments, protects emoji and mentions through the shared
 * placeholder planner, and returns translated text for the chat input.
 */
import { t } from '../../shared/i18n';
import { cleanText } from '../../shared/text';
import { showToast } from '../../shared/toast';
import {
  createNodesWithPlaceholders,
  createTranslationPlanFromNodes,
  restorePlaceholdersToText,
  type TranslationPlan
} from '../translation/protected-placeholders';
import type { TranslationResult } from '../translation/types';
import { LANGUAGE_OPTIONS } from '../../shared/languages';
import { normalizeCommandToken } from './parser';

export function parseTranslateTextCommand(value: string): {
  targetLanguage: string;
  text: string;
} | null {
  const text = cleanText(value);
  const match = /^(\S+)\s+([\s\S]+)$/.exec(text);
  if (!match) {
    showToast(text ? t('missingTextToTranslate') : t('missingLanguageCode'));
    return null;
  }

  const targetLanguage = getLanguageCodeCommandTarget(match[1]);
  if (!targetLanguage) {
    showToast(t('invalidLanguageCode'));
    return null;
  }

  const sourceText = cleanText(match[2]);
  if (!sourceText) {
    showToast(t('missingTextToTranslate'));
    return null;
  }

  return {
    targetLanguage,
    text: sourceText
  };
}

export async function translateCommandText(text: string, targetLanguage: string): Promise<string> {
  const holder = document.createElement('span');
  holder.textContent = text;
  const plan = createTranslationPlanFromNodes(holder.childNodes, text);
  return (await translateTranslationPlan(plan, text, targetLanguage)).text;
}

export async function translateTranslationPlan(
  plan: TranslationPlan,
  fallbackText: string,
  targetLanguage: string
): Promise<{ nodes: Node[]; text: string }> {
  const result = await sendCommandTranslationRequest(plan.text || fallbackText, targetLanguage);
  const text = cleanText(restorePlaceholdersToText(result.text, plan.protectedTokens) || result.text || fallbackText);

  return {
    nodes: createNodesWithPlaceholders(result.text || fallbackText, plan.protectedTokens),
    text
  };
}

function getLanguageCodeCommandTarget(value: string): string {
  const normalized = normalizeCommandToken(value);
  return LANGUAGE_OPTIONS.find(([code]) => normalizeCommandToken(code) === normalized)?.[0] || '';
}

function sendCommandTranslationRequest(text: string, targetLanguage: string): Promise<TranslationResult> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      type: 'ytcq:translate',
      text,
      targetLanguage
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response?.ok) {
        reject(new Error(response?.error || 'Translate request failed.'));
        return;
      }

      resolve({
        text: response.translatedText || text,
        sourceLanguage: response.sourceLanguage || '',
        targetLanguage
      });
    });
  });
}
