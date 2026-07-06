/**
 * Manual live performance coverage for real YouTube chat DOM weight.
 *
 * This benchmark opens a real YouTube chat iframe, clones existing renderer
 * shapes, and appends synthetic local messages inside the iframe. It never
 * sends YouTube chat messages, but it exercises the extension against real
 * YouTube renderer markup instead of the minimal mock fixture.
 */
import type { FrameLocator, Page } from '@playwright/test';
import { expect, liveTest as test } from '../support/browser-fixtures';
import { withExtensionStorageValues } from '../support/extension-storage';
import {
  createPerformanceReport,
  delay,
  formatMb,
  formatMs,
  formatNullableMb,
  getHeapGrowthMb,
  getPositiveIntegerEnv,
  withMockedPerformanceTranslationEndpoint,
  writePerformanceReport,
  type BrowserPerfProbeSnapshot,
  type HeapSnapshot
} from '../support/mock-perf';

const MESSAGE_WAVES = getPositiveIntegerEnv('YTCQ_PERF_LIVE_HYBRID_WAVES', 8);
const MESSAGES_PER_WAVE = getPositiveIntegerEnv('YTCQ_PERF_LIVE_HYBRID_WAVE_SIZE', 45);
const WAVE_INTERVAL_MS = getPositiveIntegerEnv('YTCQ_PERF_LIVE_HYBRID_WAVE_INTERVAL_MS', 140);
const TOTAL_MESSAGE_COUNT = MESSAGE_WAVES * MESSAGES_PER_WAVE;
const TARGET_LANGUAGE = 'cy';
const TRANSLATION_RESPONSE_DELAY_MS = 12;
const HYBRID_MESSAGE_SELECTOR = '[data-ytcq-hybrid-stress="true"]';
const SOURCE_MESSAGE_SELECTOR = [
  'yt-live-chat-text-message-renderer:not([in-banner]):not([in-collapsed-banner])',
  'yt-live-chat-paid-message-renderer',
  'yt-live-chat-membership-item-renderer'
].join(',');
const WATCHED_KEYWORDS = Array.from({ length: 30 }, (_, index) => `hybridword${index}`);
const EXPECTED_INBOX_BADGE = TOTAL_MESSAGE_COUNT >= 100 ? '99+' : String(TOTAL_MESSAGE_COUNT);

const BUDGETS = {
  heapGrowthMb: 180,
  inboxBadgeMs: 10_000,
  maxLongTaskMs: 1_500,
  maxWaveAppendMs: 1_800,
  p95FrameGapMs: 650,
  totalIngressMs: Math.max(12_000, MESSAGE_WAVES * (WAVE_INTERVAL_MS + 900)),
  translationDrainMs: 25_000
};

interface HybridMessage {
  author: string;
  channel: string;
  index: number;
  keyword: string;
}

interface HybridAppendStats {
  appendedIds: string[];
  averageElementCount: number;
  durationMs: number;
  maxElementCount: number;
  sourceRendererTypes: Record<string, number>;
}

interface HybridIngressStats {
  appendedIds: string[];
  averageElementCount: number;
  durationMs: number;
  maxElementCount: number;
  maxWaveAppendMs: number;
  messagesPerSecond: number;
  p95WaveAppendMs: number;
  sourceRendererTypes: Record<string, number>;
}

