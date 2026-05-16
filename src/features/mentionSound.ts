/**
 * Mention sound detection.
 *
 * The signed-in chat handle is read from YouTube's message input author chip
 * and cached once it appears. New incoming messages are checked for explicit
 * @handle mentions while own-authored messages are ignored.
 */
import { getOptions } from '../shared/state';
import { cleanText } from '../shared/text';
import { getMessageDetails } from '../youtube/messages';

const MENTION_COOLDOWN_MS = 1400;
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

let lastMentionSoundAt = 0;
let audioContext: AudioContext | null = null;
let cachedMentionKey = '';
let cachedMentionCandidates: string[] = [];
let mentionIdentityObserver: MutationObserver | null = null;
let mentionIdentityRefreshTimer: number | null = null;
const pendingMentionMessages = new Set<HTMLElement>();

export function initMentionSound(): void {
  refreshMentionCandidates();
  if (mentionIdentityObserver || !document.documentElement) return;

  mentionIdentityObserver = new MutationObserver((mutations) => {
    if (mutations.some(mutationMayChangeMentionIdentity)) {
      scheduleMentionCandidateRefresh();
    }
  });

  mentionIdentityObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

export function handlePotentialMention(message: HTMLElement): void {
  if (!getOptions().mentionSound) return;
  if (message.dataset.ytcqMentionSoundChecked === 'true') return;
  if (!message.isConnected) return;

  const candidates = getMentionCandidates();
  if (!candidates.length) {
    trackPendingMentionMessage(message);
    return;
  }

  pendingMentionMessages.delete(message);
  message.dataset.ytcqMentionSoundChecked = 'true';
  if (!isMentionForCurrentUser(message, candidates)) return;
  playMentionBlip();
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
    .some((node) => node instanceof Element && elementTouchesIdentity(node));
}

function elementTouchesIdentity(element: Element): boolean {
  return Boolean(
    element.matches(IDENTITY_CONTAINER_SELECTOR) ||
    element.closest(IDENTITY_CONTAINER_SELECTOR) ||
    element.querySelector(IDENTITY_CONTAINER_SELECTOR)
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
    if (message.isConnected) {
      handlePotentialMention(message);
    }
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
  return cleanText(value)
    .toLocaleLowerCase()
    .normalize('NFKC');
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

function playMentionBlip(): void {
  const now = Date.now();
  if (now - lastMentionSoundAt < MENTION_COOLDOWN_MS) return;
  lastMentionSoundAt = now;

  try {
    const AudioContextConstructor = window.AudioContext || (window as Window & {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;
    if (!AudioContextConstructor) return;

    audioContext ||= new AudioContextConstructor();
    void audioContext.resume();

    const start = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, start);
    oscillator.frequency.exponentialRampToValueAtTime(1320, start + 0.075);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.08, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.2);
  } catch {
    // Browser autoplay and audio-device failures should not affect chat.
  }
}
