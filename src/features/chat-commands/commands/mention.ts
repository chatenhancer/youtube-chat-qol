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
    helpLabel: '/mention, /reply',
    inline: true,
    kind: 'text',
    names: ['mention', 'reply'],
    run: async () => runtime.replaceCommandText(await getMentionCommandText(), t('noInboxMessagesYet')),
    runInline: async (parsed) => runtime.replaceInlineCommandText(
      await getMentionCommandText(),
      parsed,
      t('noInboxMessagesYet')
    ),
    runWithoutArgumentNames: ['mention', 'reply']
  };
}

async function getMentionCommandText(): Promise<string> {
  const latestInboxMessage = await getLatestInboxRecord();
  return latestInboxMessage ? formatMentionText(latestInboxMessage.authorName) : '';
}