test('youtube-live performance: hybrid real-DOM busy stream stays responsive', async ({
  liveLoggedOutSession
}, testInfo) => {
  const { context, page } = liveLoggedOutSession;

  await withMockedPerformanceTranslationEndpoint(context, {
    delayMs: TRANSLATION_RESPONSE_DELAY_MS,
    translatedText: 'YTCQ hybrid live DOM translation'
  }, async (translationStats) => {
    await withExtensionStorageValues(context, 'sync', {
      lastTranslationTarget: TARGET_LANGUAGE,
      sound: false,
      targetLanguage: TARGET_LANGUAGE,
      translationDisplay: 'below'
    }, async () => {
      await withExtensionStorageValues(context, 'local', {
        ytcqInboxKeywords: WATCHED_KEYWORDS
      }, async () => {
        const chat = await reloadLiveChatForStoredSettings(page);
        const sourceCount = await waitForRealSourceMessages(chat);
        test.skip(sourceCount === 0, 'Live YouTube chat did not expose cloneable message renderers.');

        await waitForContentOptionsToPropagate(chat);
        await startChatPerfProbe(chat);
        const heapBefore = await getChatHeapSnapshot(chat);

        try {
          const ingress = await appendHybridRealDomStream(chat);
          const translationDrainMs = await waitForHybridTranslations(chat);
          const inboxBadgeMs = await waitForInboxBadge(chat);
          const visibleTranslationCount = await chat
            .locator(`${HYBRID_MESSAGE_SELECTOR} .ytcq-translation[lang="${TARGET_LANGUAGE}"]`)
            .count();
          const visibleKeywordHighlightCount = await chat
            .locator(`${HYBRID_MESSAGE_SELECTOR} .ytcq-chat-keyword-highlight`)
            .count();
          const inboxBadgeText = await chat.locator('.ytcq-inbox-badge').innerText();
          const heapAfter = await getChatHeapSnapshot(chat);
          const probe = await stopChatPerfProbe(chat);
          const heapGrowthMb = getHeapGrowthMb(heapBefore, heapAfter);

          const report = createPerformanceReport(
            'youtube-live hybrid real-DOM busy stream with translation and watched keywords',
            [
              { label: 'Live source messages', value: sourceCount },
              { label: 'Message waves', value: MESSAGE_WAVES },
              { label: 'Messages per wave', value: MESSAGES_PER_WAVE },
              { label: 'Messages appended', value: ingress.appendedIds.length, budget: String(TOTAL_MESSAGE_COUNT) },
              { label: 'Wave interval', value: formatMs(WAVE_INTERVAL_MS) },
              { label: 'Ingress duration', value: formatMs(ingress.durationMs), budget: formatMs(BUDGETS.totalIngressMs) },
              { label: 'Ingress rate', value: formatRate(ingress.messagesPerSecond) },
              { label: 'p95 wave append', value: formatMs(ingress.p95WaveAppendMs) },
              { label: 'Max wave append', value: formatMs(ingress.maxWaveAppendMs), budget: formatMs(BUDGETS.maxWaveAppendMs) },
              { label: 'Average cloned elements/message', value: ingress.averageElementCount.toFixed(1) },
              { label: 'Max cloned elements/message', value: ingress.maxElementCount },
              { label: 'Source renderer types', value: formatRendererTypes(ingress.sourceRendererTypes) },
              { label: 'Translation drain', value: formatMs(translationDrainMs), budget: formatMs(BUDGETS.translationDrainMs) },
              { label: 'Inbox badge wait', value: formatMs(inboxBadgeMs), budget: formatMs(BUDGETS.inboxBadgeMs) },
              { label: 'Translation requests', value: translationStats.requestCount },
              { label: 'Translation items', value: translationStats.translatedItemCount, budget: `>= ${TOTAL_MESSAGE_COUNT}` },
              { label: 'Rendered translations', value: visibleTranslationCount, budget: `>= ${TOTAL_MESSAGE_COUNT}` },
              { label: 'Keyword highlights', value: visibleKeywordHighlightCount, budget: `>= ${TOTAL_MESSAGE_COUNT}` },
              { label: 'Inbox badge', value: inboxBadgeText, budget: EXPECTED_INBOX_BADGE },
              { label: 'Long tasks', value: probe.longTaskCount },
              { label: 'Max long task', value: formatMs(probe.maxLongTaskMs), budget: formatMs(BUDGETS.maxLongTaskMs) },
              { label: 'p95 frame gap', value: formatMs(probe.p95FrameGapMs), budget: formatMs(BUDGETS.p95FrameGapMs) },
              { label: 'Max frame gap', value: formatMs(probe.maxFrameGapMs) },
              { label: 'Heap growth', value: formatNullableMb(heapGrowthMb), budget: formatMb(BUDGETS.heapGrowthMb) }
            ]
          );

          await writePerformanceReport(testInfo, 'youtube-live-hybrid-real-dom', report);
          assertPerformanceBudgets({
            heapGrowthMb,
            inboxBadgeMs,
            inboxBadgeText,
            ingress,
            probe,
            translatedItemCount: translationStats.translatedItemCount,
            translationDrainMs,
            visibleKeywordHighlightCount,
            visibleTranslationCount
          });
        } finally {
          await removeHybridMessages(chat);
        }
      });
    });
  });
});

