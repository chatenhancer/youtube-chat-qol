/**
 * Known live-chat tab storage helpers.
 *
 * Normalizes the local tab registry used by the background action icon to keep
 * recently known chat tabs visually inactive when content scripts disconnect.
 */
export const KNOWN_CHAT_TABS_STORAGE_KEY = 'ytcqKnownChatTabs';
export const KNOWN_CHAT_TAB_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export type KnownChatTabs = Record<string, number>;

export function normalizeKnownChatTabs(value: unknown, now = Date.now()): KnownChatTabs {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const records: KnownChatTabs = {};
  for (const [tabIdText, lastSeenValue] of Object.entries(value as Record<string, unknown>)) {
    const tabId = Number(tabIdText);
    const lastSeen = Number(lastSeenValue);
    if (!Number.isInteger(tabId) || tabId < 0 || !Number.isFinite(lastSeen)) continue;
    if (now - lastSeen > KNOWN_CHAT_TAB_MAX_AGE_MS) continue;
    records[String(tabId)] = lastSeen;
  }
  return records;
}
