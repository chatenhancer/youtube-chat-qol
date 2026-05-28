/**
 * Settings commands.
 *
 * Maps slash commands to extension option updates and localized confirmation
 * toasts while keeping these commands whole-input only.
 */
import { getLocalizedLanguageLabel, t } from '../../../shared/i18n';
import { getLanguageLabel, LANGUAGE_OPTIONS } from '../../../shared/languages';
import { getTargetLanguageUpdate, type TranslationDisplay } from '../../../shared/options';
import { getOptions } from '../../../shared/state';
import { cleanText } from '../../../shared/text';
import { showToast } from '../../../shared/toast';
import { normalizeCommandToken } from '../parser';
import type { ChatCommandDefinition, ChatCommandRuntime, ParsedCommand, SaveOptions } from '../types';
import { createTranslationTargetOptions } from './language-options';

const languageByCommandName = createLanguageCommandMap();

export function createSettingCommands(runtime: ChatCommandRuntime): ChatCommandDefinition[] {
  return [
    {
      argumentOptions: createTranslationTargetOptions,
      helpDescriptionKey: 'commandHelpSetTranslateTo',
      helpLabel: '/settranslateto, /lang',
      kind: 'setting',
      names: ['settranslateto', 'lang'],
      run: (parsed, { saveOptions }) => executeSetTranslateToCommand(parsed, saveOptions, runtime),
      runWithoutArgumentNames: ['lang']
    },
    {
      argumentOptions: () => [
        {
          description: t('translationsReplaceMessages'),
          label: 'replace',
          value: 'replace'
        },
        {
          description: t('translationsShowBelowMessages'),
          label: 'below',
          value: 'below'
        }
      ],
      helpDescriptionKey: 'commandHelpSetTranslationDisplay',
      helpLabel: '/settranslationdisplay replace/below',
      kind: 'setting',
      names: ['settranslationdisplay'],
      run: (parsed, { saveOptions }) => executeSetTranslationDisplayCommand(parsed, saveOptions, runtime)
    },
    {
      argumentOptions: () => [
        {
          description: t('settingState', { label: t('inboxSound'), state: t('stateOn') }),
          label: 'on',
          value: 'on'
        },
        {
          description: t('settingState', { label: t('inboxSound'), state: t('stateOff') }),
          label: 'off',
          value: 'off'
        }
      ],
      helpDescriptionKey: 'commandHelpSetSound',
      helpLabel: '/setsound on/off',
      kind: 'setting',
      names: ['setsound'],
      run: (parsed, { saveOptions }) => executeBooleanSetCommand(
        parsed,
        saveOptions,
        runtime,
        'sound',
        t('inboxSound')
      )
    }
  ];
}

function executeSetTranslateToCommand(
  parsed: ParsedCommand,
  saveOptions: SaveOptions,
  runtime: ChatCommandRuntime
): void {
  if (parsed.name === 'lang' && !cleanText(parsed.args)) {
    showActiveTranslationTarget();
    return;
  }

  const targetLanguage = getTranslateCommandTarget(parsed.args);
  if (targetLanguage === null) {
    showToast(t('unknownTranslationLanguage'));
    return;
  }

  saveOptions(getTargetLanguageUpdate(targetLanguage));
  runtime.clearInput();
  showToast(targetLanguage
    ? t('translateToLanguage', { language: getLocalizedLanguageLabel(targetLanguage) || getLanguageLabel(targetLanguage) })
    : t('translateOff'));
}

function showActiveTranslationTarget(): void {
  const options = getOptions();
  const targetLanguage = options.targetLanguage;
  if (!targetLanguage) {
    showToast(t('translateOff'));
    return;
  }

  showToast(t('translateToLanguage', {
    language: getLocalizedLanguageLabel(targetLanguage) || getLanguageLabel(targetLanguage)
  }));
}

function executeSetTranslationDisplayCommand(
  parsed: ParsedCommand,
  saveOptions: SaveOptions,
  runtime: ChatCommandRuntime
): void {
  const display = getTranslationDisplayCommandTarget(parsed.args);
  if (!display) {
    showToast(t('useReplaceOrBelow'));
    return;
  }

  saveOptions({ translationDisplay: display });
  runtime.clearInput();
  showToast(display === 'replace' ? t('translationsReplaceMessages') : t('translationsShowBelowMessages'));
}

function executeBooleanSetCommand(
  parsed: ParsedCommand,
  saveOptions: SaveOptions,
  runtime: ChatCommandRuntime,
  option: 'sound',
  label: string
): void {
  const value = getBooleanCommandTarget(parsed.args);
  if (value === null) {
    showToast(t('useOnOrOff'));
    return;
  }

  saveOptions({ [option]: value });
  runtime.clearInput();
  showToast(t('settingState', { label, state: value ? t('stateOn') : t('stateOff') }));
}

function getTranslateCommandTarget(value: string): string | null {
  const normalized = normalizeCommandToken(value);
  if (!normalized) return null;
  if (normalized === 'off') return '';
  return languageByCommandName.get(normalized) ?? null;
}

function getTranslationDisplayCommandTarget(value: string): TranslationDisplay | null {
  const normalized = normalizeCommandToken(value);
  if (normalized === 'replace') return 'replace';
  if (normalized === 'below' || normalized === 'showbelow') return 'below';
  return null;
}

function getBooleanCommandTarget(value: string): boolean | null {
  const normalized = normalizeCommandToken(value);
  if (['on', 'true', 'yes', 'enabled'].includes(normalized)) return true;
  if (['off', 'false', 'no', 'disabled'].includes(normalized)) return false;
  return null;
}

function createLanguageCommandMap(): Map<string, string> {
  const map = new Map<string, string>();
  LANGUAGE_OPTIONS.forEach(([value, label]) => {
    map.set(normalizeCommandToken(value), value);
    map.set(normalizeCommandToken(label), value);
  });
  return map;
}