async function reloadLiveChatForStoredSettings(page: Page): Promise<FrameLocator> {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(page.locator('iframe#chatframe')).toBeVisible({ timeout: 60_000 });
  const chat = page.frameLocator('iframe#chatframe');
  await expect(chat.locator('yt-live-chat-renderer')).toBeVisible({ timeout: 30_000 });
  await expect(chat.locator('.ytcq-inbox-button')).toBeVisible({ timeout: 30_000 });
  return chat;
}

async function waitForRealSourceMessages(chat: FrameLocator): Promise<number> {
  await chat.locator(SOURCE_MESSAGE_SELECTOR).first()
    .waitFor({ state: 'attached', timeout: 45_000 })
    .catch(() => undefined);
  return chat.locator(SOURCE_MESSAGE_SELECTOR).count();
}

async function waitForContentOptionsToPropagate(chat: FrameLocator): Promise<void> {
  await chat.locator('body').evaluate(() => new Promise((resolve) => {
    window.setTimeout(resolve, 350);
  }));
}

async function appendHybridRealDomStream(chat: FrameLocator): Promise<HybridIngressStats> {
  const startedAt = performance.now();
  const appendedIds: string[] = [];
  const sourceRendererTypes: Record<string, number> = {};
  const waveDurationsMs: number[] = [];
  let totalElementCount = 0;
  let maxElementCount = 0;

  for (let waveIndex = 0; waveIndex < MESSAGE_WAVES; waveIndex += 1) {
    const messages = createHybridMessages(waveIndex);
    const wave = await appendHybridRealDomWave(chat, messages);
    appendedIds.push(...wave.appendedIds);
    waveDurationsMs.push(wave.durationMs);
    totalElementCount += wave.averageElementCount * wave.appendedIds.length;
    maxElementCount = Math.max(maxElementCount, wave.maxElementCount);
    for (const [type, count] of Object.entries(wave.sourceRendererTypes)) {
      sourceRendererTypes[type] = (sourceRendererTypes[type] || 0) + count;
    }
    if (waveIndex < MESSAGE_WAVES - 1) await delay(WAVE_INTERVAL_MS);
  }

  const durationMs = performance.now() - startedAt;
  return {
    appendedIds,
    averageElementCount: totalElementCount / Math.max(appendedIds.length, 1),
    durationMs,
    maxElementCount,
    maxWaveAppendMs: Math.max(...waveDurationsMs),
    messagesPerSecond: appendedIds.length / Math.max(durationMs / 1_000, 0.001),
    p95WaveAppendMs: getPercentile(waveDurationsMs, 95),
    sourceRendererTypes
  };
}

function createHybridMessages(waveIndex: number): HybridMessage[] {
  return Array.from({ length: MESSAGES_PER_WAVE }, (_, waveOffset) => {
    const index = waveIndex * MESSAGES_PER_WAVE + waveOffset;
    return {
      author: `@HybridViewer${String(index % 90).padStart(2, '0')}`,
      channel: `UCHybridPerf${String(index % 90).padStart(2, '0')}`,
      index,
      keyword: WATCHED_KEYWORDS[index % WATCHED_KEYWORDS.length]
    };
  });
}

