/**
 * Per-stream chat input draft storage.
 *
 * Drafts stay in local extension storage because they are contextual to one
 * browser/profile and one YouTube stream, not a synchronized preference.
 */
import { getYouTubeChatSourceStorageKey } from '../../youtube/source-url';
import type { ChatInputSnapshot } from '../../youtube/chat-input';
import {
  normalizeRichTextSegments,
  serializeRichMessageNodes,
  type RichTextSegment
} from '../../youtube/rich-text';

export const CHAT_INPUT_DRAFTS_STORAGE_KEY = 'ytcqChatInputDrafts';

const MAX_STORED_DRAFTS = 50;
const MAX_DRAFT_TEXT_LENGTH = 2000;

export interface ChatInputDraftRecord {
  sourceUrl: string;
  text: string;
  contentParts: RichTextSegment[];
  updatedAt: number;
}

export interface ChatInputDraftContent {
  text: string;
  contentParts: RichTextSegment[];
}

type ChatInputDraftMap = Record<string, ChatInputDraftRecord>;

export function loadChatInputDraft(sourceUrl: string): Promise<ChatInputDraftContent> {
  const draftKey = getChatInputDraftKey(sourceUrl);

  return readStoredDrafts().then((drafts) => {
    const draft = drafts[draftKey];
    return draft ? toDraftContent(draft) : emptyDraftContent();
  });
}

export function saveChatInputDraft(sourceUrl: string, draft: ChatInputDraftContent): Promise<void> {
  const draftKey = getChatInputDraftKey(sourceUrl);
  const nextDraft = normalizeDraftContent(draft);

  return readStoredDrafts().then((drafts) => {
    const nextDrafts = { ...drafts };
    if (nextDraft.text.trim()) {
      nextDrafts[draftKey] = {
        sourceUrl,
        ...nextDraft,
        updatedAt: Date.now()
      };
    } else {
      delete nextDrafts[draftKey];
    }

    return writeStoredDrafts(trimStoredDrafts(nextDrafts));
  });
}

export function createChatInputDraftContent(snapshot: ChatInputSnapshot | null): ChatInputDraftContent {
  if (!snapshot) return emptyDraftContent();

  const contentParts = serializeRichMessageNodes(snapshot.childNodes);
  return normalizeDraftContent({
    text: snapshot.text,
    contentParts: contentParts.length || !snapshot.text
      ? contentParts
      : [{ type: 'text', text: snapshot.text }]
  });
}

export function getChatInputDraftKey(sourceUrl: string): string {
  return getYouTubeChatSourceStorageKey(sourceUrl);
}

function readStoredDrafts(): Promise<ChatInputDraftMap> {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [CHAT_INPUT_DRAFTS_STORAGE_KEY]: {} }, (stored) => {
      resolve(normalizeStoredDrafts(stored?.[CHAT_INPUT_DRAFTS_STORAGE_KEY]));
    });
  });
}

function writeStoredDrafts(drafts: ChatInputDraftMap): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CHAT_INPUT_DRAFTS_STORAGE_KEY]: drafts }, resolve);
  });
}

function normalizeStoredDrafts(value: unknown): ChatInputDraftMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, draft]) => [key, normalizeStoredDraft(draft)] as const)
      .filter((entry): entry is [string, ChatInputDraftRecord] => Boolean(entry[1]))
  );
}

function normalizeStoredDraft(value: unknown): ChatInputDraftRecord | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ChatInputDraftRecord>;
  const text = normalizeDraftText(candidate.text || '');
  const sourceUrl = String(candidate.sourceUrl || '');
  const updatedAt = Number(candidate.updatedAt);
  const contentParts = normalizeRichTextSegments(candidate.contentParts);
  if (
    !text.trim() ||
    !sourceUrl ||
    !Number.isFinite(updatedAt) ||
    !Array.isArray(candidate.contentParts) ||
    !contentParts.length
  ) {
    return null;
  }

  return {
    sourceUrl,
    text,
    contentParts,
    updatedAt
  };
}

function normalizeDraftContent(value: ChatInputDraftContent): ChatInputDraftContent {
  return {
    text: normalizeDraftText(value.text || ''),
    contentParts: normalizeRichTextSegments(value.contentParts)
  };
}

function toDraftContent(record: ChatInputDraftRecord): ChatInputDraftContent {
  return {
    text: record.text,
    contentParts: record.contentParts
  };
}

function emptyDraftContent(): ChatInputDraftContent {
  return {
    text: '',
    contentParts: []
  };
}

function normalizeDraftText(value: string): string {
  return String(value || '').slice(0, MAX_DRAFT_TEXT_LENGTH);
}

function trimStoredDrafts(drafts: ChatInputDraftMap): ChatInputDraftMap {
  return Object.fromEntries(
    Object.entries(drafts)
      .sort(([, first], [, second]) => second.updatedAt - first.updatedAt)
      .slice(0, MAX_STORED_DRAFTS)
  );
}
