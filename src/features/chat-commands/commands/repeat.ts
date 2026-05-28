/**
 * Repeat command.
 *
 * Restores the previous rich chat input snapshot for /again and /repeat.
 */
import type { ChatCommandDefinition, ChatCommandRuntime } from '../types';

export function createRepeatCommand(runtime: ChatCommandRuntime): ChatCommandDefinition {
  return {
    helpDescriptionKey: 'commandHelpRepeat',
    helpLabel: '/again, /repeat',
    kind: 'text',
    names: ['again', 'repeat'],
    run: () => runtime.replaceLastSentMessage(),
    runWithoutArgumentNames: ['again', 'repeat']
  };
}
