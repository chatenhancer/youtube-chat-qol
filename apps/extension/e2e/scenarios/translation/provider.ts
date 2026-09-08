/** External translation-provider contract exercised through the built extension. */
import { expect, test, type BrowserContext, type Request } from '@playwright/test';
import { getExtensionId } from '../../support/extension';
import type { ExtensionScenario } from '../types';

const SOURCE_TEXTS = ['good morning', 'thank you', 'Thanks §0§ for watching. See you tomorrow.', '你是個好人'];
const TARGET_LANGUAGE = 'ja';
const TRANSLATION_PATTERN = /[\u3040-\u30ff]/u;

interface BatchTranslationResponse {
  error?: string;
  ok: boolean;
  results?: Array<{
    sourceLanguage: string;
    translatedText: string;
  }>;
}

export const realBatchTranslationProviderScenario: ExtensionScenario = async ({ context }) => {
  await test.step('Translate a fixed batch through real Google Translate', async () => {
    const requestedPaths: string[] = [];
    const captureRequest = (request: Request) => {
      const url = new URL(request.url());
      if (url.hostname === 'translate-pa.googleapis.com' || url.hostname === 'translate.googleapis.com') {
        requestedPaths.push(url.pathname);
      }
    };
    context.on('request', captureRequest);
    let response: BatchTranslationResponse;
    try {
      response = await requestRealBatchTranslation(context);
    } finally {
      context.off('request', captureRequest);
    }

    expect(response.ok, response.error || 'Real batch translation should succeed.').toBe(true);
    expect(response.results).toHaveLength(SOURCE_TEXTS.length);
    for (const [index, result] of (response.results || []).entries()) {
      expect(result.translatedText).toMatch(TRANSLATION_PATTERN);
      expect(result.translatedText).not.toBe(SOURCE_TEXTS[index]);
    }
    expect(response.results?.[2].translatedText).toContain('§0§');
    expect([...new Set(requestedPaths)]).toEqual(['/v1/translateHtml']);
  });
};

async function requestRealBatchTranslation(
  context: BrowserContext
): Promise<BatchTranslationResponse> {
  const extensionId = await getExtensionId(context);
  const popup = await context.newPage();

  try {
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    expect(await popup.evaluate(() => chrome.permissions.contains({
      origins: ['https://translate-pa.googleapis.com/*']
    })), 'The HTML provider must work through CORS without a host permission.').toBe(false);
    return await popup.evaluate(
      (request) =>
        new Promise<BatchTranslationResponse>((resolve) => {
          chrome.runtime.sendMessage(request, (response: BatchTranslationResponse | undefined) => {
            const error = chrome.runtime.lastError;
            if (error) {
              resolve({ ok: false, error: error.message });
              return;
            }
            resolve(
              response || { ok: false, error: 'The translation worker returned no response.' }
            );
          });
        }),
      {
        type: 'ytcq:translateBatch',
        texts: SOURCE_TEXTS,
        targetLanguage: TARGET_LANGUAGE
      }
    );
  } finally {
    await popup.close().catch(() => undefined);
  }
}
