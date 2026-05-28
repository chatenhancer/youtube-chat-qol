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
