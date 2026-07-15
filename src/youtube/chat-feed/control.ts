/**
 * Shared control boundary for YouTube's normalized chat feed.
 *
 * Feed-backed features independently share the same page-world fetch tap. The
 * consumer key prevents one from disabling the transport while others need it.
 */
import {
  YOUTUBE_CHAT_FEED_CONTROL_EVENT,
  YOUTUBE_CHAT_FEED_PROTOCOL_VERSION,
  type YouTubeChatFeedControl
} from './protocol';

export function dispatchYouTubeChatFeedControl(
  values: Omit<YouTubeChatFeedControl, 'version'>
): void {
  const control: YouTubeChatFeedControl = {
    ...values,
    version: YOUTUBE_CHAT_FEED_PROTOCOL_VERSION
  };
  window.dispatchEvent(new CustomEvent(YOUTUBE_CHAT_FEED_CONTROL_EVENT, {
    detail: JSON.stringify(control)
  }));
}
