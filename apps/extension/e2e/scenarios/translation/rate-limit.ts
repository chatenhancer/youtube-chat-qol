/** Exercise Google's HTTP failure through the built extension and both chat surfaces. */
import { expect, test, type Route } from '@playwright/test';
import { clearChatComposer, getChatComposerText, setChatComposerText } from '../../support/composer';
import { requireControlledChat } from '../../support/controlled-chat';
import { withExtensionStorageValues } from '../../support/extension-storage';
import type { BrowserScenario } from '../types';

const ENDPOINT = 'https://translate.googleapis.com/translate_a/*';
const JAPANESE_TEXT = '配信ありがとうございます';

export const rateLimitedTranslationScenario: BrowserScenario = async ({ chat, context, page, controlledChat }) => {
  const requests: Array<{ path: string; at: number }> = [];
  let rateLimited = true;
  const handleRequest = async (route: Route) => {
    const url = new URL(route.request().url());
    requests.push({ path: url.pathname, at: Date.now() });
    if (rateLimited) {
      await route.fulfill({ status: 429, headers: { 'Retry-After': '5' }, body: 'Too many requests' });
      return;
    }
    const body = url.pathname.endsWith('/t')
      ? url.searchParams.getAll('q').map(() => [JAPANESE_TEXT, 'en'])
      : { sentences: [{ trans: JAPANESE_TEXT }], src: 'en' };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  };
  await context.route(ENDPOINT, handleRequest);
  try {
    const messageId = await requireControlledChat(controlledChat).injectMessage({
      author: '@TranslationViewer', text: 'Thank you for the stream'
    });
    await withExtensionStorageValues(context, 'sync', {
      targetLanguage: 'ja', composerTranslateLanguage: 'ja', translationDisplay: 'below'
    }, async () => {
      const message = chat.locator(`#${messageId}`);
      await test.step('Explain the rate limit and preserve the original message', async () => {
        await expect(chat.locator('.ytcq-toast')).toHaveText(
          'Google Translate is temporarily limiting requests. Translation is paused. Please wait a moment.'
        );
        await expect(message.locator('#message').first()).toHaveText('Thank you for the stream');
        expect(requests.length).toBeGreaterThan(0);
        expect(requests.every((request) => request.path === '/translate_a/t')).toBe(true);
      });

      try {
        await test.step('Share the pause with the composer without making more provider requests', async () => {
          const requestCount = requests.length;
          await setChatComposerText(chat, 'Good morning');
          // Observe beyond the composer debounce to catch an early outbound retry.
          await page.waitForTimeout(1_200);
          expect(requests).toHaveLength(requestCount);
          expect(await getChatComposerText(chat)).toBe('Good morning');
          await expect(message.locator('.ytcq-translation')).toHaveCount(0);
          await setChatComposerText(chat, 'Thank you');
        });

        await test.step('Resume chat and translate the latest draft when the cooldown ends', async () => {
          const pausedRequestCount = requests.length;
          const earliestRetry = requests[0].at + 5_000;
          rateLimited = false;
          await expect(message.locator('.ytcq-translation')).toContainText(JAPANESE_TEXT);
          await expect.poll(() => getChatComposerText(chat)).toBe(JAPANESE_TEXT);
          const recoveredRequests = requests.slice(pausedRequestCount);
          expect(recoveredRequests.some((request) => request.path === '/translate_a/t')).toBe(true);
          expect(recoveredRequests.some((request) => request.path === '/translate_a/single')).toBe(true);
          expect(recoveredRequests.every((request) => request.at >= earliestRetry)).toBe(true);
        });
      } finally {
        await clearChatComposer(chat);
      }
    });
  } finally {
    await context.unroute(ENDPOINT, handleRequest);
  }
};
