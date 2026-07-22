/**
 * Current-user mention detection.
 *
 * YouTube does not expose a stable extension API for the signed-in chat handle,
 * so this module derives likely @handle candidates from native chat identity
 * surfaces as the shared content lifecycle sees them. Feed consumers use the
 * normalized candidates without duplicating identity selectors.
 */
import { registerFeature, type FeatureMutationBatch } from '../content/dispatcher';
import { cleanText, normalizeComparableText } from '../shared/text';
import { cleanAuthorNameText } from '../youtube/authors';

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

type MentionCandidatesChangedListener = (candidates: readonly string[]) => void;

let cachedMentionKey = '';
let cachedMentionCandidates: string[] = [];
let mentionIdentityRefreshTimer: number | null = null;
const mentionCandidatesChangedListeners = new Set<MentionCandidatesChangedListener>();

registerFeature({
  page: {
    init: initMentionDetection,
    boot: refreshMentionCandidates,
    cleanup: resetMentionDetectionTimer,
    reset: resetMentionDetectionTimer
  },
  mutation: handleMentionIdentityMutations
});

export function initMentionDetection(): void {
  refreshMentionCandidates();
}

export function onMentionCandidatesChanged(
  listener: MentionCandidatesChangedListener
): () => void {
  mentionCandidatesChangedListeners.add(listener);
  return () => mentionCandidatesChangedListeners.delete(listener);
}

export function getCurrentMentionCandidates(): string[] {
  return [...getMentionCandidates()];
}

export function getCurrentMentionDisplayHandle(): string {
  return getRawMentionCandidates()
    .map(getDisplayHandleCandidate)
    .find(Boolean) || '';
}

export function isCurrentUserAuthorName(authorName: string): boolean {
  const candidates = getMentionCandidates();
  if (!candidates.length) return false;

  const authorHandles = getCandidateHandles(authorName, { allowPlainHandle: true });
  return authorHandles.some((authorHandle) => candidates.includes(authorHandle));
}

function getMentionCandidates(): string[] {
  if (!cachedMentionCandidates.length) {
    refreshMentionCandidates();
  }

  return cachedMentionCandidates;
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

  const candidates = [...cachedMentionCandidates];
  mentionCandidatesChangedListeners.forEach((listener) => listener(candidates));
}

function getRawMentionCandidates(): string[] {
  const localCandidates = IDENTITY_SELECTORS
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .map((element) => cleanText(element.textContent || ''));

  return localCandidates.filter(Boolean);
}

function getDisplayHandleCandidate(value: string): string {
  const clean = cleanText(value);
  const embeddedHandle = clean.match(/@[\p{L}\p{N}._-]{2,}/u)?.[0] || '';
  if (embeddedHandle) return embeddedHandle;

  const authorName = cleanAuthorNameText(clean);
  if (/^@[\p{L}\p{N}._-]{2,}$/u.test(authorName)) return authorName;
  return /^[\p{L}\p{N}._-]{3,}$/u.test(authorName) ? `@${authorName}` : '';
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
  const normalized = normalizeComparableText(value).replace(/^@+/, '');
  return normalized ? `@${normalized}` : '';
}
