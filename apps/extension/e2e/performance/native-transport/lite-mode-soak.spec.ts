/**
 * Long-run native YouTube performance coverage for Lite mode.
 *
 * This deliberately crosses the retained-history boundary at the live edge and
 * while reading older chat. Forced-GC heap samples verify that bounded record,
 * DOM, and action queues translate into a steady-state memory plateau.
 */
import type { BrowserContext, CDPSession, FrameLocator, Page } from '@playwright/test';
import {
  DEFAULT_LITE_CHAT_RENDER_LIMIT,
  DEFAULT_LITE_CHAT_STORE_BYTE_LIMIT,
  DEFAULT_LITE_CHAT_STORE_LIMIT
} from '../../../src/features/lite-mode/store';
import { expect } from '@playwright/test';
import { nativeYouTubePerformanceTest as test } from '../../support/fixtures/youtube-native-performance';
import { withExtensionStorageValues } from '../../support/extension-storage';
import {
  createPerformanceReport,
  delay,
  formatMb,
  formatMs,
  getPositiveIntegerEnv,
  writePerformanceReport
} from '../../support/performance';
import {
  startNativeChatPerfProbe,
  stopNativeChatPerfProbe
} from '../../support/native-performance';
import type { NativeChatTransport } from '../../support/native-chat-transport';
import { toggleLiteModeFromMenu } from '../../scenarios/lite-mode/menu';

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
  pinnedRecords: number;
  renderedRows: number;
  storeBytes: number;
  storeSize: number;
}

interface LiteAnchorSnapshot {
  messageId: string;
  top: number;
}

test('youtube-native performance: Lite mode heap plateaus across 11,000+ messages', async ({
  nativePerformanceSession
}, testInfo) => {
  test.setTimeout(120_000);
  const { context, openChat, page, transport } = nativePerformanceSession;

  await withExtensionStorageValues(
    context,
    'sync',
    {
      liteModeEnabled: false,
      targetLanguage: ''
    },
    async () => {
      const chat = await openChat();
      await toggleLiteModeFromMenu(chat);
      await expect(chat.locator(LITE_ROOT_SELECTOR)).toBeVisible();

      const cdp = await createHeapSession(context, page);
      const ingressStartedAt = performance.now();
      await deliverLiteMessages(transport, 0, WARMUP_MESSAGES);
      await waitForLiteBacklogToDrain(chat);
      const warmHeapMb = await collectHeapMb(cdp);

      await startNativeChatPerfProbe(chat);
      await deliverLiteMessages(transport, WARMUP_MESSAGES, LIVE_EDGE_MESSAGES);
      await waitForLiteBacklogToDrain(chat);
      const liveHeapMb = await collectHeapMb(cdp);
      const liveDiagnostics = await getLiteMemoryDiagnostics(chat);

      const detachedAnchor = await leaveLiteLiveEdge(chat);
      await deliverLiteMessages(
        transport,
        WARMUP_MESSAGES + LIVE_EDGE_MESSAGES,
        SCROLLED_MESSAGES
      );
      await waitForLiteBacklogToDrain(chat);
      const retainedAnchor = await getLiteAnchorSnapshot(chat, detachedAnchor.messageId);
      const detachedAnchorDrift = Math.abs(retainedAnchor.top - detachedAnchor.top);
      const scrolledHeapMb = await collectHeapMb(cdp);
      const scrolledDiagnostics = await getLiteMemoryDiagnostics(chat);
      await pageLiteToPinnedStart(chat);
      await expect(chat.locator(`${LITE_ROOT_SELECTOR} .ytcq-lite-message`).first()).toContainText(
        `Lite soak message ${Math.max(
          0,
          WARMUP_MESSAGES + LIVE_EDGE_MESSAGES - DEFAULT_LITE_CHAT_STORE_LIMIT
        )}`
      );
      await chat.locator(`${LITE_ROOT_SELECTOR} .ytcq-lite-new-messages`).click();
      await expect(chat.locator(LITE_ROOT_SELECTOR)).toHaveAttribute(
        'data-ytcq-following-live-edge',
        'true'
      );
      await expect(chat.locator(`${LITE_ROOT_SELECTOR} .ytcq-lite-message`).last()).toContainText(
        `Lite soak message ${TOTAL_MESSAGES - 1}`
      );
      const probe = await stopNativeChatPerfProbe(chat);
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
            label: 'Detached anchor drift',
            value: `${detachedAnchorDrift.toFixed(2)} px`,
            budget: '<= 1 px'
          },
          {
            label: 'Pinned detached records',
            value: scrolledDiagnostics.pinnedRecords,
            budget: `<= ${DEFAULT_LITE_CHAT_STORE_LIMIT}`
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

      await writePerformanceReport(testInfo, 'youtube-native-lite-mode-soak', report);
      expect(TOTAL_MESSAGES).toBeGreaterThanOrEqual(10_000);
      expect(ingressMs).toBeLessThanOrEqual(BUDGETS.totalIngressMs);
      assertBoundedLiteDiagnostics(liveDiagnostics);
      assertBoundedLiteDiagnostics(scrolledDiagnostics);
      expect(retainedAnchor.messageId).toBe(detachedAnchor.messageId);
      expect(detachedAnchorDrift).toBeLessThanOrEqual(1);
      expect(scrolledDiagnostics.pinnedRecords).toBe(
        Math.min(DEFAULT_LITE_CHAT_STORE_LIMIT, WARMUP_MESSAGES + LIVE_EDGE_MESSAGES)
      );
      expect(liveHeapGrowthMb).toBeLessThanOrEqual(BUDGETS.phaseHeapGrowthMb);
      expect(scrolledHeapGrowthMb).toBeLessThanOrEqual(BUDGETS.phaseHeapGrowthMb);
      expect(totalHeapGrowthMb).toBeLessThanOrEqual(BUDGETS.totalHeapGrowthMb);
      expect(probe.maxLongTaskMs).toBeLessThanOrEqual(BUDGETS.maxLongTaskMs);
      expect(probe.p95FrameGapMs).toBeLessThanOrEqual(BUDGETS.p95FrameGapMs);
    }
  );
});

