/**
 * Mention command.
 *
 * Expands to a mention of the latest Inbox sender in either whole-input or
 * inline command contexts.
 */
import { t } from '../../../shared/i18n';
import { getLatestInboxRecord } from '../../inbox';
import { formatMentionText } from '../../reply';
import type { ChatCommandDefinition, ChatCommandRuntime } from '../types';

export function createMentionCommand(runtime: ChatCommandRuntime): ChatCommandDefinition {
  return {
    helpDescriptionKey: 'commandHelpMention',
    helpLabel: '/mention, /m, /reply, /r',
    inline: true,
    kind: 'text',
    names: ['mention', 'm', 'reply', 'r'],
    run: async () => runtime.replaceCommandText(await getMentionCommandText(), t('noInboxMessagesYet')),
    runInline: async (parsed) => runtime.replaceInlineCommandText(
      await getMentionCommandText(),
      parsed,
      t('noInboxMessagesYet')
    ),
    runWithoutArgumentNames: ['mention', 'm', 'reply', 'r']
  };
}

async function getMentionCommandText(): Promise<string> {
  const latestInboxMessage = await getLatestInboxRecord();
  return latestInboxMessage ? formatMentionText(latestInboxMessage.authorName) : '';
}
