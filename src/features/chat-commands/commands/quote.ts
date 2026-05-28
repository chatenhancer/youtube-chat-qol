import { t } from '../../../shared/i18n';
import { cleanText } from '../../../shared/text';
import { showToast } from '../../../shared/toast';
import { getLatestInboxRecord } from '../../inbox';
import { formatQuoteText, quoteAuthorRichText } from '../../reply';
import { getLatestMessageForIdentity } from '../../user-message-history';
import { getSingleRecentUser } from '../recent-users';
import type { ChatCommandDefinition, ChatCommandRuntime, ParsedCommand } from '../types';

export function createQuoteCommand(runtime: ChatCommandRuntime): ChatCommandDefinition {
  return {
    acceptsArguments: true,
    helpDescriptionKey: 'commandHelpQuote',
    helpLabel: '/quote, /q',
    kind: 'text',
    names: ['quote', 'q'],
    run: (parsed) => executeQuoteCommand(parsed, runtime),
    runWithoutArgumentNames: ['quote', 'q']
  };
}

async function executeQuoteCommand(parsed: ParsedCommand, runtime: ChatCommandRuntime): Promise<void> {
  if (!cleanText(parsed.args)) {
    runtime.replaceCommandText(await getQuoteCommandText(), t('noInboxMessagesYet'));
    return;
  }

  const match = getSingleRecentUser(parsed.args);
  if (!match) return;

  const record = getLatestMessageForIdentity(match.identity);
  if (!record) {
    showToast(t('noQuotableMessageForUser'));
    return;
  }

  quoteAuthorRichText(record.authorName, record.text, {
    segments: record.contentParts
  }, {
    focusSource: {
      authorName: match.authorName,
      avatarSrc: match.avatarSrc,
      channelId: match.identity.channelId
    }
  });
}

async function getQuoteCommandText(): Promise<string> {
  const latestInboxMessage = await getLatestInboxRecord();
  return latestInboxMessage ? formatQuoteText(latestInboxMessage.authorName, latestInboxMessage.text) : '';
}
