/**
 * Frequent emoji type definitions.
 *
 * Stored shape for local emoji usage counts and the data needed to reinsert an
 * emoji from the custom row.
 */
export interface EmojiUsage {
  key: string;
  emojiId: string;
  src: string;
  alt: string;
  label: string;
  shortcut: string;
  text: string;
  count: number;
  lastUsed: number;
}
