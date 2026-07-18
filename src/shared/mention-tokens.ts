/**
 * Visible @handle token parsing shared by DOM decorators.
 *
 * The leading-boundary rule avoids treating the domain half of an email
 * address as a mention while still supporting YouTube handles with Unicode,
 * dots, underscores, and hyphens.
 */

export interface MentionToken {
  index: number;
  text: string;
}

export const PRESERVED_MENTION_TOKEN_CLASS = 'ytcq-preserved-mention-token';

const MENTION_PATTERN = /(^|[^\p{L}\p{N}._-])(@[\p{L}\p{N}_](?:[\p{L}\p{N}._-]*[\p{L}\p{N}_])?)/gu;

export function findMentionTokens(text: string): MentionToken[] {
  const tokens: MentionToken[] = [];
  MENTION_PATTERN.lastIndex = 0;

  for (let match = MENTION_PATTERN.exec(text); match; match = MENTION_PATTERN.exec(text)) {
    const prefix = match[1] || '';
    const mention = match[2] || '';
    if (!mention) continue;
    tokens.push({
      index: match.index + prefix.length,
      text: mention
    });
  }

  return tokens;
}
