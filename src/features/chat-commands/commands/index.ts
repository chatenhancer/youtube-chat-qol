/**
 * Chat command registry.
 *
 * Composes the individual command modules in the order used by command help
 * and autocomplete.
 */
import type { ChatCommandDefinition, ChatCommandRuntime } from '../types';
import { createFocusCommand } from './focus';
import { createHelpCommand } from './help';
import { createMentionCommand } from './mention';
import { createQuoteCommand } from './quote';
import { createRepeatCommand } from './repeat';
import { createSettingCommands } from './settings';
import { createTimeCommand } from './time';
import { createTranslateCommand } from './translate';
import { createUnwatchCommand } from './unwatch';
import { createWatchCommand } from './watch';
import { createWhenCommand } from './when';
import { createWhoCommand } from './who';

export function createChatCommands(runtime: ChatCommandRuntime): ChatCommandDefinition[] {
  return [
    createMentionCommand(runtime),
    createQuoteCommand(runtime),
    createRepeatCommand(runtime),
    createTimeCommand(runtime),
    createWhenCommand(runtime),
    createWatchCommand(runtime),
    createUnwatchCommand(runtime),
    createFocusCommand(runtime),
    createTranslateCommand(runtime),
    createWhoCommand(runtime),
    createHelpCommand(runtime),
    ...createSettingCommands(runtime)
  ];
}