async function appendHybridRealDomWave(
  chat: FrameLocator,
  messages: HybridMessage[]
): Promise<HybridAppendStats> {
  const startedAt = performance.now();
  const result = await chat.locator('body').evaluate((body, nextMessages) => {
    const messageSelector = [
      'yt-live-chat-text-message-renderer:not([in-banner]):not([in-collapsed-banner])',
      'yt-live-chat-paid-message-renderer',
      'yt-live-chat-membership-item-renderer'
    ].join(',');
    const items = document.querySelector('yt-live-chat-item-list-renderer #items') ||
      document.querySelector('yt-live-chat-item-list-renderer');
    const scroller = document.querySelector('#item-scroller');
    const sources = Array.from(document.querySelectorAll<HTMLElement>(messageSelector))
      .filter((element) => !element.matches('[data-ytcq-hybrid-stress="true"]') && element.querySelector('#message'));

    if (!body.isConnected || !items || !sources.length) {
      throw new Error('Live YouTube chat did not expose cloneable message renderers.');
    }

    const appendedIds: string[] = [];
    const elementCounts: number[] = [];
    const sourceRendererTypes: Record<string, number> = {};

    nextMessages.forEach((message, offset) => {
      const source = sources[(message.index + offset) % sources.length];
      const clone = source.cloneNode(true) as HTMLElement;
      resetExtensionState(clone);
      const messageId = `ytcq-hybrid-real-dom-${message.index}`;
      clone.id = messageId;
      clone.setAttribute('data-message-id', messageId);
      clone.setAttribute('data-ytcq-hybrid-stress', 'true');
      clone.removeAttribute('hidden');
      clone.removeAttribute('is-deleted');
      updateAuthor(clone, message);
      updateBadges(clone, message.index);
      updateTimestamp(clone, message.index);
      updateMessageText(clone, message);
      updateRendererData(clone, message);
      items.append(clone);
      appendedIds.push(messageId);
      elementCounts.push(clone.querySelectorAll('*').length);
      const rendererType = clone.tagName.toLowerCase();
      sourceRendererTypes[rendererType] = (sourceRendererTypes[rendererType] || 0) + 1;
    });

    if (scroller instanceof HTMLElement) {
      scroller.scrollTop = scroller.scrollHeight;
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    }

    return {
      appendedIds,
      averageElementCount: elementCounts.reduce((sum, count) => sum + count, 0) / Math.max(elementCounts.length, 1),
      maxElementCount: Math.max(...elementCounts),
      sourceRendererTypes
    };

    function resetExtensionState(root: HTMLElement): void {
      const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
      root.querySelectorAll<HTMLElement>('.ytcq-chat-keyword-highlight').forEach((highlight) => {
        highlight.replaceWith(...Array.from(highlight.childNodes));
      });
      root.querySelectorAll<HTMLElement>('[data-ytcq-managed], .ytcq-translation, .ytcq-replaced-translation-icon')
        .forEach((element) => element.remove());

      elements.forEach((element) => {
        Array.from(element.attributes).forEach((attribute) => {
          if (attribute.name.startsWith('data-ytcq')) element.removeAttribute(attribute.name);
        });
        element.classList.forEach((className) => {
          if (className.startsWith('ytcq-')) element.classList.remove(className);
        });
      });
    }

    function updateAuthor(root: HTMLElement, message: HybridMessage): void {
      const author = root.querySelector<HTMLElement>('#author-name, a[href*="/channel/"], a[href^="/@"]');
      if (!author) return;
      author.textContent = message.author;
      if (author instanceof HTMLAnchorElement) {
        author.href = `/channel/${message.channel}`;
      }
      const authorLink = author.closest<HTMLAnchorElement>('a[href]');
      if (authorLink) authorLink.href = `/channel/${message.channel}`;
    }

    function updateBadges(root: HTMLElement, index: number): void {
      const badgeContainer = root.querySelector<HTMLElement>('#chat-badges, #prepend-chat-badges, #chip-badges');
      if (!badgeContainer) return;
      badgeContainer.replaceChildren(
        createBadge('member', 'Member'),
        ...(index % 5 === 0 ? [createBadge('moderator', 'Moderator')] : []),
        ...(index % 9 === 0 ? [createBadge('verified', 'Verified')] : [])
      );
    }

    function createBadge(type: string, label: string): HTMLElement {
      const badge = document.createElement('yt-live-chat-author-badge-renderer');
      badge.setAttribute('type', type);
      badge.setAttribute('aria-label', label);
      badge.setAttribute('title', label);
      const icon = document.createElement('yt-icon');
      icon.className = 'style-scope yt-live-chat-author-badge-renderer';
      badge.append(icon);
      return badge;
    }

    function updateTimestamp(root: HTMLElement, index: number): void {
      const timestamp = root.querySelector<HTMLElement>('#timestamp');
      if (timestamp) timestamp.textContent = `10:${String(index % 60).padStart(2, '0')} PM`;
    }

    function updateMessageText(root: HTMLElement, message: HybridMessage): void {
      const text = root.querySelector<HTMLElement>('#message');
      if (!text) return;
      text.replaceChildren(...createRichMessageNodes(message));
      text.setAttribute('dir', 'auto');
    }

    function createRichMessageNodes(message: HybridMessage): Node[] {
      const suffix = String(message.index);
      return [
        document.createTextNode('Mensaje rapido '),
        createTextSpan(message.keyword),
        document.createTextNode(` gracias por seguir este chat activo ${suffix} `),
        createEmoji(`hybrid-${message.index % 12}`, ':sparkles:'),
        document.createTextNode(' con enlaces y formato '),
        createAnchor('canal destacado'),
        document.createTextNode(' '),
        createNestedSpan(`detalle ${suffix}`),
        document.createTextNode(' '),
        createEmoji(`custom-${message.index % 8}`, ':custom_hype:'),
        createTooltip(':custom_hype:')
      ];
    }

    function createTextSpan(text: string): HTMLElement {
      const span = document.createElement('span');
      span.className = 'style-scope yt-formatted-string';
      span.textContent = text;
      return span;
    }

    function createNestedSpan(text: string): HTMLElement {
      const outer = document.createElement('span');
      outer.className = 'style-scope yt-live-chat-text-message-renderer';
      const inner = document.createElement('span');
      inner.className = 'style-scope yt-formatted-string';
      inner.textContent = text;
      outer.append(inner);
      return outer;
    }

    function createAnchor(text: string): HTMLElement {
      const anchor = document.createElement('a');
      anchor.className = 'yt-simple-endpoint style-scope yt-formatted-string';
      anchor.href = 'https://www.youtube.com/redirect?q=https%3A%2F%2Fexample.test';
      anchor.textContent = text;
      return anchor;
    }

    function createEmoji(id: string, alt: string): HTMLElement {
      const image = document.createElement('img');
      image.className = 'emoji yt-formatted-string style-scope yt-live-chat-text-message-renderer';
      image.alt = alt;
      image.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
      image.setAttribute('data-emoji-id', id);
      image.setAttribute('shared-tooltip-text', alt);
      image.loading = 'lazy';
      return image;
    }

    function createTooltip(text: string): HTMLElement {
      const tooltip = document.createElement('tp-yt-paper-tooltip');
      tooltip.textContent = text;
      return tooltip;
    }

    function updateRendererData(root: HTMLElement, message: HybridMessage): void {
      const richText = [
        `Mensaje rapido ${message.keyword} gracias por seguir este chat activo ${message.index}`,
        ':sparkles:',
        'con enlaces y formato',
        `detalle ${message.index}`,
        ':custom_hype:'
      ].join(' ');
      const renderer = root as HTMLElement & {
        data?: Record<string, unknown>;
      };
      renderer.data = {
        ...(renderer.data || {}),
        authorExternalChannelId: message.channel,
        authorName: { simpleText: message.author },
        message: {
          runs: richText.split(' ').map((part, index) => ({
            text: `${index ? ' ' : ''}${part}`
          }))
        },
        timestampUsec: String(1780000000000000 + message.index)
      };
    }
  }, messages);

  return {
    ...result,
    durationMs: performance.now() - startedAt
  };
}

