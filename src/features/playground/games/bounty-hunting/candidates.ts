import {
  countBountyHuntingTextEmojis,
  doesBountyHuntingBountyMatch,
  isBountyHuntingAllCapsMessage,
  BOUNTY_HUNTING_BOUNTY_COUNT,
  type BountyHuntingBounty,
  type BountyHuntingBountyMatcher
} from '../../../../shared/playground/bounty-hunting';
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
  observedCount: number;
  score: number;
}

interface MessageStats {
  allCaps: number;
  channelMemberAuthors: number;
  channelOwnerAuthors: number;
  customEmojis: number;
  emojiHeavy: number;
  mentions: number;
  moderatorAuthors: number;
  numbers: number;
  onlyEmojis: number;
  questions: number;
  superChats: number;
  topFanAuthors: number;
  verifiedAuthors: number;
}

interface BountyHuntingObservedMessageOptions {
  topFanAuthorKeys?: ReadonlySet<string>;
}

const TOP_FAN_LABEL_PATTERN = /\btop\s+(?:fans?|chatters?)\b/i;
const CUSTOM_EMOJI_SHORTCUT_PATTERN = /^:[^:\s]+:$/;

export function createBountyHuntingBountiesFromMessages(
  messages: readonly BountyHuntingObservedMessage[]
): BountyHuntingBounty[] {
  const selected = dedupeBountyHuntingCandidates(createBountyHuntingCandidatePool(messages))
    .sort((a, b) => b.score - a.score || b.amount - a.amount || a.id.localeCompare(b.id))
    .slice(0, BOUNTY_HUNTING_BOUNTY_COUNT);

  for (const fallback of getBountyHuntingFallbackBounties()) {
    if (selected.length >= BOUNTY_HUNTING_BOUNTY_COUNT) break;
    if (!selected.some((bounty) => bounty.id === fallback.id)) selected.push(fallback);
  }

  return selected.map(({ observedCount: _observedCount, score: _score, ...bounty }) => bounty);
}

export function countBountyHuntingObservedCandidateTypes(
  messages: readonly BountyHuntingObservedMessage[]
): number {
  return dedupeBountyHuntingCandidates(createBountyHuntingCandidatePool(messages))
    .filter((candidate) => candidate.observedCount > 0)
    .length;
}

