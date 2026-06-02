/**
 * Mock performance coverage for outgoing draft translation.
 *
 * Composer translation is debounce-driven. This test simulates quick typing so
 * a regression that sends one translation request per input event is caught.
 */
import { expect, mockTest as test } from '../support/browser-fixtures';
import {
  clearChatComposer,
  getChatComposerText
} from '../support/composer';
import { withExtensionStorageValues } from '../support/extension-storage';
import type { Page } from '@playwright/test';
import {
  createPerformanceReport,
  formatMs,
  getPositiveIntegerEnv,
  startBrowserPerfProbe,
  stopBrowserPerfProbe,
  withMockedPerformanceTranslationEndpoint,
  writePerformanceReport,
  type BrowserPerfProbeSnapshot
} from '../support/mock-perf';

const INPUT_EVENT_COUNT = getPositiveIntegerEnv('YTCQ_PERF_COMPOSER_INPUT_EVENTS', 36);
const INPUT_EVENT_DELAY_MS = 18;
const SOURCE_DRAFT = 'hello @DraftTarget this is a longer composer draft with emoji ✅ and more words';
const TRANSLATED_DRAFT = 'borrador traducido §0§ §1§';
const EXPECTED_TRANSLATED_DRAFT = 'borrador traducido @DraftTarget ✅';

const BUDGETS = {
  maxLongTaskMs: 750,
  maxTranslationRequests: 2,
  p95FrameGapMs: 250,
  translationMs: 4_000,
  typingMs: 1_500
};

test('youtube-mock performance: composer translation debounce limits request churn', async ({
  mockLoggedInSession
}, testInfo) => {
  const { context, page } = mockLoggedInSession;

  await withMockedPerformanceTranslationEndpoint(context, {
    delayMs: 15,
    translatedText: TRANSLATED_DRAFT
  }, async (translationStats) => {
    await withExtensionStorageValues(context, 'sync', {
      composerTranslateLanguage: 'es',
      sound: false
    }, async () => {
      await expect(page.locator('.ytcq-composer-translate-button')).toBeVisible({ timeout: 15_000 });
      await clearChatComposer(page);
      await startBrowserPerfProbe(page);
      const typingMs = await typeDraftRapidly(page);
      const translationMs = await waitForComposerTranslation(page);
      const probe = await stopBrowserPerfProbe(page);

      const report = createPerformanceReport(
        'youtube-mock composer translation debounce',
        [
          { label: 'Input events', value: INPUT_EVENT_COUNT },
          { label: 'Typing burst', value: formatMs(typingMs), budget: formatMs(BUDGETS.typingMs) },
          { label: 'Translation wait', value: formatMs(translationMs), budget: formatMs(BUDGETS.translationMs) },
          { label: 'Translation requests', value: translationStats.requestCount, budget: `<= ${BUDGETS.maxTranslationRequests}` },
          { label: 'Long tasks', value: probe.longTaskCount },
          { label: 'Max long task', value: formatMs(probe.maxLongTaskMs), budget: formatMs(BUDGETS.maxLongTaskMs) },
          { label: 'p95 frame gap', value: formatMs(probe.p95FrameGapMs), budget: formatMs(BUDGETS.p95FrameGapMs) },
          { label: 'Max frame gap', value: formatMs(probe.maxFrameGapMs) }
        ]
      );

      await writePerformanceReport(testInfo, 'youtube-mock-composer-translation', report);
      assertPerformanceBudgets({
        probe,
        requestCount: translationStats.requestCount,
        translationMs,
        typingMs
      });
      await clearChatComposer(page);
    });
  });
});

async function typeDraftRapidly(page: Page): Promise<number> {
  const startedAt = performance.now();
  await page.evaluate(async ({ delayMs, eventCount, sourceDraft }) => {
    const input = document.querySelector<HTMLElement>('yt-live-chat-message-input-renderer #input[contenteditable]');
    if (!input) throw new Error('Mock chat composer input was not found.');

    for (let index = 1; index <= eventCount; index += 1) {
      const nextLength = Math.ceil((sourceDraft.length * index) / eventCount);
      input.replaceChildren(document.createTextNode(sourceDraft.slice(0, nextLength)));
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        data: sourceDraft.slice(0, nextLength),
        inputType: 'insertText'
      }));
      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }
  }, {
    delayMs: INPUT_EVENT_DELAY_MS,
    eventCount: INPUT_EVENT_COUNT,
    sourceDraft: SOURCE_DRAFT
  });

  return performance.now() - startedAt;
}

async function waitForComposerTranslation(page: Page): Promise<number> {
  const startedAt = performance.now();
  await expect.poll(async () => getChatComposerText(page), {
    message: 'Composer translation should replace the final draft.',
    timeout: BUDGETS.translationMs
  }).toContain(EXPECTED_TRANSLATED_DRAFT);
  return performance.now() - startedAt;
}

function assertPerformanceBudgets({
  probe,
  requestCount,
  translationMs,
  typingMs
}: {
  probe: BrowserPerfProbeSnapshot;
  requestCount: number;
  translationMs: number;
  typingMs: number;
}): void {
  expect.soft(typingMs, 'Rapid composer typing should stay within the typing budget.')
    .toBeLessThanOrEqual(BUDGETS.typingMs);
  expect.soft(translationMs, 'Composer translation should appear within the debounce budget.')
    .toBeLessThanOrEqual(BUDGETS.translationMs);
  expect.soft(requestCount, 'Composer translation should debounce rapid input events.')
    .toBeLessThanOrEqual(BUDGETS.maxTranslationRequests);
  expect.soft(probe.maxLongTaskMs, 'Composer translation should not create a catastrophic long task.')
    .toBeLessThanOrEqual(BUDGETS.maxLongTaskMs);
  expect.soft(probe.p95FrameGapMs, 'Composer translation should keep the page painting.')
    .toBeLessThanOrEqual(BUDGETS.p95FrameGapMs);
}
