/**
 * Help command.
 *
 * Displays the localized command reference card and clears the slash command
 * from the chat input without sending anything.
 */
import type { ChatCommandDefinition, ChatCommandRuntime } from '../types';

export function createHelpCommand(runtime: ChatCommandRuntime): ChatCommandDefinition {
  return {
    helpDescriptionKey: 'commandHelpOpenHelp',
    helpLabel: '/help',
    kind: 'text',
    names: ['help'],
    run: () => {
      runtime.clearInput();
      runtime.showCommandHelp();
    },
    runWithoutArgumentNames: ['help']
  };
}
