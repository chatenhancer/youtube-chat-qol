import { t } from '../../../shared/i18n';
import { cleanText } from '../../../shared/text';
import { showToast } from '../../../shared/toast';
import { openFocusModeForAuthor } from '../../focus-mode';
import { getLatestMentionFocusUser, getSingleRecentUser } from '../recent-users';
import type { ChatCommandDefinition, ChatCommandRuntime, ParsedCommand } from '../types';

export function createFocusCommand(runtime: ChatCommandRuntime): ChatCommandDefinition {
  return {
    acceptsArguments: true,
    helpDescriptionKey: 'commandHelpFocus',
    helpLabel: '/focus, /f',
    kind: 'text',
    names: ['focus', 'f'],
    run: (parsed) => executeFocusCommand(parsed, runtime),
    runWithoutArgumentNames: ['focus', 'f']
  };
}

async function executeFocusCommand(parsed: ParsedCommand, runtime: ChatCommandRuntime): Promise<void> {
  const args = cleanText(parsed.args);
  const match = args ? getSingleRecentUser(args) : await getLatestMentionFocusUser();
  if (!match) return;

  const opened = openFocusModeForAuthor({
    authorName: match.authorName,
    avatarSrc: match.avatarSrc,
    channelId: match.identity.channelId
  });
  if (!opened) {
    showToast(t('couldNotOpenFocusForUser'));
    return;
  }

  runtime.clearInput();
}
