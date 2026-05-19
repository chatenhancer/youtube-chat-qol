/**
 * Translation queue and cache.
 *
 * Live messages and retroactive backfill use separate queues. New live messages
 * always get priority, while backfill is capped and throttled so old chat
 * history cannot starve fresh messages or overload the unofficial translate
 * endpoint.
 */
import { getOptions } from '../../shared/state';
import { cleanText } from '../../shared/text';
import { getMessageDetails } from '../../youtube/messages';
import { createTranslationPlan, hasTextOutsideEmojiPlaceholders, type EmojiToken } from './emojiPlaceholders';
import { clearTranslationRenderings, removeTranslation, renderTranslation, type TranslationResult } from './render';

interface PendingTranslationEntry {
  message: HTMLElement;
  originalText: string;
  sourceText: string;
  emojiTokens: EmojiToken[];
}

interface TranslationJob {
  key: string;
  text: string;
  targetLanguage: string;
}

export const MAX_RETROACTIVE_TRANSLATIONS = 150;

const MAX_TRANSLATION_CACHE_SIZE = 500;
const MAX_TRANSLATION_CONCURRENCY = 2;
const TRANSLATION_DELAY_MS = 250;
const LIVE_TRANSLATION_DELAY_MS = 40;

let liveTranslationQueue: TranslationJob[] = [];
let backfillTranslationQueue: TranslationJob[] = [];
let activeTranslations = 0;
let translationDelayTimer = 0;

const translationCache = new Map<string, TranslationResult>();
const pendingTranslations = new Map<string, Set<PendingTranslationEntry>>();

export function queueMessageTranslation(message: HTMLElement, { backfill = false } = {}): void {
  const options = getOptions();
  if (!options.targetLanguage) return;

  const details = getMessageDetails(message);
  const plan = createTranslationPlan(message, details.text);
  const key = makeTranslationKey(plan.text, options.targetLanguage);

  if (!details.text || !key || message.dataset.ytcqTranslationKey === key) return;
  if (!hasTextOutsideEmojiPlaceholders(plan.text)) return;
  if (!isUsefulTranslationCandidate(details.text)) return;

  message.dataset.ytcqTranslationKey = key;
  removeTranslation(message);

  const cached = translationCache.get(key);
  if (cached) {
    const rendered = renderTranslation(message, cached, details.text, plan.emojiTokens, plan.text);
    if (!rendered) {
      translationCache.delete(key);
      delete message.dataset.ytcqTranslationKey;
    }
    return;
  }

  const entry = {
    message,
    originalText: details.text,
    sourceText: plan.text,
    emojiTokens: plan.emojiTokens
  };

  if (pendingTranslations.has(key)) {
    pendingTranslations.get(key)?.add(entry);
    if (!backfill) promoteBackfillTranslation(key);
    return;
  }

  pendingTranslations.set(key, new Set([entry]));
  const job = {
    key,
    text: plan.text,
    targetLanguage: options.targetLanguage
  };
  enqueueTranslationJob(job, { backfill });
  pumpTranslationQueue();
}

export function clearTranslations(): void {
  liveTranslationQueue = [];
  backfillTranslationQueue = [];
  pendingTranslations.clear();
  clearTranslationRenderings();
}

export function getRetroactiveTranslationMessages(messages: HTMLElement[], translateLimit: number): HTMLElement[] {
  const limit = Math.min(messages.length, Math.max(0, translateLimit));
  const queued = new Set<HTMLElement>();
  const result: HTMLElement[] = [];

  const add = (message: HTMLElement) => {
    if (queued.has(message)) return;
    queued.add(message);
    result.push(message);
  };

  messages
    .filter(isPotentiallyVisibleMessage)
    .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)
    .forEach(add);

  messages
    .slice()
    .reverse()
    .forEach(add);

  return result.slice(0, limit);
}

function enqueueTranslationJob(job: TranslationJob, { backfill }: { backfill: boolean }): void {
  if (backfill) {
    backfillTranslationQueue.push(job);
    return;
  }

  liveTranslationQueue.unshift(job);
  if (translationDelayTimer) {
    window.clearTimeout(translationDelayTimer);
    translationDelayTimer = 0;
  }
}

function promoteBackfillTranslation(key: string): void {
  const index = backfillTranslationQueue.findIndex((job) => job.key === key);
  if (index < 0) return;
  liveTranslationQueue.unshift(backfillTranslationQueue.splice(index, 1)[0]);
  if (translationDelayTimer) {
    window.clearTimeout(translationDelayTimer);
    translationDelayTimer = 0;
  }
  pumpTranslationQueue();
}

function pumpTranslationQueue(): void {
  if (activeTranslations >= MAX_TRANSLATION_CONCURRENCY) return;
  if (translationDelayTimer) return;

  const job = liveTranslationQueue.shift() || backfillTranslationQueue.shift();
  if (!job) return;

  activeTranslations += 1;
  translate(job.text, job.targetLanguage)
    .then((result) => {
      let renderedAny = false;
      for (const entry of pendingTranslations.get(job.key) || []) {
        const rendered = renderTranslation(entry.message, result, entry.originalText, entry.emojiTokens, entry.sourceText);
        if (rendered) {
          renderedAny = true;
        } else {
          delete entry.message.dataset.ytcqTranslationKey;
        }
      }
      if (renderedAny) rememberTranslation(job.key, result);
    })
    .catch(() => {
      for (const entry of pendingTranslations.get(job.key) || []) {
        delete entry.message.dataset.ytcqTranslationKey;
      }
    })
    .finally(() => {
      pendingTranslations.delete(job.key);
      activeTranslations -= 1;
      if (liveTranslationQueue.length) {
        pumpTranslationQueue();
        return;
      }

      translationDelayTimer = window.setTimeout(() => {
        translationDelayTimer = 0;
        pumpTranslationQueue();
      }, backfillTranslationQueue.length ? TRANSLATION_DELAY_MS : LIVE_TRANSLATION_DELAY_MS);
      pumpTranslationQueue();
    });
}

function translate(text: string, targetLanguage: string): Promise<TranslationResult> {
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

function rememberTranslation(key: string, value: TranslationResult): void {
  translationCache.set(key, value);
  if (translationCache.size <= MAX_TRANSLATION_CACHE_SIZE) return;
  const firstKey = translationCache.keys().next().value;
  if (firstKey) translationCache.delete(firstKey);
}

function isPotentiallyVisibleMessage(message: HTMLElement): boolean {
  const rect = message.getBoundingClientRect();
  return rect.height > 0 &&
    rect.width > 0 &&
    rect.bottom >= -240 &&
    rect.top <= window.innerHeight + 240;
}

function makeTranslationKey(text: string, targetLanguage: string): string {
  const clean = cleanText(text);
  if (!clean) return '';
  return `${targetLanguage}\n${clean}`;
}

function isUsefulTranslationCandidate(text: string): boolean {
  const clean = cleanText(text);
  if (/^https?:\/\//i.test(clean)) return false;
  if (!/[^\d\s!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(clean)) return false;
  if (!hasLanguageSignal(clean)) return false;
  return true;
}

function hasLanguageSignal(text: string): boolean {
  const letters = text.match(/\p{Letter}/gu) || [];
  if (!letters.length) return false;
  if (letters.length >= 2) return true;
  if (letters.some((letter) => !/\p{Script=Latin}/u.test(letter) && !/[\u0445\u0425]/u.test(letter))) return true;
  return false;
}
