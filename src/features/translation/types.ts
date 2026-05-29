/**
 * Translation type definitions.
 *
 * Shared data shapes for rendered translation results and local mirrors of
 * message translation state in profile cards, focus mode, and other consumers.
 */
import type { ProtectedToken } from './protected-placeholders';

export interface TranslationResult {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface MessageTranslationRecord {
  result: TranslationResult;
  sourceText: string;
  originalText: string;
  protectedTokens: ProtectedToken[];
}
