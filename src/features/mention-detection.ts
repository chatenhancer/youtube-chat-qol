/**
 * Current-user mention detection.
 *
 * YouTube does not expose a stable extension API for the signed-in chat handle,
 * so this module derives likely @handle candidates from native chat identity
 * surfaces as the shared content lifecycle sees them. Feature modules can then
 * process message renderers through the same detection path without
 * duplicating selectors.
 */
import { registerFeatureLifecycle, type FeatureMutationBatch } from '../content/lifecycle';
import { cleanText, normalizeComparableText } from '../shared/text';
import { getMessageDetails } from '../youtube/messages';

const MAX_PENDING_MENTION_MESSAGES = 40;
const IDENTITY_CONTAINER_SELECTOR = [
  'yt-live-chat-message-input-renderer',
  'yt-live-chat-viewer-engagement-message-renderer'
].join(',');
const IDENTITY_SELECTORS = [
  'yt-live-chat-message-input-renderer #author-name',
  'yt-live-chat-message-input-renderer [id*="author"]',
  'yt-live-chat-viewer-engagement-message-renderer #author-name'
];
const IDENTITY_MATCH_SELECTOR = [
  IDENTITY_CONTAINER_SELECTOR,
  ...IDENTITY_SELECTORS
].join(',');

type MentionProcessor = (message: HTMLElement) => void;

let cachedMentionKey = '';
let cachedMentionCandidates: string[] = [];
let mentionIdentityRefreshTimer: number | null = null;
const pendingMentionMessages = new Set<HTMLElement>();
const mentionProcessors = new Set<MentionProcessor>();

registerFeatureLifecycle({
  page: {
    init: initMentionDetection,
    boot: refreshMentionCandidates,
    cleanupStale: resetMentionDetectionTimer,
    reset: resetMentionDetectionTimer
  },
  mutation: { collect: handleMentionIdentityMutations }
});

export function initMentionDetection(): void {
  refreshMentionCandidates();
}

export function registerMentionProcessor(processor: MentionProcessor): void {
  mentionProcessors.add(processor);
}

export function getCurrentMentionCandidates(): string[] {
  return [...getMentionCandidates()];
}

export function isCurrentUserAuthorName(authorName: string): boolean {
  const candidates = getMentionCandidates();
  if (!candidates.length) return false;

  const authorHandles = getCandidateHandles(authorName, { allowPlainHandle: true });
  return authorHandles.some((authorHandle) => candidates.includes(authorHandle));
}

export function processPotentialMentionForConsumer(
  message: HTMLElement,
  checkedDatasetKey: string,
  onMention: () => void
): void {
  if (message.dataset[checkedDatasetKey] === 'true') return;
  if (!message.isConnected) return;

  const candidates = getMentionCandidates();
  if (!candidates.length) {
    trackPendingMentionMessage(message);
    return;
  }

  pendingMentionMessages.delete(message);
  message.dataset[checkedDatasetKey] = 'true';
  if (!isMentionForCurrentUser(message, candidates)) return;
  onMention();
}

function getMentionCandidates(): string[] {
  if (!cachedMentionCandidates.length) {
    refreshMentionCandidates();
  }

  return cachedMentionCandidates;
}

function isMentionForCurrentUser(message: HTMLElement, candidates: string[]): boolean {
  const details = getMessageDetails(message);
  if (!details.text) return false;
  const authorHandles = getCandidateHandles(details.authorName, { allowPlainHandle: true });

  const text = normalizeMessageText(details.text);
  return candidates
    .filter((candidate) => !authorHandles.includes(candidate))
    .some((candidate) => textContainsHandle(text, candidate));
}

function refreshMentionCandidates(): void {
  const rawCandidates = getRawMentionCandidates();
  const key = rawCandidates.join('\n');
  if (key === cachedMentionKey) return;

  cachedMentionKey = key;
  cachedMentionCandidates = Array.from(new Set(
    rawCandidates.flatMap((candidate) => getCandidateHandles(candidate, {
      allowPlainHandle: true
    }))
      .filter((candidate) => candidate.length >= 3)
  ));

  if (cachedMentionCandidates.length) {
    flushPendingMentionMessages();
  }
}

