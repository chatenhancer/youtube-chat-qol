/**
 * Long-run mock performance coverage for Lite mode.
 *
 * This deliberately crosses the retained-history boundary at the live edge and
 * while reading older chat. Forced-GC heap samples verify that bounded record,
 * DOM, and action queues translate into a steady-state memory plateau.
 */
import type { BrowserContext, CDPSession, Page } from '@playwright/test';
import {
  YOUTUBE_CHAT_FEED_BATCH_EVENT,
  YOUTUBE_CHAT_FEED_PROTOCOL_VERSION,
  type YouTubeChatFeedAction,
  type YouTubeChatFeedTransportBatch,
  type YouTubeChatMessageRecord
} from '../../../src/youtube/chat-feed/protocol';
import {
  DEFAULT_LITE_CHAT_RENDER_LIMIT,
  DEFAULT_LITE_CHAT_STORE_BYTE_LIMIT,
  DEFAULT_LITE_CHAT_STORE_LIMIT
} from '../../../src/features/lite-mode/store';
import { expect, mockTest as test } from '../support/browser-fixtures';
import { withExtensionStorageValues } from '../support/extension-storage';
import { pauseMockFixtureMessages } from '../support/mock-page';
import {
  createPerformanceReport,
  delay,
  formatMb,
  formatMs,
  getPositiveIntegerEnv,
  reloadMockChatPageForStoredSettings,
  startBrowserPerfProbe,
  stopBrowserPerfProbe,
  writePerformanceReport
} from '../support/mock-perf';

const WARMUP_MESSAGES = getPositiveIntegerEnv('YTCQ_PERF_LITE_WARMUP_MESSAGES', 1_000);
const LIVE_EDGE_MESSAGES = getPositiveIntegerEnv('YTCQ_PERF_LITE_LIVE_MESSAGES', 5_000);
const SCROLLED_MESSAGES = getPositiveIntegerEnv('YTCQ_PERF_LITE_SCROLLED_MESSAGES', 5_000);
const BATCH_SIZE = Math.min(500, getPositiveIntegerEnv('YTCQ_PERF_LITE_BATCH_SIZE', 60));
const BATCH_INTERVAL_MS = getPositiveIntegerEnv('YTCQ_PERF_LITE_BATCH_INTERVAL_MS', 105);
const TOTAL_MESSAGES = WARMUP_MESSAGES + LIVE_EDGE_MESSAGES + SCROLLED_MESSAGES;
const LITE_ROOT_SELECTOR = '.ytcq-lite-root';

const BUDGETS = {
  maxLongTaskMs: 1_000,
  p95FrameGapMs: 350,
  phaseHeapGrowthMb: 48,
  totalHeapGrowthMb: 80,
  totalIngressMs: 60_000
};

interface LiteMemoryDiagnostics {
  detachedNativeRepopulations: number;
  detachedNativeTracked: number;
  nativeTickerElements: number;
  pendingLiveActionBytes: number;
  pendingLiveActions: number;
  renderedRows: number;
  storeBytes: number;
  storeSize: number;
}

