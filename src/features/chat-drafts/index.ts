/**
 * Chat input draft recovery.
 *
 * Saves unsent composer text in local extension storage and restores it after a
 * page refresh. Drafts are scoped per YouTube stream so text from one live chat
 * does not appear in another.
 */
import { registerFeatureLifecycle } from '../../content/lifecycle';
import {
  findChatInput,
  getChatInputSnapshot,
  getChatInputText,
  replaceChatInputSnapshot
} from '../../youtube/chat-input';
import { createRichTextSegmentNodes } from '../../youtube/rich-text';
import { getCurrentYouTubeChatSourceUrl } from '../../youtube/source-url';
import { SEND_BUTTON_SELECTOR } from '../../youtube/selectors';
import {
  createChatInputDraftContent,
  type ChatInputDraftContent,
  loadChatInputDraft,
  saveChatInputDraft
} from './storage';

const CHAT_INPUT_RENDERER_SELECTOR = 'yt-live-chat-message-input-renderer';
const CHAT_INPUT_EMOJI_CLASS = 'emoji yt-formatted-string style-scope yt-live-chat-text-input-field-renderer';
const DRAFT_SAVE_DEBOUNCE_MS = 250;
const POST_SEND_SAVE_DELAY_MS = 500;
const DRAFT_RESTORE_DELAYS_MS = [100, 300, 800, 1500, 3000, 5000];
const DRAFT_RESTORE_VERIFY_DELAYS_MS = [500, 1500, 3000];

let saveTimer = 0;
let restoreTimer = 0;
let restoreVerificationTimer = 0;
let restoreAttempt = 0;
let restoreFinished = false;
let replacingDraft = false;
let chatInputDraftListeners = new AbortController();

registerFeatureLifecycle({
  page: {
    init: initChatInputDrafts,
    boot: scheduleChatInputDraftRestore,
    cleanupStale: cleanupStaleChatInputDrafts,
    reset: resetChatInputDrafts
  },
  mutation: {
    enhance: ({ addedElements }) => {
      if (addedElements.some(shouldWatchForChatInput)) {
        scheduleChatInputDraftRestore(true);
      }
    }
  }
});

export function initChatInputDrafts(): void {
  const options = { capture: true, signal: chatInputDraftListeners.signal };
  document.addEventListener('input', handleDocumentInput, options);
  document.addEventListener('keydown', handleDocumentKeydown, options);
  document.addEventListener('click', handleDocumentClick, options);
  window.addEventListener('pagehide', flushChatInputDraftSave, { signal: chatInputDraftListeners.signal });
}

export function resetChatInputDrafts(): void {
  clearSaveTimer();
  clearRestoreTimer();
  clearRestoreVerificationTimer();
  restoreAttempt = 0;
  restoreFinished = false;
  replacingDraft = false;
}

export function cleanupStaleChatInputDrafts(): void {
  chatInputDraftListeners.abort();
  chatInputDraftListeners = new AbortController();
  resetChatInputDrafts();
}

export function scheduleChatInputDraftRestore(immediate = false): void {
  if (restoreFinished || restoreTimer) return;

  const delay = immediate ? 0 : DRAFT_RESTORE_DELAYS_MS[restoreAttempt];
  if (delay === undefined) return;

  restoreTimer = window.setTimeout(() => {
    restoreTimer = 0;
    restoreAttempt += 1;
    void restoreChatInputDraft();
  }, delay);
}

export async function restoreChatInputDraft(sourceUrl = getCurrentYouTubeChatSourceUrl()): Promise<boolean> {
  if (restoreFinished || !sourceUrl) return false;

  const input = findChatInput();
  if (!input) {
    scheduleChatInputDraftRestore();
    return false;
  }

  if (getChatInputText().trim()) {
    if (!restoreVerificationTimer) restoreFinished = true;
    return false;
  }

  const draft = await loadChatInputDraft(sourceUrl);
  if (!draft.text.trim()) {
    scheduleChatInputDraftRestore();
    return false;
  }

  const restored = replaceStoredDraftContent(draft);
  if (restored) {
    scheduleRestoredDraftVerification(draft);
  } else {
    scheduleChatInputDraftRestore();
  }
  return restored;
}

