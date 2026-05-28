import { cleanText } from '../../../shared/text';
import { showToast } from '../../../shared/toast';
import { addInboxKeywords, getInboxKeywords } from '../../inbox';
import {
  formatWatchKeywordResult,
  parseKeywordCommandArguments
} from '../keywords';
import type { ChatCommandDefinition, ChatCommandRuntime, ParsedCommand } from '../types';

export function createWatchCommand(runtime: ChatCommandRuntime): ChatCommandDefinition {
  return {
    helpDescriptionKey: 'commandHelpWatch',
    helpLabel: '/watch, /w',
    kind: 'setting',
    names: ['watch', 'w'],
    run: (parsed) => executeWatchCommand(parsed, runtime),
    runWithoutArgumentNames: ['watch', 'w']
  };
}

async function executeWatchCommand(parsed: ParsedCommand, runtime: ChatCommandRuntime): Promise<void> {
  const args = cleanText(parsed.args);
  if (!args) {
    runtime.clearInput();
    runtime.showWatchedKeywordsCard(await getInboxKeywords());
    return;
  }

  const parsedKeywords = parseKeywordCommandArguments(args);
  if (!parsedKeywords.ok) {
    showToast(parsedKeywords.error);
    return;
  }

  const result = await addInboxKeywords(parsedKeywords.values);
  runtime.clearInput();
  showToast(formatWatchKeywordResult(result.added, result.duplicates));
}