test('youtube-mock performance: Lite mode heap plateaus across 11,000+ messages', async ({
  mockLoggedInSession
}, testInfo) => {
  test.setTimeout(120_000);
  const { context, page } = mockLoggedInSession;

  await withExtensionStorageValues(
    context,
    'sync',
    {
      liteModeEnabled: false,
      targetLanguage: ''
    },
    async () => {
      await reloadMockChatPageForStoredSettings(page);
      await pauseMockFixtureMessages(page);
      await installLiteSequenceProbe(page);
      await page.locator('.ytcq-lite-mode-button').click();
      await expect(page.locator(LITE_ROOT_SELECTOR)).toBeVisible();

      const cdp = await createHeapSession(context, page);
      const ingressStartedAt = performance.now();
      await appendLiteMessages(page, 0, WARMUP_MESSAGES);
      await waitForLiteBacklogToDrain(page);
      const warmHeapMb = await collectHeapMb(cdp);

      await startBrowserPerfProbe(page);
      await appendLiteMessages(page, WARMUP_MESSAGES, LIVE_EDGE_MESSAGES);
      await waitForLiteBacklogToDrain(page);
      const liveHeapMb = await collectHeapMb(cdp);
      const liveDiagnostics = await getLiteMemoryDiagnostics(page);

      await leaveLiteLiveEdge(page);
      await appendLiteMessages(page, WARMUP_MESSAGES + LIVE_EDGE_MESSAGES, SCROLLED_MESSAGES);
      await waitForLiteBacklogToDrain(page);
      const scrolledHeapMb = await collectHeapMb(cdp);
      const scrolledDiagnostics = await getLiteMemoryDiagnostics(page);
      const probe = await stopBrowserPerfProbe(page);
      const ingressMs = performance.now() - ingressStartedAt;
      await cdp.detach();

      const liveHeapGrowthMb = liveHeapMb - warmHeapMb;
      const scrolledHeapGrowthMb = scrolledHeapMb - liveHeapMb;
      const totalHeapGrowthMb = scrolledHeapMb - warmHeapMb;
      const report = createPerformanceReport(
        'Lite mode 11,000+ message live-edge and scrolled-up soak',
        [
          { label: 'Warm-up messages', value: WARMUP_MESSAGES },
          { label: 'Live-edge messages', value: LIVE_EDGE_MESSAGES },
          { label: 'Scrolled-up messages', value: SCROLLED_MESSAGES },
          { label: 'Total messages', value: TOTAL_MESSAGES, budget: '>= 10000' },
          {
            label: 'Ingress duration',
            value: formatMs(ingressMs),
            budget: formatMs(BUDGETS.totalIngressMs)
          },
          { label: 'Warm heap', value: formatMb(warmHeapMb) },
          {
            label: 'Live-edge heap growth',
            value: formatMb(liveHeapGrowthMb),
            budget: formatMb(BUDGETS.phaseHeapGrowthMb)
          },
          {
            label: 'Scrolled-up heap growth',
            value: formatMb(scrolledHeapGrowthMb),
            budget: formatMb(BUDGETS.phaseHeapGrowthMb)
          },
          {
            label: 'Total heap growth',
            value: formatMb(totalHeapGrowthMb),
            budget: formatMb(BUDGETS.totalHeapGrowthMb)
          },
          {
            label: 'Live-edge rendered rows',
            value: liveDiagnostics.renderedRows,
            budget: `<= ${DEFAULT_LITE_CHAT_RENDER_LIMIT}`
          },
          {
            label: 'Scrolled rendered rows',
            value: scrolledDiagnostics.renderedRows,
            budget: `<= ${DEFAULT_LITE_CHAT_RENDER_LIMIT}`
          },
          {
            label: 'Retained records',
            value: scrolledDiagnostics.storeSize,
            budget: `<= ${DEFAULT_LITE_CHAT_STORE_LIMIT}`
          },
          {
            label: 'Retained record weight',
            value: formatMb(scrolledDiagnostics.storeBytes / (1024 * 1024)),
            budget: formatMb(DEFAULT_LITE_CHAT_STORE_BYTE_LIMIT / (1024 * 1024))
          },
          {
            label: 'Pending live actions',
            value: scrolledDiagnostics.pendingLiveActions,
            budget: '0'
          },
          {
            label: 'Pending live action weight',
            value: scrolledDiagnostics.pendingLiveActionBytes,
            budget: '0 bytes'
          },
          {
            label: 'Detached native lists tracked',
            value: scrolledDiagnostics.detachedNativeTracked
          },
          {
            label: 'Detached native repopulations',
            value: scrolledDiagnostics.detachedNativeRepopulations
          },
          { label: 'Native ticker elements', value: scrolledDiagnostics.nativeTickerElements },
          { label: 'Long tasks', value: probe.longTaskCount },
          {
            label: 'Max long task',
            value: formatMs(probe.maxLongTaskMs),
            budget: formatMs(BUDGETS.maxLongTaskMs)
          },
          {
            label: 'p95 frame gap',
            value: formatMs(probe.p95FrameGapMs),
            budget: formatMs(BUDGETS.p95FrameGapMs)
          }
        ]
      );

      await writePerformanceReport(testInfo, 'youtube-mock-lite-mode-soak', report);
      expect(TOTAL_MESSAGES).toBeGreaterThanOrEqual(10_000);
      expect(ingressMs).toBeLessThanOrEqual(BUDGETS.totalIngressMs);
      assertBoundedLiteDiagnostics(liveDiagnostics);
      assertBoundedLiteDiagnostics(scrolledDiagnostics);
      expect(liveHeapGrowthMb).toBeLessThanOrEqual(BUDGETS.phaseHeapGrowthMb);
      expect(scrolledHeapGrowthMb).toBeLessThanOrEqual(BUDGETS.phaseHeapGrowthMb);
      expect(totalHeapGrowthMb).toBeLessThanOrEqual(BUDGETS.totalHeapGrowthMb);
      expect(probe.maxLongTaskMs).toBeLessThanOrEqual(BUDGETS.maxLongTaskMs);
      expect(probe.p95FrameGapMs).toBeLessThanOrEqual(BUDGETS.p95FrameGapMs);
    }
  );
});