async function waitForHybridTranslations(chat: FrameLocator): Promise<number> {
  const startedAt = performance.now();
  await expect.poll(async () => chat
    .locator(`${HYBRID_MESSAGE_SELECTOR} .ytcq-translation[lang="${TARGET_LANGUAGE}"]`)
    .count(), {
    message: 'Hybrid real-DOM messages should render translations.',
    timeout: BUDGETS.translationDrainMs
  }).toBeGreaterThanOrEqual(TOTAL_MESSAGE_COUNT);
  return performance.now() - startedAt;
}

async function waitForInboxBadge(chat: FrameLocator): Promise<number> {
  const startedAt = performance.now();
  await expect(chat.locator('.ytcq-inbox-badge')).toHaveText(EXPECTED_INBOX_BADGE, {
    timeout: BUDGETS.inboxBadgeMs
  });
  return performance.now() - startedAt;
}

async function removeHybridMessages(chat: FrameLocator): Promise<void> {
  await chat.locator(HYBRID_MESSAGE_SELECTOR).evaluateAll((messages) => {
    messages.forEach((message) => message.remove());
  }).catch(() => undefined);
}

async function startChatPerfProbe(chat: FrameLocator): Promise<void> {
  await chat.locator('body').evaluate(() => {
    const state = {
      frameGaps: [] as number[],
      longTasks: [] as number[],
      observer: null as PerformanceObserver | null,
      running: true,
      startedAt: performance.now()
    };
    (window as typeof window & {
      __ytcqHybridPerfProbe?: typeof state;
    }).__ytcqHybridPerfProbe = state;

    let lastFrameAt = performance.now();
    const tick = (now: number) => {
      if (!state.running) return;
      state.frameGaps.push(now - lastFrameAt);
      lastFrameAt = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    try {
      state.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          state.longTasks.push(entry.duration);
        }
      });
      state.observer.observe({ entryTypes: ['longtask'] });
    } catch {
      state.observer = null;
    }
  });
}

