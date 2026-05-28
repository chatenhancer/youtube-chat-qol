/**
 * Unwatch command.
 *
 * Removes watched Inbox keywords or phrases using the same quoted-phrase
 * parsing rules as /watch.
 */
import { t } from '../../../shared/i18n';
import { showToast } from '../../../shared/toast';
import { getLoadedInboxKeywords, removeInboxKeywords } from '../../inbox';
import {
  formatUnwatchKeywordResult,
  parseKeywordCommandArguments
} from '../keywords';
import type { ChatCommandDefinition, ChatCommandRuntime, ParsedCommand } from '../types';

export function createUnwatchCommand(runtime: ChatCommandRuntime): ChatCommandDefinition {
  return {
    argumentOptions: () => getLoadedInboxKeywords().map((keyword) => ({
      description: t('removeWatchedKeyword'),
      label: keyword,
      value: keyword.includes(' ') ? `"${keyword}"` : keyword
    })),
    helpDescriptionKey: 'commandHelpUnwatch',
    helpLabel: '/unwatch, /uw',
    kind: 'setting',
    names: ['unwatch', 'uw'],
    run: (parsed) => executeUnwatchCommand(parsed, runtime)
  };
}

async function executeUnwatchCommand(parsed: ParsedCommand, runtime: ChatCommandRuntime): Promise<void> {
  const parsedKeywords = parseKeywordCommandArguments(parsed.args);
  if (!parsedKeywords.ok) {
    showToast(parsedKeywords.error || t('addKeywordOrPhraseToRemove'));
    return;
  }

  const result = await removeInboxKeywords(parsedKeywords.values);
  runtime.clearInput();
  showToast(formatUnwatchKeywordResult(result.removed, result.missing));
}