async function installLiteSequenceProbe(page: Page): Promise<void> {
  await page.evaluate((eventName) => {
    const state = { sequence: 0 };
    (window as typeof window & { __ytcqLitePerfSequence?: typeof state }).__ytcqLitePerfSequence =
      state;
    window.addEventListener(eventName, (event) => {
      if (!(event instanceof CustomEvent) || typeof event.detail !== 'string') return;
      try {
        const batch = JSON.parse(event.detail) as { sequence?: number };
        if (Number.isSafeInteger(batch.sequence)) {
          state.sequence = Math.max(state.sequence, Number(batch.sequence));
        }
      } catch {
        // The production receiver validates malformed details separately.
      }
    });
  }, YOUTUBE_CHAT_FEED_BATCH_EVENT);
}

async function appendLiteMessages(page: Page, startIndex: number, count: number): Promise<void> {
  for (let offset = 0; offset < count; offset += BATCH_SIZE) {
    const batchCount = Math.min(BATCH_SIZE, count - offset);
    const actions = Array.from({ length: batchCount }, (_value, index) => ({
      record: createLiteRecord(startIndex + offset + index),
      type: 'upsert' as const
    }));
    await dispatchLiteBatch(page, actions);
    await delay(BATCH_INTERVAL_MS);
  }
}

async function dispatchLiteBatch(page: Page, actions: YouTubeChatFeedAction[]): Promise<void> {
  await page.evaluate(
    ({ eventName, nextActions, version }) => {
      const state = (
        window as typeof window & {
          __ytcqLitePerfSequence?: { sequence: number };
        }
      ).__ytcqLitePerfSequence;
      if (!state) throw new Error('Lite performance sequence probe is unavailable.');
      const transport = (
        window as unknown as Record<PropertyKey, { sequence?: unknown } | undefined>
      )[Symbol.for('ytcq:lite-chat-transport:v1')];
      const transportSequence = typeof transport?.sequence === 'number' ? transport.sequence : 0;
      const sequence = Math.max(state.sequence, transportSequence) + 1;
      if (transport) transport.sequence = sequence;
      const batch: YouTubeChatFeedTransportBatch = {
        actions: nextActions,
        continuationTimeoutMs: 1,
        receivedAt: Date.now(),
        sequence,
        source: 'live',
        version
      };
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: JSON.stringify(batch)
        })
      );
    },
    {
      eventName: YOUTUBE_CHAT_FEED_BATCH_EVENT,
      nextActions: actions,
      version: YOUTUBE_CHAT_FEED_PROTOCOL_VERSION
    }
  );
}

