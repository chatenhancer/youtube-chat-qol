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
  registerFeatureLifecycle,
  type FeatureLifecycleContext,
  type FeatureMutationBatch,
  type SaveOptions
} from '../../content/lifecycle';
import { t } from '../../shared/i18n';
import { getOptions } from '../../shared/state';
import { showToast } from '../../shared/toast';
import type { YouTubeMessageData } from '../../youtube/message-data-events';
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
import type { LiteChatMessageRecord } from './protocol';
import type { LiteChatRowSource } from './renderer';

let saveOptions: SaveOptions = () => {};
let pageListenersInitialized = false;
let pageListeners = new AbortController();

registerFeatureLifecycle({
  page: {
    boot: bootLiteMode,
    cleanupStale: cleanupStaleLiteMode,
    init: initLiteMode,
    optionsChanged: handleLiteModeOptionsChanged,
    reset: resetLiteMode
  },
  mutation: {
    enhance: handleLiteModeMutations
  }
});

function initLiteMode(context: FeatureLifecycleContext): void {
  if (!isSupportedLiteModePage()) return;
  saveOptions = context.saveOptions;
  initLiteModeButton(saveOptions);
  setLiteModeRowRenderedCallback(handleLiteModeRowRendered);
  if (consumeLiteModeFallbackNotice()) showToast(t('liteModeFallback'));
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
  record: LiteChatMessageRecord,
  source: LiteChatRowSource
): void {
  if (!row.isConnected) return;
  handleFeatureMessage(row, {
    messageData: Promise.resolve(createYouTubeMessageData(record)),
    source
  });
}

function createYouTubeMessageData(record: LiteChatMessageRecord): YouTubeMessageData {
  const messageData: YouTubeMessageData = { messageId: record.id };
  if (record.timestampUsec) messageData.timestampUsec = record.timestampUsec;
  if (record.author?.channelId) {
    messageData.authorExternalChannelId = record.author.channelId;
  }
  if (record.author?.name) messageData.authorName = record.author.name;
  if (record.author?.avatarUrl) messageData.authorPhotoUrl = record.author.avatarUrl;
  return messageData;
}

function handleLiteModeFallback(): void {
  showToast(t('liteModeFallback'));
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
