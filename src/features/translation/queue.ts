/**
 * Translation queue and cache.
 *
 * Live messages and retroactive backfill use separate queues. New live messages
 * usually outrank ordinary backfill, while open focus/profile panels can
 * temporarily prioritize the messages they are showing. Backfill is capped and
 * throttled so old chat history cannot starve fresh messages or overload the
 * unofficial translate endpoint. The pending backlog is also capped so slow
 * translation responses do not retain stale chat renderers in very fast streams.
 */
import { getOptions } from '../../shared/state';
import { cleanText } from '../../shared/text';
import { getMessageDetails } from '../../youtube/messages';
import { CHAT_MESSAGE_SELECTOR } from '../../youtube/selectors';
import {
  emitMessageTranslationCleared,
  emitMessageTranslationRendered,
  emitMessageTranslationsCleared
} from './events';
import { createTranslationPlan, hasTextOutsidePlaceholders, type ProtectedToken } from './protected-placeholders';
import { clearTranslationRenderings, removeTranslation, renderTranslation } from './render';
import type { TranslationResult } from './types';

interface PendingTranslationEntry {
  messageRef: WeakRef<HTMLElement>;
  originalText: string;
  sourceText: string;
  protectedTokens: ProtectedToken[];
  sequence: number;
}

interface TranslationJob {
  key: string;
  text: string;
  targetLanguage: string;
}

interface TranslationRequest {
  key: string;
  originalText: string;
  protectedTokens: ProtectedToken[];
  sourceText: string;
  targetLanguage: string;
}

interface ActiveTranslationPriorityScope {
  keys: Set<string>;
  messages: Set<HTMLElement>;
}

export interface TranslationPriorityScope {
  /** Releases all priority keys retained by this panel/surface. */
  close: () => void;
  /** Marks live message renderers as important while this scope is open. */
  prioritize: (messages: Iterable<HTMLElement | null | undefined>) => void;
}

const MAX_RETROACTIVE_TRANSLATIONS = 150;

const MAX_TRANSLATION_CACHE_SIZE = 500;
const MAX_TRANSLATION_CONCURRENCY = 2;
const MAX_PENDING_TRANSLATION_ENTRIES = 300;
const TRANSLATION_DELAY_MS = 250;
const LIVE_TRANSLATION_DELAY_MS = 40;

let liveTranslationQueue: TranslationJob[] = [];
let backfillTranslationQueue: TranslationJob[] = [];
let activeTranslations = 0;
let translationDelayTimer = 0;
let pendingTranslationSequence = 0;

const translationCache = new Map<string, TranslationResult>();
const pendingTranslations = new Map<string, Set<PendingTranslationEntry>>();
const priorityTranslationKeys = new Map<string, number>();
const activePriorityScopes = new Set<ActiveTranslationPriorityScope>();

export function queueMessageTranslation(message: HTMLElement, { backfill = false } = {}): void {
  const request = getTranslationRequest(message);
  if (!request) return;

  retainPriorityTranslationKeyForMessage(message, request.key);
  if (message.dataset.ytcqTranslationKey === request.key) return;

  message.dataset.ytcqTranslationKey = request.key;
  removeTranslation(message);

  const cached = translationCache.get(request.key);
  if (cached) {
    const rendered = renderTranslation(message, cached, request.originalText, request.protectedTokens, request.sourceText);
    if (!rendered) {
      translationCache.delete(request.key);
      delete message.dataset.ytcqTranslationKey;
      emitMessageTranslationCleared(message);
    } else {
      emitMessageTranslationRendered({
        message,
        result: cached,
        originalText: request.originalText,
        protectedTokens: request.protectedTokens,
        sourceText: request.sourceText
      });
    }
    return;
  }

  const entry = {
    messageRef: new WeakRef(message),
    originalText: request.originalText,
    sourceText: request.sourceText,
    protectedTokens: request.protectedTokens,
    sequence: pendingTranslationSequence += 1
  };

  if (pendingTranslations.has(request.key)) {
    pendingTranslations.get(request.key)?.add(entry);
    if (!backfill) promoteBackfillTranslation(request.key);
    enforcePendingTranslationLimit();
    return;
  }

  pendingTranslations.set(request.key, new Set([entry]));
  const job = {
    key: request.key,
    text: request.sourceText,
    targetLanguage: request.targetLanguage
  };
  enqueueTranslationJob(job, { backfill });
  enforcePendingTranslationLimit();
  pumpTranslationQueue();
}