async function stopChatPerfProbe(chat: FrameLocator): Promise<BrowserPerfProbeSnapshot> {
  return chat.locator('body').evaluate(() => {
    const state = (window as typeof window & {
      __ytcqHybridPerfProbe?: {
        frameGaps: number[];
        longTasks: number[];
        observer: PerformanceObserver | null;
        running: boolean;
        startedAt: number;
      };
    }).__ytcqHybridPerfProbe;

    if (!state) throw new Error('Hybrid live performance probe was not started.');
    state.running = false;
    state.observer?.disconnect();
    const frameGaps = [...state.frameGaps].sort((first, second) => first - second);
    const longTasks = state.longTasks;

    return {
      durationMs: performance.now() - state.startedAt,
      longTaskCount: longTasks.length,
      maxFrameGapMs: getMax(frameGaps),
      maxLongTaskMs: getMax(longTasks),
      p95FrameGapMs: getPercentile(frameGaps, 95)
    };

    function getMax(values: number[]): number {
      return values.length ? Math.max(...values) : 0;
    }

    function getPercentile(values: number[], percentile: number): number {
      if (!values.length) return 0;
      const index = Math.min(values.length - 1, Math.ceil((percentile / 100) * values.length) - 1);
      return values[index] || 0;
    }
  });
}

