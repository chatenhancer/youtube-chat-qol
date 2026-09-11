/** Browser scenarios for Lite mode live behavior. */
import { expect, test, type Request } from '@playwright/test';
import { expectLiteModeMenuState, toggleLiteModeFromMenu } from './menu';
import { DEFAULT_LITE_CHAT_RENDER_LIMIT } from '../../../src/features/lite-mode/store';
import { clearChatComposerIfVisible } from '../../support/composer';
import { setExtensionStorageValues } from '../../support/extension-storage';
import type { BrowserScenario } from '../types';
import { clearLiteTestCooldown, expectStoredLiteMode } from './assertions';
import {
  getContinuationEvidenceTimeout,
  getLatestLiveSequence,
  getLiteDiagnostics,
  getLiteNetworkRequestDiagnostic,
  getPostDiscardBatchTarget,
  installLiteDiagnostics,
  uninstallLiteDiagnostics,
  waitForContinuationEvidence
} from './diagnostics';
import type { LiteClientDiagnostics, LiteNetworkRequestDiagnostic } from './diagnostics';
import {
  LITE_NATIVE_DISCARDED_ATTRIBUTE,
  LITE_NATIVE_RESTORE_SELECTOR,
  LITE_ROOT_SELECTOR,
  NATIVE_LIST_SELECTOR,
  NATIVE_MESSAGE_SELECTOR
} from './selectors';
import { getLiteContinuitySnapshot } from './transport-fixtures';
import type {
  LiteContinuityEvidence,
  LiteContinuitySnapshot
} from './transport-fixtures';

