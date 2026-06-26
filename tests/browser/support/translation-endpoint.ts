/**
 * Google Translate endpoint mock for browser tests.
 */
import type { BrowserContext, Route } from '@playwright/test';

const TRANSLATE_ENDPOINT_PATTERN = 'https://translate.googleapis.com/translate_a/*';

export async function withMockedTranslationEndpoint<T>(
  context: BrowserContext,
  translatedText: string,
  callback: () => Promise<T>,
  sourceLanguage = 'es'
): Promise<T> {
  const handler = async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/t')) {
      const queryCount = url.searchParams.getAll('q').length;
      await route.fulfill({
        body: JSON.stringify(Array.from({ length: queryCount }, () => [translatedText, sourceLanguage])),
        contentType: 'application/json'
      });
      return;
    }

    await route.fulfill({
      body: JSON.stringify({
        sentences: [{ trans: translatedText }],
        src: sourceLanguage
      }),
      contentType: 'application/json'
    });
  };

  await context.route(TRANSLATE_ENDPOINT_PATTERN, handler);
  try {
    return await callback();
  } finally {
    await context.unroute(TRANSLATE_ENDPOINT_PATTERN, handler);
  }
}
