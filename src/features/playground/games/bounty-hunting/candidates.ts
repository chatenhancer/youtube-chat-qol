import {
  countBountyHuntingTextEmojis,
  doesBountyHuntingBountyMatch,
  isBountyHuntingAllCapsMessage,
  normalizeBountyHuntingAuthorKey,
  BOUNTY_HUNTING_BOUNTY_COUNT,
  type BountyHuntingBounty,
  type BountyHuntingBountyMatcher
} from '../../../../shared/playground-bounty-hunting';
import { cleanText, normalizeComparableText } from '../../../../shared/text';
import {
  getAuthorName,
  getMessageRuns,
  getMessageStableId,
  getMessageText
} from '../../../../youtube/messages';
import type { BountyHuntingObservedMessage } from './types';

const MIN_KEYWORD_LENGTH = 4;
const STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'because',
  'been',
  'chat',
  'from',
  'have',
  'just',
  'like',
  'live',
  'message',
  'more',
  'that',
  'the',
  'this',
  'with',
  'what',
  'when',
  'where',
  'will',
  'your'
]);

interface BountyCandidate extends BountyHuntingBounty {
  score: number;
}

interface MessageStats {
  allCaps: number;
  authors: Map<string, { count: number; label: string }>;
  emojiHeavy: number;
  keywords: Map<string, { count: number; label: string }>;
  mentions: number;
  numbers: number;
  questions: number;
  urls: number;
  verifiedAuthors: number;
}

export function createBountyHuntingBountiesFromMessages(
  messages: readonly BountyHuntingObservedMessage[]
): BountyHuntingBounty[] {
  const stats = collectBountyHuntingStats(messages);
  const topAuthors = getTopBountyHuntingAuthors(stats);
  const keyword = getTopBountyHuntingKeyword(stats);
  const candidates: BountyCandidate[] = [
    createCandidate('emoji-3', 50, 'a message that has 3+ emojis', { kind: 'emojiCount', min: 3 }, stats.emojiHeavy),
    createCandidate('all-caps', 50, 'a message in all caps', { kind: 'allCaps', minLetters: 4 }, stats.allCaps),
    createCandidate('question', 75, 'a message that asks a question', { kind: 'question' }, stats.questions),
    createCandidate('mention-user', 125, 'a message that mentions a user', { kind: 'mention' }, stats.mentions),
    createCandidate('has-number', 75, 'a message with a number', { kind: 'number' }, stats.numbers),
    createCandidate('has-link', 100, 'a message with a link', { kind: 'url' }, stats.urls),
    createCandidate('verified-author', 75, 'a message by a verified account', { kind: 'verifiedAuthor' }, stats.verifiedAuthors),
    topAuthors.length
      ? createCandidate(
        'top-chatters',
        100,
        'a message by the top 3 chatters',
        { authorNames: topAuthors.map((author) => author.label), kind: 'authorIn' },
        topAuthors.reduce((total, author) => total + author.count, 0)
      )
      : null,
    keyword
      ? createCandidate(
        `keyword-${keyword.label.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}`,
        75,
        `a message that says "${keyword.label}"`,
        { keyword: keyword.label, kind: 'keyword' },
        keyword.count
      )
      : null
  ].filter((candidate): candidate is BountyCandidate => Boolean(candidate));

  const selected = dedupeBountyHuntingCandidates(candidates)
    .sort((a, b) => b.score - a.score || b.amount - a.amount || a.id.localeCompare(b.id))
    .slice(0, BOUNTY_HUNTING_BOUNTY_COUNT);

  for (const fallback of getBountyHuntingFallbackBounties()) {
    if (selected.length >= BOUNTY_HUNTING_BOUNTY_COUNT) break;
    if (!selected.some((bounty) => bounty.id === fallback.id)) selected.push(fallback);
  }

  return selected.map(({ score: _score, ...bounty }) => bounty);
}

export function getBountyHuntingObservedMessage(message: HTMLElement): BountyHuntingObservedMessage | null {
  const text = getMessageText(message);
  if (!text) return null;

  return {
    authorName: getAuthorName(message),
    emojiCount: countBountyHuntingMessageEmojis(message),
    isVerifiedAuthor: isBountyHuntingVerifiedAuthor(message),
    messageId: getBountyHuntingMessageId(message, text),
    text
  };
}

export function findBountyHuntingMatchingBounty(
  bounties: readonly BountyHuntingBounty[],
  message: BountyHuntingObservedMessage
): BountyHuntingBounty | null {
  return [...bounties]
    .sort((a, b) => b.amount - a.amount)
    .find((bounty) => doesBountyHuntingBountyMatch(bounty, message)) || null;
}

