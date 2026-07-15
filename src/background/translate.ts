/**
 * Background translation bridge.
 *
 * Content scripts send translation jobs here so the service worker can call the
 * remote endpoint, apply a timeout, and return only the translated text plus
 * detected source language.
 */
const TRANSLATE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const TRANSLATE_BATCH_ENDPOINT = 'https://translate.googleapis.com/translate_a/t';
const REQUEST_TIMEOUT_MS = 8000;
const MAX_BATCH_URL_BYTES = 8000;
const MAX_BATCH_TEXTS = 50;

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
        error: error instanceof Error ? error.message : String(error)
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
  const cleanText = String(text || '').trim();
  const target = String(targetLanguage || 'en').trim();

  if (!cleanText || !target) {
    return { ok: false, error: 'Missing text or target language.' };
  }

  const url = new URL(TRANSLATE_ENDPOINT);
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'auto');
  url.searchParams.set('tl', target);
  url.searchParams.set('dt', 't');
  url.searchParams.set('dj', '1');
  url.searchParams.set('q', cleanText);

  const response = await fetchWithTimeout(url.toString());
  if (!response.ok) {
    throw new Error(`Translate request failed with ${response.status}`);
  }

  const payload = await response.json() as {
    sentences?: { trans?: string }[];
    src?: string;
  };
  const translatedText = Array.isArray(payload.sentences)
    ? payload.sentences.map((sentence) => sentence.trans || '').join('')
    : '';

  return {
    ok: true,
    translatedText: translatedText || cleanText,
    sourceLanguage: payload.src || ''
  };
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
    if (chunk.length === 1 && getBatchUrlByteLength(chunk, target) > MAX_BATCH_URL_BYTES) {
      results.push(await translateSingleTextForBatch(chunk[0], target));
      continue;
    }

    try {
      results.push(...await translateTextChunk(chunk, target));
    } catch {
      for (const text of chunk) {
        results.push(await translateSingleTextForBatch(text, target));
      }
    }
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
      (nextChunk.length > MAX_BATCH_TEXTS || getBatchUrlByteLength(nextChunk, targetLanguage) > MAX_BATCH_URL_BYTES)
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

async function translateTextChunk(texts: string[], targetLanguage: string): Promise<BatchTranslationResult[]> {
  const response = await fetchWithTimeout(createBatchUrl(texts, targetLanguage).toString());

  if (!response.ok) {
    throw new Error(`Translate batch request failed with ${response.status}`);
  }

  const payload = await response.json() as unknown;
  if (!Array.isArray(payload) || payload.length !== texts.length) {
    throw new Error('Translate batch response did not match the request.');
  }

  return payload.map((entry, index) => parseBatchTranslationEntry(entry, texts[index]));
}

function parseBatchTranslationEntry(entry: unknown, sourceText: string): BatchTranslationResult {
  if (typeof entry === 'string') {
    return {
      translatedText: entry || sourceText,
      sourceLanguage: ''
    };
  }

  if (Array.isArray(entry) && typeof entry[0] === 'string') {
    return {
      translatedText: entry[0] || sourceText,
      sourceLanguage: typeof entry[1] === 'string' ? entry[1] : ''
    };
  }

  throw new Error('Translate batch response entry was not readable.');
}

async function translateSingleTextForBatch(text: string, targetLanguage: string): Promise<BatchTranslationResult> {
  const result = await translateText(text, targetLanguage);
  if (!result.ok) throw new Error(result.error || 'Translate request failed.');
  return {
    translatedText: result.translatedText || text,
    sourceLanguage: result.sourceLanguage || ''
  };
}

function createBatchUrl(texts: string[], targetLanguage: string): URL {
  const url = new URL(TRANSLATE_BATCH_ENDPOINT);
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'auto');
  url.searchParams.set('tl', targetLanguage);
  texts.forEach((text) => url.searchParams.append('q', text));
  return url;
}

function getBatchUrlByteLength(texts: string[], targetLanguage: string): number {
  return new TextEncoder().encode(createBatchUrl(texts, targetLanguage).toString()).length;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      signal: controller.signal,
      credentials: 'omit'
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export {};