async function getChatHeapSnapshot(chat: FrameLocator): Promise<HeapSnapshot | null> {
  return chat.locator('body').evaluate(() => {
    const memory = (performance as Performance & {
      memory?: {
        totalJSHeapSize: number;
        usedJSHeapSize: number;
      };
    }).memory;
    if (!memory) return null;
    return {
      totalMb: bytesToMb(memory.totalJSHeapSize),
      usedMb: bytesToMb(memory.usedJSHeapSize)
    };

    function bytesToMb(value: number): number {
      return value / (1024 * 1024);
    }
  });
}

function assertPerformanceBudgets({
  heapGrowthMb,
  inboxBadgeMs,
  inboxBadgeText,
  ingress,
  probe,
  translatedItemCount,
  translationDrainMs,
  visibleKeywordHighlightCount,
  visibleTranslationCount
}: {
  heapGrowthMb: number | null;
  inboxBadgeMs: number;
  inboxBadgeText: string;
  ingress: HybridIngressStats;
  probe: BrowserPerfProbeSnapshot;
  translatedItemCount: number;
  translationDrainMs: number;
  visibleKeywordHighlightCount: number;
  visibleTranslationCount: number;
}): void {
  expect.soft(ingress.appendedIds, 'All hybrid real-DOM messages should be appended.')
    .toHaveLength(TOTAL_MESSAGE_COUNT);
  expect.soft(ingress.durationMs, 'Hybrid real-DOM ingress should finish within budget.')
    .toBeLessThanOrEqual(BUDGETS.totalIngressMs);
  expect.soft(ingress.maxWaveAppendMs, 'No hybrid real-DOM append wave should block too long.')
    .toBeLessThanOrEqual(BUDGETS.maxWaveAppendMs);
  expect.soft(translationDrainMs, 'Hybrid real-DOM translations should drain within budget.')
    .toBeLessThanOrEqual(BUDGETS.translationDrainMs);
  expect.soft(inboxBadgeMs, 'Hybrid real-DOM Inbox unread state should settle within budget.')
    .toBeLessThanOrEqual(BUDGETS.inboxBadgeMs);
  expect.soft(translatedItemCount, 'The mocked translation endpoint should process hybrid real-DOM messages.')
    .toBeGreaterThanOrEqual(TOTAL_MESSAGE_COUNT);
  expect.soft(visibleTranslationCount, 'Hybrid real-DOM messages should render expected translations.')
    .toBeGreaterThanOrEqual(TOTAL_MESSAGE_COUNT);
  expect.soft(visibleKeywordHighlightCount, 'Hybrid real-DOM messages should receive watched keyword highlights.')
    .toBeGreaterThanOrEqual(TOTAL_MESSAGE_COUNT);
  expect.soft(inboxBadgeText, 'Inbox unread count should reflect hybrid real-DOM traffic.')
    .toBe(EXPECTED_INBOX_BADGE);
  expect.soft(probe.maxLongTaskMs, 'Hybrid real-DOM traffic should not create a catastrophic long task.')
    .toBeLessThanOrEqual(BUDGETS.maxLongTaskMs);
  expect.soft(probe.p95FrameGapMs, 'The chat frame should keep painting during hybrid real-DOM traffic.')
    .toBeLessThanOrEqual(BUDGETS.p95FrameGapMs);

  if (heapGrowthMb !== null) {
    expect.soft(heapGrowthMb, 'Hybrid real-DOM heap growth should stay bounded.')
      .toBeLessThanOrEqual(BUDGETS.heapGrowthMb);
  }
}

function getPercentile(values: number[], percentile: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  const index = Math.min(sorted.length - 1, Math.ceil((percentile / 100) * sorted.length) - 1);
  return sorted[index] || 0;
}

function formatRate(value: number): string {
  return `${value.toFixed(1)} msg/s`;
}

function formatRendererTypes(types: Record<string, number>): string {
  return Object.entries(types)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([type, count]) => `${type}: ${count}`)
    .join(', ') || 'none';
}
