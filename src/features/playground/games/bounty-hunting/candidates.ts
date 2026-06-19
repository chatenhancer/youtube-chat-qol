import {
  countBountyHuntingTextEmojis,
  doesBountyHuntingBountyMatch,
  isBountyHuntingAllCapsMessage,
  BOUNTY_HUNTING_BOUNTY_COUNT,
  type BountyHuntingBounty,
  type BountyHuntingBountyMatcher
} from '../../../../shared/playground-bounty-hunting';
import { cleanText } from '../../../../shared/text';
import {
  getAuthorName,
  getMessageRuns,
  getMessageStableId,
  getMessageText
} from '../../../../youtube/messages';
import { getParticipantAuthorName } from '../../../../youtube/participants';
import type { BountyHuntingObservedMessage } from './types';

interface BountyCandidate extends BountyHuntingBounty {
  score: number;
}

interface MessageStats {
  allCaps: number;
  emojiHeavy: number;
  mentions: number;
  numbers: number;
  questions: number;
  topFanAuthors: number;
  verifiedAuthors: number;
}

interface BountyHuntingObservedMessageOptions {
  topFanAuthorKeys?: ReadonlySet<string>;
}

const TOP_FAN_LABEL_PATTERN = /\btop\s+(?:fans?|chatters?)\b/i;

export function createBountyHuntingBountiesFromMessages(
  messages: readonly BountyHuntingObservedMessage[]
): BountyHuntingBounty[] {
  const stats = collectBountyHuntingStats(messages);
  const candidates: BountyCandidate[] = [
    createCandidate('emoji-3', 50, 'a message that has 3+ emojis', { kind: 'emojiCount', min: 3 }, stats.emojiHeavy),
    createCandidate('all-caps', 50, 'a message in all caps', { kind: 'allCaps' }, stats.allCaps),
    createCandidate('verified-author', 75, 'a message by a verified account', { kind: 'verifiedAuthor' }, stats.verifiedAuthors),
    createCandidate('question', 75, 'a message that asks a question', { kind: 'question' }, stats.questions),
    createCandidate('mention-user', 125, 'a message that mentions a user', { kind: 'mention' }, stats.mentions),
    createCandidate('has-number', 75, 'a message with a number', { kind: 'number' }, stats.numbers),
    ...(stats.topFanAuthors > 0
      ? [createCandidate(
        'top-chatters',
        100,
        'a message by the top 3 chatters',
        { kind: 'topFanAuthor' },
        stats.topFanAuthors
      )]
      : [])
  ];

  const selected = dedupeBountyHuntingCandidates(candidates)
    .sort((a, b) => b.score - a.score || b.amount - a.amount || a.id.localeCompare(b.id))
    .slice(0, BOUNTY_HUNTING_BOUNTY_COUNT);

  for (const fallback of getBountyHuntingFallbackBounties()) {
    if (selected.length >= BOUNTY_HUNTING_BOUNTY_COUNT) break;
    if (!selected.some((bounty) => bounty.id === fallback.id)) selected.push(fallback);
  }

  return selected.map(({ score: _score, ...bounty }) => bounty);
}

export function getBountyHuntingObservedMessage(
  message: HTMLElement,
  options: BountyHuntingObservedMessageOptions = {}
): BountyHuntingObservedMessage | null {
  const text = getMessageText(message);
  if (!text) return null;
  const emojiCount = countBountyHuntingMessageEmojis(message);
  const authorKey = getBountyHuntingAuthorKey(getAuthorName(message));

  return {
    emojiCount,
    hasAllCaps: isBountyHuntingAllCapsMessage(text),
    hasMention: /(^|\s)@[\p{L}\p{N}._-]{2,}/u.test(text),
    hasNumber: /\p{N}/u.test(text),
    hasQuestion: /[?？]/u.test(text),
    isTopFanAuthor: Boolean(authorKey && options.topFanAuthorKeys?.has(authorKey)),
    isVerifiedAuthor: isBountyHuntingVerifiedAuthor(message),
    messageId: getBountyHuntingMessageId(message)
  };
}

export function collectBountyHuntingTopFanAuthorKeys(root: ParentNode = document): Set<string> {
  const authorKeys = new Set<string>();
  root.querySelectorAll<HTMLElement>('yt-live-chat-participant-renderer').forEach((participant) => {
    const key = getBountyHuntingTopFanAuthorKeyFromParticipant(participant);
    if (key) authorKeys.add(key);
  });
  return authorKeys;
}