async function deliverLiteMessages(
  transport: NativeChatTransport,
  startIndex: number,
  count: number
): Promise<void> {
  for (let offset = 0; offset < count; offset += BATCH_SIZE) {
    const batchCount = Math.min(BATCH_SIZE, count - offset);
    const messages = Array.from({ length: batchCount }, (_value, index) =>
      createLiteMessage(startIndex + offset + index)
    );
    await transport.injectMessages(messages);
    await delay(BATCH_INTERVAL_MS);
  }
}

function createLiteMessage(index: number) {
  const authorIndex = index % 240;
  return {
    author: `@LitePerfViewer${authorIndex}`,
    channel: `UCLitePerf${authorIndex}`,
    text: `Lite soak message ${index} from viewer ${authorIndex}`
  };
}

async function waitForLiteBacklogToDrain(chat: FrameLocator): Promise<void> {
  await expect
    .poll(
      async () =>
        chat
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

async function leaveLiteLiveEdge(chat: FrameLocator): Promise<LiteAnchorSnapshot> {
  const scroller = chat.locator(`${LITE_ROOT_SELECTOR} .ytcq-lite-scroller`);
  await scroller.evaluate((element) => {
    element.dispatchEvent(new WheelEvent('wheel', { deltaY: -120 }));
    element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight - 120);
    element.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await expect(chat.locator(LITE_ROOT_SELECTOR)).toHaveAttribute(
    'data-ytcq-following-live-edge',
    'false'
  );
  return getLiteAnchorSnapshot(chat);
}

async function getLiteAnchorSnapshot(
  chat: FrameLocator,
  messageId = ''
): Promise<LiteAnchorSnapshot> {
  return chat.locator(LITE_ROOT_SELECTOR).evaluate((root, expectedMessageId) => {
    const scroller = root.querySelector<HTMLElement>('.ytcq-lite-scroller');
    const rows = Array.from(root.querySelectorAll<HTMLElement>('.ytcq-lite-message'));
    if (!scroller || !rows.length) throw new Error('Lite chat does not expose a readable anchor.');

    const scrollerRect = scroller.getBoundingClientRect();
    const row = expectedMessageId
      ? rows.find((candidate) => candidate.dataset.messageId === expectedMessageId)
      : rows.find((candidate) => candidate.getBoundingClientRect().bottom > scrollerRect.top);
    const resolvedMessageId = row?.dataset.messageId || '';
    if (!row || !resolvedMessageId) throw new Error('Lite chat anchor was not retained.');
    return {
      messageId: resolvedMessageId,
      top: row.getBoundingClientRect().top - scrollerRect.top
    };
  }, messageId);
}

async function pageLiteToPinnedStart(chat: FrameLocator): Promise<void> {
  const scroller = chat.locator(`${LITE_ROOT_SELECTOR} .ytcq-lite-scroller`);
  const pageSize = Math.max(1, Math.floor(DEFAULT_LITE_CHAT_RENDER_LIMIT / 2));
  const pageCount = Math.ceil(
    (DEFAULT_LITE_CHAT_STORE_LIMIT - DEFAULT_LITE_CHAT_RENDER_LIMIT) / pageSize
  );
  for (let page = 0; page < pageCount; page += 1) {
    await scroller.evaluate((element) => {
      element.dispatchEvent(new WheelEvent('wheel', { deltaY: -120 }));
      element.scrollTop = 0;
      element.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await delay(25);
  }
}

async function getLiteMemoryDiagnostics(chat: FrameLocator): Promise<LiteMemoryDiagnostics> {
  return chat.locator(LITE_ROOT_SELECTOR).evaluate((root) => {
    const element = root as HTMLElement;
    return {
      detachedNativeRepopulations: Number(element.dataset.ytcqLiteDetachedNativeRepopulations || 0),
      detachedNativeTracked: Number(element.dataset.ytcqLiteDetachedNativeTracked || 0),
      nativeTickerElements: Number(element.dataset.ytcqLiteNativeTickerElements || 0),
      pendingLiveActionBytes: Number(element.dataset.ytcqLitePendingLiveActionBytes || 0),
      pendingLiveActions: Number(element.dataset.ytcqLitePendingLiveActions || 0),
      pinnedRecords: Number(element.dataset.ytcqLitePinnedRecords || 0),
      renderedRows: element.querySelectorAll('.ytcq-lite-message').length,
      storeBytes: Number(element.dataset.ytcqLiteStoreBytes || 0),
      storeSize: Number(element.dataset.ytcqLiteStoreSize || 0)
    };
  });
}

function assertBoundedLiteDiagnostics(diagnostics: LiteMemoryDiagnostics): void {
  expect(diagnostics.renderedRows).toBeLessThanOrEqual(DEFAULT_LITE_CHAT_RENDER_LIMIT);
  expect(diagnostics.pinnedRecords).toBeLessThanOrEqual(DEFAULT_LITE_CHAT_STORE_LIMIT);
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