export function createTranslationPriorityScope(): TranslationPriorityScope {
  const scope = {
    keys: new Set<string>(),
    messages: new Set<HTMLElement>()
  };
  activePriorityScopes.add(scope);
  let closed = false;

  return {
    close: () => {
      if (closed) return;
      closed = true;
      scope.keys.forEach(releasePriorityTranslationKey);
      scope.keys.clear();
      scope.messages.clear();
      activePriorityScopes.delete(scope);
    },
    prioritize: (messages) => {
      if (closed) return;

      for (const message of messages) {
        if (!message?.isConnected) continue;
        scope.messages.add(message);
        const request = getTranslationRequest(message);
        if (!request) continue;
        retainPriorityTranslationKey(scope, request.key);
        if (message.dataset.ytcqTranslationKey !== request.key) {
          queueMessageTranslation(message, { backfill: true });
        }
      }

      pumpTranslationQueue();
    }
  };
}

export function clearTranslations(): void {
  liveTranslationQueue = [];
  backfillTranslationQueue = [];
  pendingTranslations.clear();
  if (translationDelayTimer) {
    window.clearTimeout(translationDelayTimer);
    translationDelayTimer = 0;
  }
  clearTranslationRenderings();
  emitMessageTranslationsCleared();
}

function getTranslationRequest(message: HTMLElement): TranslationRequest | null {
  const options = getOptions();
  if (!options.targetLanguage) return null;

  const details = getMessageDetails(message);
  const plan = createTranslationPlan(message, details.text);
  const key = makeTranslationKey(plan.text, options.targetLanguage);

  if (!details.text || !key) return null;
  if (!hasTextOutsidePlaceholders(plan.text)) return null;
  if (!isUsefulTranslationCandidate(details.text)) return null;

  return {
    key,
    originalText: details.text,
    protectedTokens: plan.protectedTokens,
    sourceText: plan.text,
    targetLanguage: options.targetLanguage
  };
}

export function queueRetroactiveTranslations(): void {
  if (!getOptions().targetLanguage) return;
  getRetroactiveTranslationMessages(getCurrentChatMessages(), MAX_RETROACTIVE_TRANSLATIONS)
    .forEach((message) => queueMessageTranslation(message, { backfill: true }));
}

function getCurrentChatMessages(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR));
}

