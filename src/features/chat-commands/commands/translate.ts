/**
 * Translate command.
 *
 * Translates custom text into a requested language and replaces only the typed
 * command span; it never auto-sends the result.
 */
import { t } from '../../../shared/i18n';
import { showToast } from '../../../shared/toast';
import { createTranslationTextLanguageOptions } from './language-options';
import { parseTranslateTextCommand, translateCommandText } from '../translate-text';
import type {
  ChatCommandDefinition,
  ChatCommandRuntime,
  InlineParsedCommand,
  ParsedCommand
} from '../types';

export function createTranslateCommand(runtime: ChatCommandRuntime): ChatCommandDefinition {
  return {
    acceptsArguments: true,
    argumentOptions: createTranslationTextLanguageOptions,
    helpDescriptionKey: 'commandHelpTranslate',
    helpLabel: '/translate, /t, /tr',
    hideExactArgumentAutocomplete: false,
    inline: true,
    kind: 'text',
    names: ['translate', 't', 'tr'],
    run: (parsed) => executeTranslateTextCommand(parsed, runtime),
    runInline: (parsed) => executeInlineTranslateTextCommand(parsed, runtime)
  };
}

async function executeTranslateTextCommand(parsed: ParsedCommand, runtime: ChatCommandRuntime): Promise<void> {
  const request = parseTranslateTextCommand(parsed.args);
  if (!request) return;

  try {
    runtime.replaceCommandText(await translateCommandText(request.text, request.targetLanguage), t('couldNotTranslateText'));
  } catch {
    showToast(t('couldNotTranslateText'));
  }
}

async function executeInlineTranslateTextCommand(
  parsed: InlineParsedCommand,
  runtime: ChatCommandRuntime
): Promise<void> {
  const request = parseTranslateTextCommand(parsed.args);
  if (!request) return;

  try {
    runtime.replaceInlineCommandText(
      await translateCommandText(request.text, request.targetLanguage),
      parsed,
      t('couldNotTranslateText')
    );
  } catch {
    showToast(t('couldNotTranslateText'));
  }
}
