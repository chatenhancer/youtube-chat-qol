/**
 * Optional Lite mode feature wiring.
 *
 * The page-world transport and reversible controller stay independent from
 * the normal content lifecycle. This entrypoint joins them to shared options,
 * localization, and the existing message feature pipeline.
 */
import {
  handleFeatureMessage,
  registerFeature,
  type FeatureMutationBatch
} from '../../content/dispatcher';
import { t } from '../../shared/i18n';
import { getOptions } from '../../shared/state';
import { showToast } from '../../shared/toast';
import {
  consumeLiteModeFallbackNotice,
  isSupportedLiteModePage
} from './bootstrap';
import {
  cleanupLiteMode,
  handleLiteModeDomMutations,
  handleLiteModeVisibilityChanged,
  LITE_MODE_FALLBACK_EVENT,
  refreshLiteMode,
  setLiteModeRowRenderedCallback,
  stopLiteMode
} from './controller';
import type { YouTubeChatMessageRecord } from '../../youtube/chat-feed/protocol';
import type { LiteChatRowSource } from './renderer';
import {
  formatLiteModeFallbackMessage,
  parseLiteModeFallbackCode,
  type LiteModeFallbackCode
} from './fallback';

let pageListenersInitialized = false;
let pageListeners = new AbortController();

registerFeature({
  page: {
    boot: bootLiteMode,
    cleanup: cleanupStaleLiteMode,
    init: initLiteMode,
    optionsChanged: handleLiteModeOptionsChanged,
    reset: resetLiteMode,
    visibilityChanged: handleLiteModeVisibilityChanged
  },
  mutation: handleLiteModeMutations
});

function initLiteMode(): void {
  if (!isSupportedLiteModePage()) return;
  setLiteModeRowRenderedCallback(handleLiteModeRowRendered);
  const fallbackCode = consumeLiteModeFallbackNotice();
  if (fallbackCode) showLiteModeFallback(fallbackCode);
  if (pageListenersInitialized) return;
  pageListenersInitialized = true;
  if (pageListeners.signal.aborted) pageListeners = new AbortController();
  window.addEventListener(LITE_MODE_FALLBACK_EVENT, handleLiteModeFallback, {
    signal: pageListeners.signal
  });
}

function bootLiteMode(): void {
  if (!isSupportedLiteModePage()) return;
  refreshLiteMode(getOptions().liteModeEnabled);
}

function handleLiteModeOptionsChanged(
  previousOptions: ReturnType<typeof getOptions>,
  nextOptions: ReturnType<typeof getOptions>
): void {
  if (!isSupportedLiteModePage()) return;
  if (previousOptions.liteModeEnabled === nextOptions.liteModeEnabled) return;
  refreshLiteMode(nextOptions.liteModeEnabled, {
    userInitiatedRetry: nextOptions.liteModeEnabled && !previousOptions.liteModeEnabled
  });
}

function handleLiteModeMutations(batch: FeatureMutationBatch): void {
  if (!isSupportedLiteModePage()) return;
  handleLiteModeDomMutations(batch.mutations);
}

function handleLiteModeRowRendered(
  row: HTMLElement,
  record: YouTubeChatMessageRecord,
  source: LiteChatRowSource
): void {
  if (!row.isConnected) return;
  handleFeatureMessage(row, { record, source });
}

function handleLiteModeFallback(event: Event): void {
  let code: LiteModeFallbackCode = 'LM00';
  if (event instanceof CustomEvent && typeof event.detail === 'string') {
    try {
      code = parseLiteModeFallbackCode(JSON.parse(event.detail)?.code) || code;
    } catch {
      // The fallback still remains understandable if an older event has no code.
    }
  }
  showLiteModeFallback(code);
}

function showLiteModeFallback(code: LiteModeFallbackCode): void {
  showToast(formatLiteModeFallbackMessage(t('liteModeFallback'), code));
}

function resetLiteMode(): void {
  stopLiteMode('explicit');
}

function cleanupStaleLiteMode(): void {
  cleanupLiteMode({ preserveBootstrapIntent: true });
  // Extension reloads can leave the former header shortcut in an existing frame.
  document.querySelectorAll('.ytcq-lite-mode-button').forEach((button) => button.remove());
  setLiteModeRowRenderedCallback(null);
  if (!pageListenersInitialized) return;
  pageListenersInitialized = false;
  pageListeners.abort();
}