function createLiteRecord(index: number): YouTubeChatMessageRecord {
  const authorIndex = index % 240;
  const text = `Lite soak message ${index} from viewer ${authorIndex} with emoji :wave:`;
  return {
    author: {
      avatarUrl: 'https://www.youtube.com/favicon.ico',
      badges: index % 19 === 0 ? [{ label: 'Member' }] : [],
      channelId: `UCLitePerf${authorIndex}`,
      name: `@LitePerfViewer${authorIndex}`
    },
    id: `lite-perf-${index}`,
    kind: 'text',
    plainText: text,
    runs: [
      { text: `${text.slice(0, -6)} `, type: 'text' },
      {
        alt: ':wave:',
        emojiId: 'wave-emoji',
        imageUrl: 'https://www.youtube.com/favicon.ico',
        shortcuts: [':wave:'],
        type: 'emoji'
      }
    ],
    timestampText: '10:30 PM',
    timestampUsec: String(1_782_000_000_000_000 + index)
  };
}

async function waitForLiteBacklogToDrain(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        page
          .locator(LITE_ROOT_SELECTOR)
          .evaluate((root) =>
            Number((root as HTMLElement).dataset.ytcqLitePendingLiveActions || 0)
          ),
      {
        message: 'Lite live action backlog should drain completely.',
        timeout: 20_000
      }
    )
    .toBe(0);
}

async function leaveLiteLiveEdge(page: Page): Promise<void> {
  const scroller = page.locator(`${LITE_ROOT_SELECTOR} .ytcq-lite-scroller`);
  await scroller.evaluate((element) => {
    element.dispatchEvent(new WheelEvent('wheel', { deltaY: -120 }));
    element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight - 120);
    element.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await expect(page.locator(LITE_ROOT_SELECTOR)).toHaveAttribute(
    'data-ytcq-following-live-edge',
    'false'
  );
}

async function getLiteMemoryDiagnostics(page: Page): Promise<LiteMemoryDiagnostics> {
  return page.locator(LITE_ROOT_SELECTOR).evaluate((root) => {
    const element = root as HTMLElement;
    return {
      detachedNativeRepopulations: Number(element.dataset.ytcqLiteDetachedNativeRepopulations || 0),
      detachedNativeTracked: Number(element.dataset.ytcqLiteDetachedNativeTracked || 0),
      nativeTickerElements: Number(element.dataset.ytcqLiteNativeTickerElements || 0),
      pendingLiveActionBytes: Number(element.dataset.ytcqLitePendingLiveActionBytes || 0),
      pendingLiveActions: Number(element.dataset.ytcqLitePendingLiveActions || 0),
      renderedRows: element.querySelectorAll('.ytcq-lite-message').length,
      storeBytes: Number(element.dataset.ytcqLiteStoreBytes || 0),
      storeSize: Number(element.dataset.ytcqLiteStoreSize || 0)
    };
  });
}

function assertBoundedLiteDiagnostics(diagnostics: LiteMemoryDiagnostics): void {
  expect(diagnostics.renderedRows).toBeLessThanOrEqual(DEFAULT_LITE_CHAT_RENDER_LIMIT);
  expect(diagnostics.storeSize).toBeLessThanOrEqual(DEFAULT_LITE_CHAT_STORE_LIMIT);
  expect(diagnostics.storeBytes).toBeLessThanOrEqual(DEFAULT_LITE_CHAT_STORE_BYTE_LIMIT);
  expect(diagnostics.pendingLiveActions).toBe(0);
  expect(diagnostics.pendingLiveActionBytes).toBe(0);
}

async function createHeapSession(context: BrowserContext, page: Page): Promise<CDPSession> {
  const session = await context.newCDPSession(page);
  await session.send('HeapProfiler.enable');
  return session;
}

async function collectHeapMb(session: CDPSession): Promise<number> {
  await session.send('HeapProfiler.collectGarbage');
  const usage = (await session.send('Runtime.getHeapUsage')) as { usedSize: number };
  return usage.usedSize / (1024 * 1024);
}
