/**
 * Time command.
 *
 * Inserts the current local time or the current time for an aliased timezone.
 */
import { t } from '../../../shared/i18n';
import { CHAT_COMMAND_TIME_ZONES, formatTime } from '../time';
import type { ChatCommandDefinition, ChatCommandRuntime } from '../types';

export function createTimeCommand(runtime: ChatCommandRuntime): ChatCommandDefinition {
  return {
    acceptsArguments: true,
    argumentOptions: () => CHAT_COMMAND_TIME_ZONES.flatMap(({ aliases, label }) => aliases.map((alias) => ({
      aliases: [label],
      description: label,
      label: alias,
      value: alias
    }))),
    helpDescriptionKey: 'commandHelpTime',
    helpLabel: '/time, /t',
    inline: true,
    kind: 'text',
    names: ['time', 't'],
    run: (parsed) => runtime.replaceCommandText(formatTime(parsed.args), t('unknownTimezone')),
    runInline: (parsed) => runtime.replaceInlineCommandText(formatTime(parsed.args), parsed, t('unknownTimezone')),
    runWithoutArgumentNames: ['time', 't']
  };
}
