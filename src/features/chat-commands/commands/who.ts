import { t } from '../../../shared/i18n';
import { cleanText } from '../../../shared/text';
import { showToast } from '../../../shared/toast';
import { findChatInput } from '../../../youtube/chat-input';
import { openProfileCardForIdentity } from '../../profile-popup';
import { getSingleRecentUser } from '../recent-users';
import type { ChatCommandDefinition, ChatCommandRuntime, ParsedCommand } from '../types';

export function createWhoCommand(runtime: ChatCommandRuntime): ChatCommandDefinition {
  return {
    acceptsArguments: true,
    helpDescriptionKey: 'commandHelpWho',
    helpLabel: '/who',
    kind: 'text',
    names: ['who'],
    run: (parsed) => executeWhoCommand(parsed, runtime)
  };
}

function executeWhoCommand(parsed: ParsedCommand, runtime: ChatCommandRuntime): void {
  if (!cleanText(parsed.args)) {
    showToast(t('addHandleToOpenUserCard'));
    return;
  }

  const match = getSingleRecentUser(parsed.args);
  if (!match) return;

  if (!openProfileCardForIdentity(match.identity, findChatInput())) {
    showToast(t('couldNotOpenUserCard'));
  }
  runtime.clearInput();
}
