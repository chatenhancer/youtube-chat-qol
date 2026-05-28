/**
 * When command.
 *
 * Calculates a localized duration to a future target or from a past target
 * using flexible date and time inputs.
 */
import { t } from '../../../shared/i18n';
import { formatWhen } from '../time';
import type { ChatCommandDefinition, ChatCommandRuntime } from '../types';

export function createWhenCommand(runtime: ChatCommandRuntime): ChatCommandDefinition {
  return {
    acceptsArguments: true,
    helpDescriptionKey: 'commandHelpWhen',
    helpLabel: '/when 7:45pm',
    inline: true,
    kind: 'text',
    names: ['when', 'wh', 'timeuntil', 'tu', 'timesince', 'ts'],
    run: (parsed) => runtime.replaceCommandText(formatWhen(parsed.args), t('couldNotReadDateOrTime')),
    runInline: (parsed) => runtime.replaceInlineCommandText(
      formatWhen(parsed.args),
      parsed,
      t('couldNotReadDateOrTime')
    )
  };
}