export const liteModeLiveSustainedScenario: BrowserScenario = async ({ chat, context, page }) => {
  const target = getPostDiscardBatchTarget();
  test.setTimeout(Math.max(test.info().timeout, 60_000 + target * 12_000));
  const networkRequests: LiteNetworkRequestDiagnostic[] = [];
  const onRequest = (request: Request) => {
    const diagnostic = getLiteNetworkRequestDiagnostic(request);
    if (diagnostic) networkRequests.push(diagnostic);
  };
  page.on('request', onRequest);

  const nativeList = chat.locator(NATIVE_LIST_SELECTOR).first();
  const root = chat.locator(LITE_ROOT_SELECTOR);
  let continuationEvidence: { batches: number; requests: number } | null = null;
  let continuityEvidence: LiteContinuityEvidence | null = null;
  let sustainedEvidence: LiteClientDiagnostics | null = null;
  let baselineContinuity: LiteContinuitySnapshot | null = null;

  try {
    await setExtensionStorageValues(context, 'sync', { liteModeEnabled: false });
    await expectStoredLiteMode(context, false);
    await installLiteDiagnostics(chat);
    await nativeList.waitFor({ state: 'attached', timeout: 20_000 });
    await expect(nativeList.locator(NATIVE_MESSAGE_SELECTOR).first()).toBeVisible({
      timeout: 20_000
    });

    await expectLiteModeMenuState(chat, false);
    const nativeHistoryBeforeEnable = await getLiteContinuitySnapshot(chat);
    expect(nativeHistoryBeforeEnable.nativeIds.length).toBeGreaterThan(0);

    await toggleLiteModeFromMenu(chat);
    await expectStoredLiteMode(context, true);
    await expect(root).toBeVisible({ timeout: 20_000 });
    await expect(root.locator('.ytcq-lite-toolbar')).toHaveCount(0);

    try {
      await expect(chat.locator('html')).toHaveAttribute(LITE_NATIVE_DISCARDED_ATTRIBUTE, 'true', {
        timeout: 20_000
      });
      await expect
        .poll(
          async () => {
            const liteIds = (await getLiteContinuitySnapshot(chat)).liteIds;
            return nativeHistoryBeforeEnable.nativeIds.some((id) => liteIds.includes(id));
          },
          {
            message: 'Expected Lite mode to preserve at least one row from native chat history.',
            timeout: 20_000
          }
        )
        .toBe(true);
    } catch (error) {
      const diagnostics = await getLiteDiagnostics(chat);
      throw new Error(`Lite mode did not discard the native feed: ${JSON.stringify(diagnostics)}`, {
        cause: error
      });
    }

    const baseline = await getLiteDiagnostics(chat);
    baselineContinuity = await getLiteContinuitySnapshot(chat);
    const observationBaselineAt = Date.now();
    const baselineSequence = getLatestLiveSequence(baseline);
    const networkBaseline = networkRequests.length;
    const continuationTimeoutMs = getContinuationEvidenceTimeout(baseline, target);
    test.setTimeout(Math.max(test.info().timeout, continuationTimeoutMs + 60_000));
    continuationEvidence = await waitForContinuationEvidence({
      baselineSequence,
      chat,
      networkBaseline,
      networkRequests,
      page,
      target,
      timeoutMs: continuationTimeoutMs
    });

    const sustained = await getLiteDiagnostics(chat);
    sustainedEvidence = sustained;
    const beforeRestoreContinuity = await getLiteContinuitySnapshot(chat);
    const baselineLiteIds = new Set(baselineContinuity.liteIds);
    const postDiscardLiteIds = beforeRestoreContinuity.liteIds.filter(
      (messageId) => !baselineLiteIds.has(messageId)
    );
    continuityEvidence = {
      nativeDescendantDelta:
        beforeRestoreContinuity.nativeDescendants - baselineContinuity.nativeDescendants,
      postDiscardLiteIds,
      restoredOverlapIds: []
    };
    const edgeSamples = sustained.liveEdgeSamples.filter(
      (sample) => sample.at >= observationBaselineAt
    );
    expect(sustained.fallbackReason).toBe('');
    expect(sustained.followingLiveEdge).toBe(true);
    expect(sustained.liveEdgeDistance).toBeLessThanOrEqual(32);
    expect(sustained.liteRows).toBeGreaterThan(0);
    expect(sustained.liteRows).toBeLessThanOrEqual(DEFAULT_LITE_CHAT_RENDER_LIMIT);
    expect(sustained.newMessagesVisible).toBe(false);
    expect(sustained.pendingLiveActions).toBe(0);
    expect(edgeSamples.length).toBeGreaterThan(0);
    expect(edgeSamples.every((sample) => sample.following && !sample.newMessagesVisible)).toBe(
      true
    );
    console.log(
      'Lite mode sustained evidence:',
      JSON.stringify({
        continuationEvidence,
        liteDescendants: sustained.liteDescendants,
        liteRows: sustained.liteRows,
        nativeDescendants: sustained.nativeDescendants,
        continuityEvidence
      })
    );
    await expect(root).toBeVisible();

    await toggleLiteModeFromMenu(chat);
    await expectStoredLiteMode(context, false);
    await expect(root).toHaveCount(0, { timeout: 8_000 });
    await expect(chat.locator(NATIVE_LIST_SELECTOR).first()).toBeVisible({
      timeout: 15_000
    });
    await expect(chat.locator(LITE_NATIVE_RESTORE_SELECTOR)).toHaveCount(0, {
      timeout: 20_000
    });
    const afterRestoreContinuity = await getLiteContinuitySnapshot(chat);
    if (continuityEvidence) {
      continuityEvidence.restoredOverlapIds = continuityEvidence.postDiscardLiteIds.filter(
        (messageId) => afterRestoreContinuity.nativeIds.includes(messageId)
      );
    }
  } finally {
    page.off('request', onRequest);
    const diagnostics = await getLiteDiagnostics(chat).catch(() => null);
    await setExtensionStorageValues(context, 'sync', { liteModeEnabled: false }).catch(
      () => undefined
    );
    await root.waitFor({ state: 'detached', timeout: 8_000 }).catch(() => undefined);
    await clearChatComposerIfVisible(chat).catch(() => undefined);
    await clearLiteTestCooldown(chat).catch(() => undefined);
    await uninstallLiteDiagnostics(chat).catch(() => undefined);
    await test
      .info()
      .attach('lite-mode-diagnostics', {
        body: JSON.stringify(
          {
            client: diagnostics,
            continuationEvidence,
            continuityEvidence,
            networkRequests,
            sustained: sustainedEvidence
          },
          null,
          2
        ),
        contentType: 'application/json'
      })
      .catch(() => undefined);
  }
};