function getRetroactiveTranslationMessages(messages: HTMLElement[], translateLimit: number): HTMLElement[] {
  const limit = Math.min(messages.length, Math.max(0, translateLimit));
  const queued = new Set<HTMLElement>();
  const result: HTMLElement[] = [];

  const add = (message: HTMLElement) => {
    if (queued.has(message)) return;
    queued.add(message);
    result.push(message);
  };

  messages
    .map(getPotentiallyVisibleMessagePosition)
    .filter((entry): entry is { message: HTMLElement; top: number } => Boolean(entry))
    .sort((a, b) => b.top - a.top)
    .forEach((entry) => add(entry.message));

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

function retainPriorityTranslationKey(scope: ActiveTranslationPriorityScope, key: string): void {
  if (scope.keys.has(key)) return;
  scope.keys.add(key);
  priorityTranslationKeys.set(key, (priorityTranslationKeys.get(key) || 0) + 1);
}

function retainPriorityTranslationKeyForMessage(message: HTMLElement, key: string): void {
  activePriorityScopes.forEach((scope) => {
    if (scope.messages.has(message)) retainPriorityTranslationKey(scope, key);
  });
}

function releasePriorityTranslationKey(key: string): void {
  const count = priorityTranslationKeys.get(key) || 0;
  if (count <= 1) {
    priorityTranslationKeys.delete(key);
    return;
  }

  priorityTranslationKeys.set(key, count - 1);
}

function enforcePendingTranslationLimit(): void {
  pruneDisconnectedPendingTranslations();
  while (getPendingTranslationEntryCount() > MAX_PENDING_TRANSLATION_ENTRIES) {
    if (dropOldestBackfillTranslation()) continue;
    if (pruneDisconnectedPendingTranslations()) continue;
    if (dropOldestLiveTranslation()) continue;
    if (dropOldestPendingTranslationEntry()) continue;
    break;
  }
}

function pruneDisconnectedPendingTranslations(): boolean {
  let pruned = false;
  for (const [key, entries] of pendingTranslations) {
    for (const entry of Array.from(entries)) {
      const message = entry.messageRef.deref();
      if (message?.isConnected) continue;
      entries.delete(entry);
      pruned = true;
    }
    if (!entries.size) {
      pendingTranslations.delete(key);
      removeQueuedTranslationJob(key);
    }
  }
  return pruned;
}

function dropOldestBackfillTranslation(): boolean {
  const job = backfillTranslationQueue.shift();
  if (!job) return false;
  dropPendingTranslationKey(job.key);
  return true;
}

function dropOldestLiveTranslation(): boolean {
  for (let index = liveTranslationQueue.length - 1; index >= 0; index -= 1) {
    const job = liveTranslationQueue[index];
    if (dropOldestPendingTranslationEntryForKey(job.key)) return true;
    liveTranslationQueue.splice(index, 1);
  }
  return false;
}

function dropOldestPendingTranslationEntry(): boolean {
  let oldestKey = '';
  let oldestEntry: PendingTranslationEntry | null = null;
  for (const [key, entries] of pendingTranslations) {
    for (const entry of entries) {
      if (!oldestEntry || entry.sequence < oldestEntry.sequence) {
        oldestKey = key;
        oldestEntry = entry;
      }
    }
  }
  if (!oldestEntry) return false;
  return dropPendingTranslationEntry(oldestKey, oldestEntry);
}

function dropOldestPendingTranslationEntryForKey(key: string): boolean {
  const entries = pendingTranslations.get(key);
  let oldestEntry: PendingTranslationEntry | null = null;
  for (const entry of entries || []) {
    if (!oldestEntry || entry.sequence < oldestEntry.sequence) {
      oldestEntry = entry;
    }
  }
  if (!oldestEntry) return false;
  return dropPendingTranslationEntry(key, oldestEntry);
}

function dropPendingTranslationEntry(key: string, entry: PendingTranslationEntry): boolean {
  const entries = pendingTranslations.get(key);
  if (!entries) return false;
  entries.delete(entry);
  clearPendingTranslationEntry(entry);
  if (!entries.size) {
    pendingTranslations.delete(key);
    removeQueuedTranslationJob(key);
  }
  return true;
}

function dropPendingTranslationKey(key: string): void {
  for (const entry of pendingTranslations.get(key) || []) {
    clearPendingTranslationEntry(entry);
  }
  pendingTranslations.delete(key);
  removeQueuedTranslationJob(key);
}

function clearPendingTranslationEntry(entry: PendingTranslationEntry): void {
  const message = entry.messageRef.deref();
  if (message?.isConnected) {
    delete message.dataset.ytcqTranslationKey;
  }
}

function removeQueuedTranslationJob(key: string): void {
  liveTranslationQueue = liveTranslationQueue.filter((job) => job.key !== key);
  backfillTranslationQueue = backfillTranslationQueue.filter((job) => job.key !== key);
}

function getPendingTranslationEntryCount(): number {
  let count = 0;
  for (const entries of pendingTranslations.values()) {
    count += entries.size;
  }
  return count;
}

function pumpTranslationQueue(): void {
  if (activeTranslations >= MAX_TRANSLATION_CONCURRENCY) return;
  if (translationDelayTimer) return;

  const job = takeNextTranslationJob();
  if (!job) return;

  activeTranslations += 1;
  translate(job.text, job.targetLanguage)
    .then((result) => {
      let renderedAny = false;
      for (const entry of pendingTranslations.get(job.key) || []) {
        const message = entry.messageRef.deref();
        if (!message) continue;

        const rendered = renderTranslation(message, result, entry.originalText, entry.protectedTokens, entry.sourceText);
        if (rendered) {
          emitMessageTranslationRendered({
            message,
            result,
            originalText: entry.originalText,
            protectedTokens: entry.protectedTokens,
            sourceText: entry.sourceText,
          });
          renderedAny = true;
        } else {
          delete message.dataset.ytcqTranslationKey;
          emitMessageTranslationCleared(message);
        }
      }
      if (renderedAny) rememberTranslation(job.key, result);
    })
    .catch(() => {
      for (const entry of pendingTranslations.get(job.key) || []) {
        const message = entry.messageRef.deref();
        if (message) delete message.dataset.ytcqTranslationKey;
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

function takeNextTranslationJob(): TranslationJob | undefined {
  return takePriorityTranslationJob(liveTranslationQueue) ||
    takePriorityTranslationJob(backfillTranslationQueue) ||
    liveTranslationQueue.shift() ||
    backfillTranslationQueue.shift();
}

function takePriorityTranslationJob(queue: TranslationJob[]): TranslationJob | undefined {
  const index = queue.findIndex((job) => priorityTranslationKeys.has(job.key));
  if (index < 0) return undefined;
  return queue.splice(index, 1)[0];
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

function getPotentiallyVisibleMessagePosition(message: HTMLElement): { message: HTMLElement; top: number } | null {
  const rect = message.getBoundingClientRect();
  const visible = rect.height > 0 &&
    rect.width > 0 &&
    rect.bottom >= -240 &&
    rect.top <= window.innerHeight + 240;
  return visible ? { message, top: rect.top } : null;
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
