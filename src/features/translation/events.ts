/**
 * Translation feature events.
 *
 * The translation queue owns network work and live-chat rendering. Other
 * features can subscribe here to mirror translation state into their own local
 * records without the queue importing those consumers directly.
 */
import type { ProtectedToken } from './protected-placeholders';
import type { TranslationResult } from './types';

export interface MessageTranslationRenderedEvent {
  message: HTMLElement;
  originalText: string;
  protectedTokens: ProtectedToken[];
  result: TranslationResult;
  sourceText: string;
}

export interface MessageTranslationClearedEvent {
  message: HTMLElement;
}

type MessageTranslationRenderedListener = (event: MessageTranslationRenderedEvent) => void;
type MessageTranslationClearedListener = (event: MessageTranslationClearedEvent) => void;
type MessageTranslationsClearedListener = () => void;
type TranslationTextRenderedListener = (messageText: HTMLElement) => void;

const renderedListeners = new Set<MessageTranslationRenderedListener>();
const clearedListeners = new Set<MessageTranslationClearedListener>();
const allClearedListeners = new Set<MessageTranslationsClearedListener>();
const textRenderedListeners = new Set<TranslationTextRenderedListener>();

export function onMessageTranslationRendered(listener: MessageTranslationRenderedListener): () => void {
  renderedListeners.add(listener);
  return () => renderedListeners.delete(listener);
}

export function onMessageTranslationCleared(listener: MessageTranslationClearedListener): () => void {
  clearedListeners.add(listener);
  return () => clearedListeners.delete(listener);
}

export function onMessageTranslationsCleared(listener: MessageTranslationsClearedListener): () => void {
  allClearedListeners.add(listener);
  return () => allClearedListeners.delete(listener);
}

export function onTranslationTextRendered(listener: TranslationTextRenderedListener): () => void {
  textRenderedListeners.add(listener);
  return () => textRenderedListeners.delete(listener);
}

export function emitMessageTranslationRendered(event: MessageTranslationRenderedEvent): void {
  renderedListeners.forEach((listener) => listener(event));
}

export function emitMessageTranslationCleared(message: HTMLElement): void {
  const event = { message };
  clearedListeners.forEach((listener) => listener(event));
}

export function emitMessageTranslationsCleared(): void {
  allClearedListeners.forEach((listener) => listener());
}

export function emitTranslationTextRendered(messageText: HTMLElement): void {
  textRenderedListeners.forEach((listener) => listener(messageText));
}
