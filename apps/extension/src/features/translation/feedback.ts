import { t } from '../../shared/i18n';
import { showToast } from '../../shared/toast';
import { TranslationRateLimitError } from '../../shared/translation-errors';

export function showTranslationError(error: unknown): void {
  if (error instanceof TranslationRateLimitError) {
    showToast(t('translationRateLimited'), { durationMs: 6_000, tone: 'error' });
  } else {
    showToast(t('couldNotTranslateText'));
  }
}
