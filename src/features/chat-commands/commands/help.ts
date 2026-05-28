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
