/**
 * Google Translate endpoint mock for E2E tests.
 */
import type { BrowserContext, Request, Route } from '@playwright/test';

export const TRANSLATE_ENDPOINT_PATTERN = /^https:\/\/(?:translate|translate-pa)\.googleapis\.com\/(?:translate_a\/(?:t|single)|v1\/translateHtml)(?:\?|$)/;

export function getTranslationRequestTexts(request: Request): string[] {
  return new URL(request.url()).pathname === '/v1/translateHtml'
    ? (request.postDataJSON() as [[string[], string, string], string])[0][0]
    : new URL(request.url()).searchParams.getAll('q');
}

export async function fulfillTranslationRequest(route: Route, translatedText?: string, sourceLanguage = 'en'): Promise<void> {
  const url = new URL(route.request().url());
  const texts = getTranslationRequestTexts(route.request()).map((text) => {
    if (translatedText === undefined) return text;
    // Fixed mock translations still carry each message's protected emoji/mention tokens.
    const placeholders = text.match(/<span translate="no">\[\d+\]<\/span>|§\d+§/g) || [];
    const missing = placeholders.filter((placeholder) => {
      const canonical = `§${placeholder.match(/\d+/)![0]}§`;
      return !translatedText.includes(placeholder) && !translatedText.includes(canonical);
    });
    return [translatedText, ...missing].join(' ');
  });
  const body = url.pathname === '/v1/translateHtml'
    ? [texts, texts.map(() => sourceLanguage)]
    : url.pathname.endsWith('/t')
      ? texts.map((text) => [text, sourceLanguage])
      : { sentences: [{ trans: texts[0] }], src: sourceLanguage };
  await route.fulfill({ body: JSON.stringify(body), contentType: 'application/json' });
}

/** Deterministic UI fixtures mock Google; individual scenarios can override this route. */
export async function installDefaultTranslationMock(context: BrowserContext): Promise<void> {
  await context.route(TRANSLATE_ENDPOINT_PATTERN, (route) => fulfillTranslationRequest(route));
}

export async function withMockedTranslationEndpoint<T>(
  context: BrowserContext,
  translatedText: string,
  callback: () => Promise<T>,
  sourceLanguage = 'es'
): Promise<T> {
  const handler = (route: Route) => fulfillTranslationRequest(route, translatedText, sourceLanguage);

  await context.route(TRANSLATE_ENDPOINT_PATTERN, handler);
  try {
    return await callback();
  } finally {
    await context.unroute(TRANSLATE_ENDPOINT_PATTERN, handler);
  }
}
