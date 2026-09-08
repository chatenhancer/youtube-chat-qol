/**
 * Background translation bridge.
 *
 * Content scripts send translation jobs here so the service worker can call the
 * remote endpoint, apply a timeout, and return only the translated text plus
 * detected source language.
 */
import { TranslationRateLimitError } from '../shared/translation-errors';
import { decodeTranslationHtml, encodeTranslationHtml } from './translation-html';

const TRANSLATE_ENDPOINT = 'https://translate-pa.googleapis.com/v1/translateHtml';
// Public web-client key supplied by Google's translation element, not a user's Cloud credential.
// Source: https://translate.googleapis.com/_/translate_http/_/js/k=translate_http.tr.en_US.YusFYy3P_ro.O/am=AAg/d=1/exm=el_conf/ed=1/rs=AN8SPfq1Hb8iJRleQqQc8zhdzXmF9E56eQ/m=el_main
const TRANSLATE_WEB_CLIENT_KEY = 'AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520';
const REQUEST_TIMEOUT_MS = 8000;
const MAX_BATCH_BYTES = 8000;
const MAX_BATCH_TEXTS = 50;
const RATE_LIMIT_STORAGE_KEY = 'ytcqTranslationRetryAt';
const RATE_LIMIT_DELAY_MS = 60_000;
// Keep the pause across service-worker suspension, including browsers without session storage.
const cooldownStorage = chrome.storage.session || chrome.storage.local;
let retryAt = 0;
const cooldownReady = cooldownStorage.get(RATE_LIMIT_STORAGE_KEY).then((stored) => {
  if (Number.isFinite(stored[RATE_LIMIT_STORAGE_KEY])) retryAt = stored[RATE_LIMIT_STORAGE_KEY];
}).catch(() => undefined);

interface TranslateMessage {
  type?: string;
  text?: string;
  texts?: string[];
  targetLanguage?: string;
}

chrome.runtime.onMessage.addListener((message: TranslateMessage, _sender, sendResponse) => {
  if (!message || !['ytcq:translate', 'ytcq:translateBatch'].includes(message.type || '')) {
    return false;
  }

  const request = message.type === 'ytcq:translateBatch'
    ? translateTexts(message.texts, message.targetLanguage)
    : translateText(message.text, message.targetLanguage);

  request
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        ...(error instanceof TranslationRateLimitError
          ? { code: 'rate_limited', retryAt: error.retryAt }
          : {})
      });
    });

  return true;
});

interface BatchTranslationResult {
  translatedText: string;
  sourceLanguage: string;
}

async function translateText(text: unknown, targetLanguage: unknown): Promise<{
  ok: boolean;
  error?: string;
  translatedText?: string;
  sourceLanguage?: string;
}> {
  const response = await translateTexts([text], targetLanguage);
  return response.ok ? { ok: true, ...response.results![0] } : response;
}

async function translateTexts(texts: unknown, targetLanguage: unknown): Promise<{
  ok: boolean;
  error?: string;
  results?: BatchTranslationResult[];
}> {
  const cleanTexts = Array.isArray(texts)
    ? texts.map((text) => String(text || '').trim())
    : [];
  const target = String(targetLanguage || 'en').trim();

  if (!cleanTexts.length || cleanTexts.some((text) => !text) || !target) {
    return { ok: false, error: 'Missing text or target language.' };
  }

  const results: BatchTranslationResult[] = [];
  for (const chunk of createTranslationChunks(cleanTexts, target)) {
    const translated = await translateHtmlChunk(chunk, target, 'auto');
    // Google sometimes returns Traditional Chinese unchanged and labels it English.
    // Correct only that response, once, through the same endpoint. Kana/Hangul and
    // correctly detected Japanese/Chinese messages keep Google's original result.
    const missedChinese = chunk.map((text, index) => ({ text, index })).filter(({ text, index }) =>
      translated[index].sourceLanguage === 'en' && translated[index].translatedText === text &&
      /\p{Script=Han}/u.test(text) && !/[\p{Script=Latin}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text)
    );
    if (missedChinese.length) {
      const corrected = await translateHtmlChunk(missedChinese.map(({ text }) => text), target, 'zh-TW');
      corrected.forEach((result, index) => { translated[missedChinese[index].index] = result; });
    }
    results.push(...translated);
  }

  return { ok: true, results };
}

function createTranslationChunks(texts: string[], targetLanguage: string): string[][] {
  const chunks: string[][] = [];
  let chunk: string[] = [];

  for (const text of texts) {
    const nextChunk = [...chunk, text];
    if (
      chunk.length &&
      (nextChunk.length > MAX_BATCH_TEXTS || new TextEncoder().encode(createTranslationBody(nextChunk, targetLanguage, 'auto')).length > MAX_BATCH_BYTES)
    ) {
      chunks.push(chunk);
      chunk = [text];
      continue;
    }

    chunk = nextChunk;
  }

  if (chunk.length) chunks.push(chunk);
  return chunks;
}

async function translateHtmlChunk(texts: string[], targetLanguage: string, sourceLanguage: string): Promise<BatchTranslationResult[]> {
  const response = await fetchWithTimeout(TRANSLATE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json+protobuf', 'X-Goog-Api-Key': TRANSLATE_WEB_CLIENT_KEY },
    body: createTranslationBody(texts, targetLanguage, sourceLanguage)
  });
  if (!response.ok) throw new Error(`Translate request failed with ${response.status}`);
  const payload = await response.json() as unknown;
  if (!Array.isArray(payload) || !Array.isArray(payload[0]) || payload[0].length !== texts.length) {
    throw new Error('Translate batch response did not match the request.');
  }
  return payload[0].map((html: unknown, index: number) => {
    if (typeof html !== 'string') throw new Error('Translate batch response entry was not readable.');
    return {
      translatedText: decodeTranslationHtml(html, texts[index]),
      sourceLanguage: sourceLanguage !== 'auto' ? sourceLanguage
        : Array.isArray(payload[1]) && typeof payload[1][index] === 'string' ? payload[1][index] : ''
    };
  });
}

function createTranslationBody(texts: string[], targetLanguage: string, sourceLanguage: string): string {
  return JSON.stringify([[texts.map(encodeTranslationHtml), sourceLanguage, targetLanguage], 'wt_lib']);
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  await cooldownReady;
  if (retryAt > Date.now()) throw new TranslationRateLimitError(retryAt);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      credentials: 'omit'
    });
    if (response.status === 429) {
      retryAt = Math.max(retryAt, getRetryAt(response.headers.get('Retry-After')));
      await cooldownStorage.set({ [RATE_LIMIT_STORAGE_KEY]: retryAt }).catch(() => undefined);
      throw new TranslationRateLimitError(retryAt);
    }
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getRetryAt(retryAfter: string | null): number {
  const now = Date.now();
  const value = retryAfter?.trim() || '';
  const requestedAt = /^\d+$/.test(value)
    ? now + Number(value) * 1_000
    : Date.parse(value);
  return Number.isFinite(requestedAt) && requestedAt >= now
    ? Math.max(now + 1_000, requestedAt)
    : now + RATE_LIMIT_DELAY_MS;
}

export {};