function collectBountyHuntingStats(messages: readonly BountyHuntingObservedMessage[]): MessageStats {
  const stats: MessageStats = {
    allCaps: 0,
    authors: new Map(),
    emojiHeavy: 0,
    keywords: new Map(),
    mentions: 0,
    numbers: 0,
    questions: 0,
    urls: 0,
    verifiedAuthors: 0
  };

  messages.forEach((message) => {
    if (message.emojiCount >= 3) stats.emojiHeavy += 1;
    if (isBountyHuntingAllCapsMessage(message.text)) stats.allCaps += 1;
    if (/[?？]/u.test(message.text)) stats.questions += 1;
    if (/(^|\s)@[\p{L}\p{N}._-]{2,}/u.test(message.text)) stats.mentions += 1;
    if (/\p{N}/u.test(message.text)) stats.numbers += 1;
    if (/\b(?:https?:\/\/|www\.)\S+/i.test(message.text)) stats.urls += 1;
    if (message.isVerifiedAuthor) stats.verifiedAuthors += 1;
    recordBountyHuntingAuthor(stats, message.authorName);
    recordBountyHuntingKeywords(stats, message.text);
  });

  return stats;
}

function createCandidate(
  id: string,
  amount: number,
  description: string,
  matcher: BountyHuntingBountyMatcher,
  observedCount: number
): BountyCandidate {
  return {
    amount,
    description,
    id,
    matcher,
    score: observedCount > 0 ? observedCount * 10 + amount / 25 : amount / 100
  };
}

function dedupeBountyHuntingCandidates(candidates: BountyCandidate[]): BountyCandidate[] {
  const result = new Map<string, BountyCandidate>();
  candidates.forEach((candidate) => {
    if (!result.has(candidate.id)) result.set(candidate.id, candidate);
  });
  return [...result.values()];
}

function getTopBountyHuntingAuthors(stats: MessageStats): Array<{ count: number; label: string }> {
  return [...stats.authors.values()]
    .filter((author) => author.count >= 2)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 3);
}

function getTopBountyHuntingKeyword(stats: MessageStats): { count: number; label: string } | null {
  return [...stats.keywords.values()]
    .filter((keyword) => keyword.count >= 2)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))[0] || null;
}

function recordBountyHuntingAuthor(stats: MessageStats, authorName: string): void {
  const label = cleanText(authorName);
  const key = normalizeBountyHuntingAuthorKey(label);
  if (!key) return;
  const existing = stats.authors.get(key);
  stats.authors.set(key, {
    count: (existing?.count || 0) + 1,
    label: existing?.label || label
  });
}

function recordBountyHuntingKeywords(stats: MessageStats, text: string): void {
  const words = normalizeComparableText(text)
    .match(/[\p{L}\p{N}][\p{L}\p{N}'_-]{3,}/gu) || [];

  new Set(words).forEach((word) => {
    const label = word.replace(/^_+|_+$/g, '');
    if (label.length < MIN_KEYWORD_LENGTH || STOP_WORDS.has(label)) return;
    const existing = stats.keywords.get(label);
    stats.keywords.set(label, {
      count: (existing?.count || 0) + 1,
      label: existing?.label || label
    });
  });
}

function getBountyHuntingFallbackBounties(): BountyCandidate[] {
  return [
    createCandidate('emoji-3', 50, 'a message that has 3+ emojis', { kind: 'emojiCount', min: 3 }, 0),
    createCandidate('all-caps', 50, 'a message in all caps', { kind: 'allCaps', minLetters: 4 }, 0),
    createCandidate('question', 75, 'a message that asks a question', { kind: 'question' }, 0),
    createCandidate('mention-user', 125, 'a message that mentions a user', { kind: 'mention' }, 0),
    createCandidate('has-number', 75, 'a message with a number', { kind: 'number' }, 0),
    createCandidate('has-link', 100, 'a message with a link', { kind: 'url' }, 0)
  ];
}

function countBountyHuntingMessageEmojis(message: HTMLElement): number {
  const runs = getMessageRuns(message);
  if (runs?.length) {
    const runEmojiCount = runs.filter((run) => Boolean(run.emoji)).length;
    if (runEmojiCount) return runEmojiCount;
  }

  const visualEmojiCount = message.querySelectorAll(
    'img[alt], img[shared-tooltip-text], [data-emoji-id], [class*="emoji" i]'
  ).length;
  return Math.max(visualEmojiCount, countBountyHuntingTextEmojis(getMessageText(message)));
}

function isBountyHuntingVerifiedAuthor(message: HTMLElement): boolean {
  const badgeSelector = [
    'yt-live-chat-author-badge-renderer[type="verified"]',
    'yt-live-chat-author-badge-renderer[aria-label*="Verified" i]',
    'yt-live-chat-author-badge-renderer[title*="Verified" i]',
    '[aria-label*="Verified" i]',
    '[title*="Verified" i]'
  ].join(',');
  try {
    return Boolean(message.querySelector(badgeSelector));
  } catch {
    return false;
  }
}

function getBountyHuntingMessageId(message: HTMLElement, text: string): string {
  const stableId = getMessageStableId(message);
  if (stableId) return stableId;

  const existingId = message.dataset.ytcqBountyHuntingMessageId;
  if (existingId) return existingId;

  const generatedId = `local:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}:${normalizeComparableText(text).slice(0, 24)}`;
  message.dataset.ytcqBountyHuntingMessageId = generatedId;
  return generatedId;
}
