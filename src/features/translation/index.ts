/**
 * Translation feature entrypoint.
 *
 * Loading this module registers translation lifecycle hooks. Queue/cache
 * behavior stays in `queue.ts`, while this entrypoint owns the feature wiring
 * so helper imports do not accidentally boot translation.
 */
import type { Options } from '../../shared/options';
import { getOptions } from '../../shared/state';
import { registerFeatureLifecycle, type FeatureMessageContext } from '../../content/lifecycle';
import { clearTranslations, queueMessageTranslation, queueRetroactiveTranslations } from './queue';

registerFeatureLifecycle({
  page: {
    boot: queueRetroactiveTranslations,
    cleanupStale: clearTranslations,
    optionsChanged: handleTranslationOptionsChanged,
    reset: clearTranslations,
    visibleRecovery: queueRetroactiveTranslations
  },
  message: { render: handleTranslationMessage }
});

function handleTranslationOptionsChanged(previousOptions: Options, nextOptions: Options): void {
  const languageChanged = nextOptions.targetLanguage !== previousOptions.targetLanguage;
  const displayChanged = nextOptions.translationDisplay !== previousOptions.translationDisplay;
  if (!languageChanged && !displayChanged) return;

  clearTranslations();
  if (nextOptions.targetLanguage) queueRetroactiveTranslations();
}

function handleTranslationMessage(
  message: HTMLElement,
  { source }: Pick<FeatureMessageContext, 'source'>
): void {
  if (!getOptions().targetLanguage) return;
  if (source === 'existing' && message.classList.contains('ytcq-lite-message')) {
    // Lite mode replaces the native history with fresh elements. Backfill only
    // those rows so cached native translations carry across immediately while
    // untranslated history continues through the normal bounded queue.
    queueMessageTranslation(message, { backfill: true });
    return;
  }
  if (source !== 'added' && source !== 'changed') return;
  if (source === 'changed' && message.dataset.ytcqTranslationKey) return;

  queueMessageTranslation(message);
}