function getRawMentionCandidates(): string[] {
  const localCandidates = IDENTITY_SELECTORS
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .map((element) => cleanText(element.textContent || ''));

  return localCandidates.filter(Boolean);
}

function scheduleMentionCandidateRefresh(): void {
  if (mentionIdentityRefreshTimer !== null) return;
  mentionIdentityRefreshTimer = window.setTimeout(() => {
    mentionIdentityRefreshTimer = null;
    refreshMentionCandidates();
  }, 0);
}

function handleMentionIdentityMutations({ mutations }: FeatureMutationBatch): void {
  if (mutations.some(mutationMayChangeMentionIdentity)) {
    scheduleMentionCandidateRefresh();
  }
}

function resetMentionDetectionTimer(): void {
  if (mentionIdentityRefreshTimer === null) return;
  window.clearTimeout(mentionIdentityRefreshTimer);
  mentionIdentityRefreshTimer = null;
}

function mutationMayChangeMentionIdentity(mutation: MutationRecord): boolean {
  if (mutation.target instanceof Element && elementTouchesIdentity(mutation.target)) {
    return true;
  }

  if (
    mutation.type === 'characterData' &&
    mutation.target.parentElement &&
    elementTouchesIdentity(mutation.target.parentElement)
  ) {
    return true;
  }

  return Array.from(mutation.addedNodes)
    .some((node) => node instanceof Element && (
      elementTouchesIdentity(node) ||
      Boolean(node.querySelector(IDENTITY_MATCH_SELECTOR))
    ));
}

function elementTouchesIdentity(element: Element): boolean {
  return Boolean(
    element.matches(IDENTITY_CONTAINER_SELECTOR) ||
    element.closest(IDENTITY_CONTAINER_SELECTOR)
  );
}

function trackPendingMentionMessage(message: HTMLElement): void {
  pendingMentionMessages.add(message);
  if (pendingMentionMessages.size <= MAX_PENDING_MENTION_MESSAGES) return;

  const oldestMessage = pendingMentionMessages.values().next().value;
  if (oldestMessage) {
    pendingMentionMessages.delete(oldestMessage);
  }
}

function flushPendingMentionMessages(): void {
  const messages = Array.from(pendingMentionMessages);
  pendingMentionMessages.clear();
  messages.forEach((message) => {
    if (!message.isConnected) return;
    mentionProcessors.forEach((processor) => {
      processor(message);
    });
  });
}

function getCandidateHandles(value: string, { allowPlainHandle }: { allowPlainHandle: boolean }): string[] {
  const clean = cleanText(value);
  const handles = [
    ...Array.from(clean.matchAll(/@[\p{L}\p{N}._-]{2,}/gu)).map((match) => match[0]),
    ...Array.from(clean.matchAll(/\/@([\p{L}\p{N}._-]{2,})/gu)).map((match) => `@${match[1]}`)
  ];

  if (allowPlainHandle && /^[\p{L}\p{N}._-]{3,}$/u.test(clean)) {
    handles.push(`@${clean}`);
  }

  return handles.map(normalizeHandle);
}

function normalizeHandle(value: string): string {
  const normalized = normalizeMessageText(value).replace(/^@+/, '');
  return normalized ? `@${normalized}` : '';
}

function normalizeMessageText(value: string): string {
  return normalizeComparableText(value);
}

function textContainsHandle(text: string, handle: string): boolean {
  if (!handle) return false;
  let index = text.indexOf(handle);

  while (index >= 0) {
    const before = index > 0 ? text[index - 1] : '';
    const after = text[index + handle.length] || '';
    if (!isHandleCharacter(before) && !isHandleCharacter(after)) return true;
    index = text.indexOf(handle, index + handle.length);
  }

  return false;
}

function isHandleCharacter(value: string): boolean {
  return Boolean(value && /[\p{L}\p{N}._-]/u.test(value));
}
