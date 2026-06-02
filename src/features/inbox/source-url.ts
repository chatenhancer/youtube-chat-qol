/**
 * Inbox source scoping.
 *
 * Keeps the Inbox feature API stable while the shared source identity logic
 * lives in the YouTube adapter layer for other per-stream features.
 */
import { getCurrentYouTubeChatSourceUrl } from '../../youtube/source-url';

export function getCurrentInboxSourceUrl(): string {
  return getCurrentYouTubeChatSourceUrl();
}
