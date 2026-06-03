/**
 * Translation feature entrypoint.
 *
 * Loading this module registers translation lifecycle hooks. Queue/cache
 * behavior stays in `queue.ts`, while this entrypoint owns the feature wiring
 * so helper imports do not accidentally boot translation.
 */
import type { Options } from '../../shared/options';
import { getOptions } from '../../shared/state';
import { registerFeatureLifecycle } from '../../content/lifecycle';
import { clearTranslations, queueMessageTranslation, queueRetroactiveTranslations } from './queue';

registerFeatureLifecycle({
  page: {
    boot: queueRetroactiveTranslations,
    cleanupStale: clearTranslations,
    optionsChanged: handleTranslationOptionsChanged,
    reset: clearTranslations,
    visibleRecovery: queueRetroactiveTranslations
  },
  message: { render: handleTranslationMessage },
  mutation: { render: handleTranslationMutations }
});

function handleTranslationOptionsChanged(previousOptions: Options, nextOptions: Options): void {
  const languageChanged = nextOptions.targetLanguage !== previousOptions.targetLanguage;
  const displayChanged = nextOptions.translationDisplay !== previousOptions.translationDisplay;
  if (!languageChanged && !displayChanged) return;

  clearTranslations();
  if (nextOptions.targetLanguage) queueRetroactiveTranslations();
}

function handleTranslationMessage(message: HTMLElement, { allowTranslate }: { allowTranslate: boolean }): void {
  if (allowTranslate && getOptions().targetLanguage) {
    queueMessageTranslation(message);
  }
}

function handleTranslationMutations({ changedMessages }: { changedMessages: HTMLElement[] }): void {
  if (!getOptions().targetLanguage) return;

  changedMessages.forEach((message) => {
    if (message.dataset.ytcqTranslationKey) return;
    queueMessageTranslation(message);
  });
}
