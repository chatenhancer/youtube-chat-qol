/**
 * When command.
 *
 * Calculates a localized duration to a future target or from a past target
 * using flexible date and time inputs.
 */
import { t } from '../../../shared/i18n';
import { showToast } from '../../../shared/toast';
import { CHAT_COMMAND_TIME_ZONES, formatWhenResult } from '../time';
import type {
  ChatCommandDefinition,
  ChatCommandRuntime,
  InlineParsedCommand,
  ParsedCommand
} from '../types';

export function createWhenCommand(runtime: ChatCommandRuntime): ChatCommandDefinition {
  return {
    acceptsArguments: true,
    argumentOptions: () => CHAT_COMMAND_TIME_ZONES.flatMap(({ aliases, label }) => aliases.map((alias) => ({
      aliases: [label],
      description: label,
      label: alias,
      value: alias
    }))),
    hideExactArgumentAutocomplete: false,
    helpDescriptionKey: 'commandHelpWhen',
    helpLabel: '/when 2026-05-29 8pm pt',
    inline: true,
    kind: 'text',
    names: ['when', 'wh', 'timeuntil', 'tu', 'timesince', 'ts'],
    run: (parsed) => executeWhenCommand(parsed, runtime),
    runInline: (parsed) => executeInlineWhenCommand(parsed, runtime)
  };
}

function executeWhenCommand(parsed: ParsedCommand, runtime: ChatCommandRuntime): void {
  const result = formatWhenResult(parsed.args);
  if (!result) {
    runtime.replaceCommandText('', t('couldNotReadDateOrTime'));
    return;
  }

  runtime.replaceCommandText(result.insertion, t('couldNotReadDateOrTime'));
  showToast(result.detail);
}

function executeInlineWhenCommand(parsed: InlineParsedCommand, runtime: ChatCommandRuntime): void {
  const result = formatWhenResult(parsed.args);
  if (!result) {
    runtime.replaceInlineCommandText('', parsed, t('couldNotReadDateOrTime'));
    return;
  }

  runtime.replaceInlineCommandText(result.insertion, parsed, t('couldNotReadDateOrTime'));
  showToast(result.detail);
}
