/**
 * Shared control boundary for YouTube's normalized chat feed.
 *
 * Feed-backed features independently share the same page-world fetch tap. The
 * consumer key prevents one from disabling the transport while others need it.
 */
import {
  YOUTUBE_CHAT_FEED_CONTROL_EVENT,
  type YouTubeChatFeedControl
} from './protocol';

export function dispatchYouTubeChatFeedControl(
  control: YouTubeChatFeedControl
): void {
  window.dispatchEvent(new CustomEvent(YOUTUBE_CHAT_FEED_CONTROL_EVENT, {
    detail: JSON.stringify(control)
  }));
}