function createBountyHuntingCandidatePool(messages: readonly BountyHuntingObservedMessage[]): BountyCandidate[] {
  const stats = collectBountyHuntingStats(messages);
  return [
    createCandidate('emoji-3', 50, 'a message that has 3+ emojis', { kind: 'emojiCount', min: 3 }, stats.emojiHeavy),
    createCandidate('all-caps', 50, 'a message in all caps', { kind: 'allCaps' }, stats.allCaps),
    createCandidate('verified-author', 75, 'a message by a verified account', { kind: 'verifiedAuthor' }, stats.verifiedAuthors),
    createCandidate('question', 75, 'a message that asks a question', { kind: 'question' }, stats.questions),
    createCandidate('mention-user', 125, 'a message that mentions a user', { kind: 'mention' }, stats.mentions),
    createCandidate('has-number', 75, 'a message with a number', { kind: 'number' }, stats.numbers),
    ...createCandidateWhenObserved(
      'channel-member',
      100,
      'a message from a channel member',
      { kind: 'channelMemberAuthor' },
      stats.channelMemberAuthors
    ),
    ...createCandidateWhenObserved(
      'moderator',
      100,
      'a message from a moderator',
      { kind: 'moderatorAuthor' },
      stats.moderatorAuthors
    ),
    ...createCandidateWhenObserved(
      'channel-owner',
      125,
      'a message from the channel owner',
      { kind: 'channelOwnerAuthor' },
      stats.channelOwnerAuthors
    ),
    ...createCandidateWhenObserved('super-chat', 125, 'a Super Chat', { kind: 'superChat' }, stats.superChats),
    ...createCandidateWhenObserved(
      'custom-emoji',
      75,
      'a message with a custom emoji',
      { kind: 'customEmoji' },
      stats.customEmojis
    ),
    ...createCandidateWhenObserved(
      'only-emojis',
      100,
      'a message with only emojis',
      { kind: 'onlyEmojis' },
      stats.onlyEmojis
    ),
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
}

export function getBountyHuntingObservedMessage(
  message: HTMLElement,
  options: BountyHuntingObservedMessageOptions = {}
): BountyHuntingObservedMessage | null {
  const text = getMessageText(message);
  const isSuperChat = isBountyHuntingSuperChatMessage(message);
  if (!text && !isSuperChat) return null;
  const emojiCount = countBountyHuntingMessageEmojis(message);
  const authorKey = getBountyHuntingAuthorKey(getAuthorName(message));

  return {
    emojiCount,
    hasAllCaps: isBountyHuntingAllCapsMessage(text),
    hasCustomEmoji: hasBountyHuntingCustomEmoji(message),
    hasMention: /(^|\s)@[\p{L}\p{N}._-]{2,}/u.test(text),
    hasNumber: /\p{N}/u.test(text),
    hasOnlyEmojis: isBountyHuntingOnlyEmojiMessage(message, text, emojiCount),
    hasQuestion: /[?？]/u.test(text),
    isChannelMemberAuthor: hasBountyHuntingAuthorBadge(message, 'member'),
    isChannelOwnerAuthor: hasBountyHuntingAuthorBadge(message, 'owner'),
    isModeratorAuthor: hasBountyHuntingAuthorBadge(message, 'moderator'),
    isSuperChat,
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
    channelMemberAuthors: 0,
    channelOwnerAuthors: 0,
    customEmojis: 0,
    emojiHeavy: 0,
    mentions: 0,
    moderatorAuthors: 0,
    numbers: 0,
    onlyEmojis: 0,
    questions: 0,
    superChats: 0,
    topFanAuthors: 0,
    verifiedAuthors: 0
  };

  messages.forEach((message) => {
    if (message.emojiCount >= 3) stats.emojiHeavy += 1;
    if (message.hasAllCaps) stats.allCaps += 1;
    if (message.hasCustomEmoji) stats.customEmojis += 1;
    if (message.hasQuestion) stats.questions += 1;
    if (message.hasMention) stats.mentions += 1;
    if (message.hasNumber) stats.numbers += 1;
    if (message.hasOnlyEmojis) stats.onlyEmojis += 1;
    if (message.isChannelMemberAuthor) stats.channelMemberAuthors += 1;
    if (message.isChannelOwnerAuthor) stats.channelOwnerAuthors += 1;
    if (message.isModeratorAuthor) stats.moderatorAuthors += 1;
    if (message.isSuperChat) stats.superChats += 1;
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
    observedCount,
    score: observedCount > 0 ? observedCount * 10 + amount / 25 : amount / 100
  };
}

function createCandidateWhenObserved(
  id: string,
  amount: number,
  description: string,
  matcher: BountyHuntingBountyMatcher,
  observedCount: number
): BountyCandidate[] {
  return observedCount > 0
    ? [createCandidate(id, amount, description, matcher, observedCount)]
    : [];
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

function hasBountyHuntingCustomEmoji(message: HTMLElement): boolean {
  const runs = getMessageRuns(message);
  if (runs?.some((run) => {
    const shortcut = cleanText(run.emoji?.shortcuts?.[0] || '');
    return Boolean(run.emoji?.emojiId || CUSTOM_EMOJI_SHORTCUT_PATTERN.test(shortcut));
  })) {
    return true;
  }

  const selector = [
    'img[shared-tooltip-text^=":"]',
    'img[alt^=":"]',
    '[data-emoji-id]'
  ].join(',');
  try {
    return Boolean(message.querySelector(selector));
  } catch {
    return false;
  }
}

function isBountyHuntingOnlyEmojiMessage(message: HTMLElement, text: string, emojiCount: number): boolean {
  if (emojiCount <= 0) return false;

  const runs = getMessageRuns(message);
  if (runs?.length) {
    return runs.every((run) => Boolean(run.emoji) || !cleanText(run.text || ''));
  }

  const messageText = message.querySelector<HTMLElement>('#message');
  if (messageText) {
    const nodes = Array.from(messageText.childNodes);
    const hasNonEmojiNode = nodes.some((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return hasBountyHuntingNonEmojiText(node.textContent || '');
      }
      if (node instanceof HTMLElement) {
        return !node.matches('img[alt], img[shared-tooltip-text], [data-emoji-id], [class*="emoji" i]');
      }
      return false;
    });
    return !hasNonEmojiNode;
  }

  return !hasBountyHuntingNonEmojiText(text);
}

function hasBountyHuntingNonEmojiText(value: string): boolean {
  return Boolean(cleanText(value.replace(/\p{Extended_Pictographic}/gu, '')).replace(/\s/g, ''));
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

function hasBountyHuntingAuthorBadge(
  message: HTMLElement,
  type: 'member' | 'moderator' | 'owner'
): boolean {
  const labelPattern = getBountyHuntingAuthorBadgePattern(type);
  const typeValues = getBountyHuntingAuthorBadgeTypeValues(type);
  const badges = message.querySelectorAll<HTMLElement>('yt-live-chat-author-badge-renderer');

  for (const badge of badges) {
    const badgeType = cleanText(badge.getAttribute('type')).toLocaleLowerCase();
    if (typeValues.includes(badgeType)) return true;
    const label = cleanText([
      badge.getAttribute('aria-label'),
      badge.getAttribute('title')
    ].join(' '));
    if (labelPattern.test(label)) return true;
  }

  return false;
}

function getBountyHuntingAuthorBadgePattern(type: 'member' | 'moderator' | 'owner'): RegExp {
  switch (type) {
    case 'member':
      return /\bmember\b/i;
    case 'moderator':
      return /\bmoderator\b/i;
    case 'owner':
      return /\b(?:owner|creator)\b/i;
  }
}

function getBountyHuntingAuthorBadgeTypeValues(type: 'member' | 'moderator' | 'owner'): string[] {
  switch (type) {
    case 'member':
      return ['member', 'membership'];
    case 'moderator':
      return ['moderator'];
    case 'owner':
      return ['owner', 'creator'];
  }
}

function isBountyHuntingSuperChatMessage(message: HTMLElement): boolean {
  return message.matches('yt-live-chat-paid-message-renderer, yt-live-chat-paid-sticker-renderer');
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