export function getBountyHuntingTopFanAuthorKeyFromParticipant(participant: HTMLElement): string {
  if (!isBountyHuntingTopFanParticipant(participant)) return '';
  return getBountyHuntingAuthorKey(getParticipantAuthorName(participant));
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
    emojiHeavy: 0,
    mentions: 0,
    numbers: 0,
    questions: 0,
    topFanAuthors: 0,
    verifiedAuthors: 0
  };

  messages.forEach((message) => {
    if (message.emojiCount >= 3) stats.emojiHeavy += 1;
    if (message.hasAllCaps) stats.allCaps += 1;
    if (message.hasQuestion) stats.questions += 1;
    if (message.hasMention) stats.mentions += 1;
    if (message.hasNumber) stats.numbers += 1;
    if (message.isTopFanAuthor) stats.topFanAuthors += 1;
    if (message.isVerifiedAuthor) stats.verifiedAuthors += 1;
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

function getBountyHuntingFallbackBounties(): BountyCandidate[] {
  return [
    createCandidate('emoji-3', 50, 'a message that has 3+ emojis', { kind: 'emojiCount', min: 3 }, 0),
    createCandidate('all-caps', 50, 'a message in all caps', { kind: 'allCaps' }, 0),
    createCandidate('verified-author', 75, 'a message by a verified account', { kind: 'verifiedAuthor' }, 0),
    createCandidate('question', 75, 'a message that asks a question', { kind: 'question' }, 0),
    createCandidate('mention-user', 125, 'a message that mentions a user', { kind: 'mention' }, 0),
    createCandidate('has-number', 75, 'a message with a number', { kind: 'number' }, 0)
  ];
}

function getBountyHuntingAuthorKey(value: unknown): string {
  return cleanText(value)
    .replace(/^@+/, '')
    .toLocaleLowerCase();
}

function isBountyHuntingTopFanParticipant(participant: HTMLElement): boolean {
  if (hasBountyHuntingTopFanDataSignal(participant)) return true;
  if (hasBountyHuntingTopFanLabel(participant)) return true;
  return hasBountyHuntingTopFanSectionSignal(participant);
}

function hasBountyHuntingTopFanLabel(element: Element): boolean {
  const text = [
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
    ...Array.from(element.querySelectorAll('[aria-label], [title]')).flatMap((child) => [
      child.getAttribute('aria-label'),
      child.getAttribute('title')
    ])
  ].join(' ');
  return TOP_FAN_LABEL_PATTERN.test(text);
}

function hasBountyHuntingTopFanSectionSignal(participant: HTMLElement): boolean {
  let current: Element | null = participant;
  for (let depth = 0; current?.parentElement && depth < 4; depth += 1) {
    const signal = getBountyHuntingPreviousSectionLabel(current);
    if (signal && TOP_FAN_LABEL_PATTERN.test(signal)) return true;
    current = current.parentElement;
  }
  return false;
}

function getBountyHuntingPreviousSectionLabel(element: Element): string {
  let sibling = element.previousElementSibling;
  while (sibling) {
    if (sibling.matches('yt-live-chat-participant-renderer')) return '';
    const text = cleanText([
      sibling.getAttribute('aria-label'),
      sibling.getAttribute('title'),
      sibling.textContent
    ].join(' '));
    if (text) return text;
    sibling = sibling.previousElementSibling;
  }
  return '';
}

function hasBountyHuntingTopFanDataSignal(participant: HTMLElement): boolean {
  const candidate = participant as HTMLElement & {
    data?: unknown;
    __data?: { data?: unknown };
  };
  return hasBountyHuntingTopFanValue(candidate.data || candidate.__data?.data);
}

function hasBountyHuntingTopFanValue(value: unknown, depth = 0): boolean {
  if (!value || depth > 4) return false;
  if (typeof value === 'string') return TOP_FAN_LABEL_PATTERN.test(value);
  if (Array.isArray(value)) {
    return value.some((child) => hasBountyHuntingTopFanValue(child, depth + 1));
  }
  if (typeof value !== 'object') return false;

  return Object.entries(value as Record<string, unknown>).some(([key, child]) => {
    if (/top\s*fan|top\s*chatter/i.test(key) && child !== false && child !== null && child !== undefined) return true;
    return hasBountyHuntingTopFanValue(child, depth + 1);
  });
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

function getBountyHuntingMessageId(message: HTMLElement): string {
  const stableId = getMessageStableId(message);
  if (stableId) return stableId;

  const existingId = message.dataset.ytcqBountyHuntingMessageId;
  if (existingId) return existingId;

  const randomId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 12);
  const generatedId = `local:${Date.now().toString(36)}:${randomId}`;
  message.dataset.ytcqBountyHuntingMessageId = generatedId;
  return generatedId;
}