export async function saveCurrentChatInputDraft(sourceUrl = getCurrentYouTubeChatSourceUrl()): Promise<void> {
  if (!sourceUrl) return;
  await saveChatInputDraft(sourceUrl, createChatInputDraftContent(getChatInputSnapshot()));
}

function handleDocumentInput(event: Event): void {
  if (replacingDraft || !isFromChatInput(event.target)) return;
  restoreFinished = true;
  scheduleChatInputDraftSave();
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey || !isFromChatInput(event.target)) return;
  schedulePostSendDraftSave();
}

function handleDocumentClick(event: MouseEvent): void {
  if (!(event.target instanceof Element) || !event.target.closest(SEND_BUTTON_SELECTOR)) return;
  schedulePostSendDraftSave();
}

function scheduleChatInputDraftSave(): void {
  clearSaveTimer();
  saveTimer = window.setTimeout(() => {
    saveTimer = 0;
    void saveCurrentChatInputDraft();
  }, DRAFT_SAVE_DEBOUNCE_MS);
}

function schedulePostSendDraftSave(): void {
  window.setTimeout(() => {
    void saveCurrentChatInputDraft();
  }, POST_SEND_SAVE_DELAY_MS);
}

function flushChatInputDraftSave(): void {
  if (!saveTimer) return;
  clearSaveTimer();
  void saveCurrentChatInputDraft();
}

function clearSaveTimer(): void {
  if (!saveTimer) return;
  window.clearTimeout(saveTimer);
  saveTimer = 0;
}

function clearRestoreTimer(): void {
  if (!restoreTimer) return;
  window.clearTimeout(restoreTimer);
  restoreTimer = 0;
}

function clearRestoreVerificationTimer(): void {
  if (!restoreVerificationTimer) return;
  window.clearTimeout(restoreVerificationTimer);
  restoreVerificationTimer = 0;
}

function replaceStoredDraftContent(draft: ChatInputDraftContent): boolean {
  replacingDraft = true;
  try {
    return replaceChatInputSnapshot({
      childNodes: createRichTextSegmentNodes(draft.contentParts, {
        emojiClassName: CHAT_INPUT_EMOJI_CLASS,
        includeEmojiIdAsElementId: true
      }),
      text: draft.text
    });
  } finally {
    window.setTimeout(() => {
      replacingDraft = false;
    }, 0);
  }
}

function scheduleRestoredDraftVerification(draft: ChatInputDraftContent, attempt = 0): void {
  clearRestoreVerificationTimer();

  const delay = DRAFT_RESTORE_VERIFY_DELAYS_MS[attempt];
  if (delay === undefined) {
    restoreFinished = true;
    return;
  }

  restoreVerificationTimer = window.setTimeout(() => {
    restoreVerificationTimer = 0;
    if (restoreFinished) return;

    const currentText = getChatInputText();
    if (currentText === draft.text) {
      scheduleRestoredDraftVerification(draft, attempt + 1);
      return;
    }
    if (currentText.trim()) {
      restoreFinished = true;
      return;
    }

    if (replaceStoredDraftContent(draft)) {
      scheduleRestoredDraftVerification(draft, attempt + 1);
    } else {
      scheduleChatInputDraftRestore();
    }
  }, delay);
}

function isFromChatInput(target: EventTarget | null): boolean {
  const input = findChatInput();
  return Boolean(input && target instanceof Node && (input === target || input.contains(target)));
}

function shouldWatchForChatInput(element: Element): boolean {
  return Boolean(
    element.matches(CHAT_INPUT_RENDERER_SELECTOR) ||
    element.querySelector(CHAT_INPUT_RENDERER_SELECTOR)
  );
}
