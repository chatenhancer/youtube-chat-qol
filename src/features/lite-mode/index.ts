/**
 * Optional Lite mode feature wiring.
 *
 * The page-world transport and reversible controller stay independent from
 * the normal content lifecycle. This entrypoint joins them to shared options,
 * the chat-header toggle, localization, and the existing message feature
 * pipeline.
 */
import {
  handleFeatureMessage,
  registerFeature,
  type FeatureInitContext,
  type FeatureMutationBatch,
  type SaveOptions
} from '../../content/dispatcher';
import { t } from '../../shared/i18n';
import { getOptions } from '../../shared/state';
import { showToast } from '../../shared/toast';
import {
  consumeLiteModeFallbackNotice,
  isSupportedLiteModePage
} from './bootstrap';
import {
  cleanupLiteModeButton,
  initLiteModeButton,
  refreshLiteModeButton,
  scheduleLiteModeButtonWire,
  shouldWireLiteModeButton
} from './button';
import {
  cleanupLiteMode,
  handleLiteModeDomMutations,
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

let saveOptions: SaveOptions = () => {};
let pageListenersInitialized = false;
let pageListeners = new AbortController();

registerFeature({
  page: {
    boot: bootLiteMode,
    cleanup: cleanupStaleLiteMode,
    init: initLiteMode,
    optionsChanged: handleLiteModeOptionsChanged,
    reset: resetLiteMode
  },
  mutation: handleLiteModeMutations
});

function initLiteMode(context: FeatureInitContext): void {
  if (!isSupportedLiteModePage()) return;
  saveOptions = context.saveOptions;
  initLiteModeButton(saveOptions);
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
  scheduleLiteModeButtonWire();
  refreshLiteMode(getOptions().liteModeEnabled);
}

function handleLiteModeOptionsChanged(
  previousOptions: ReturnType<typeof getOptions>,
  nextOptions: ReturnType<typeof getOptions>
): void {
  if (!isSupportedLiteModePage()) return;
  refreshLiteModeButton(nextOptions);
  if (previousOptions.liteModeEnabled === nextOptions.liteModeEnabled) return;
  refreshLiteMode(nextOptions.liteModeEnabled, {
    userInitiatedRetry: nextOptions.liteModeEnabled && !previousOptions.liteModeEnabled
  });
}

function handleLiteModeMutations(batch: FeatureMutationBatch): void {
  if (!isSupportedLiteModePage()) return;
  handleLiteModeDomMutations(batch.mutations);
  if (shouldWireLiteModeButton(batch)) scheduleLiteModeButtonWire();
}

function handleLiteModeRowRendered(
  row: HTMLElement,
  _record: YouTubeChatMessageRecord,
  source: LiteChatRowSource
): void {
  if (!row.isConnected) return;
  handleFeatureMessage(row, { source });
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
  refreshLiteModeButton({ liteModeEnabled: false });
  scheduleLiteModeButtonWire();
}

function cleanupStaleLiteMode(): void {
  cleanupLiteMode({ preserveBootstrapIntent: true });
  cleanupLiteModeButton();
  setLiteModeRowRenderedCallback(null);
  if (!pageListenersInitialized) return;
  pageListenersInitialized = false;
  pageListeners.abort();
}
