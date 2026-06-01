/**
 * Background translation bridge.
 *
 * Content scripts send translation jobs here so the service worker can call the
 * remote endpoint, apply a timeout, and return only the translated text plus
 * detected source language.
 */
const TRANSLATE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const REQUEST_TIMEOUT_MS = 8000;

interface TranslateMessage {
  type?: string;
  text?: string;
  targetLanguage?: string;
}

chrome.runtime.onMessage.addListener((message: TranslateMessage, _sender, sendResponse) => {
  if (!message || message.type !== 'ytcq:translate') {
    return false;
  }

  translateText(message.text, message.targetLanguage)
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});

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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      credentials: 'omit'
    });

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
  } finally {
    clearTimeout(timeoutId);
  }
}

export {};
