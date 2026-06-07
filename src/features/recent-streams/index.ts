/**
 * Recent stream visits.
 *
 * Records a lightweight local visit whenever the extension attaches to a
 * YouTube live chat or replay frame. The background owns the actual storage
 * write because it can read the outer watch tab title more reliably.
 */
import { registerFeatureLifecycle } from '../../content/lifecycle';
import { getCurrentYouTubeChatSourceTitle, getCurrentYouTubeChatSourceUrl } from '../../youtube/source-url';

const RECENT_STREAM_RECORD_DELAY_MS = 900;

let recordTimer = 0;

registerFeatureLifecycle({
  page: {
    boot: scheduleRecentStreamRecord,
    reset: resetRecentStreamRecord
  }
});

export function scheduleRecentStreamRecord(): void {
  if (recordTimer) return;

  recordTimer = window.setTimeout(() => {
    recordTimer = 0;
    recordRecentStream();
  }, RECENT_STREAM_RECORD_DELAY_MS);
}

export function resetRecentStreamRecord(): void {
  if (!recordTimer) return;
  window.clearTimeout(recordTimer);
  recordTimer = 0;
}

function recordRecentStream(): void {
  chrome.runtime.sendMessage({
    sourceTitle: getCurrentYouTubeChatSourceTitle(),
    sourceUrl: getCurrentYouTubeChatSourceUrl(),
    type: 'ytcq:record-recent-stream'
  }, () => {
    void chrome.runtime.lastError;
  });
}
