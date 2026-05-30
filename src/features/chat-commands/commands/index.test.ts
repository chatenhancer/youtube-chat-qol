import { describe, expect, it, vi } from 'vitest';
import { createChatCommands } from './index';
import type { ChatCommandRuntime } from '../types';

describe('chat command registry', () => {
  it('keeps shortcut aliases attached to their primary commands', () => {
    const commands = createChatCommands(createRuntime());
    const commandByPrimaryName = new Map(commands.map((command) => [command.names[0], command.names]));

    expect(commandByPrimaryName.get('mention')).toEqual(['mention', 'm', 'reply', 'r']);
    expect(commandByPrimaryName.get('quote')).toEqual(['quote', 'q']);
    expect(commandByPrimaryName.get('time')).toEqual(['time', 't']);
    expect(commandByPrimaryName.get('translate')).toEqual(['translate', 'tr']);
    expect(commandByPrimaryName.get('when')).toEqual(['when', 'wh', 'timeuntil', 'tu', 'timesince', 'ts']);
  });

  it('keeps only sentence-friendly commands inline-capable', () => {
    const commands = createChatCommands(createRuntime());
    const inlineNames = commands
      .filter((command) => command.inline)
      .flatMap((command) => command.names);

    expect(inlineNames).toContain('mention');
    expect(inlineNames).toContain('time');
    expect(inlineNames).toContain('when');
    expect(inlineNames).toContain('translate');
    expect(inlineNames).not.toContain('quote');
    expect(inlineNames).not.toContain('watch');
  });
});

function createRuntime(): ChatCommandRuntime {
  return {
    clearInput: vi.fn(),
    replaceCommandText: vi.fn(),
    replaceInlineCommandText: vi.fn(),
    replaceLastSentMessage: vi.fn(),
    showCommandHelp: vi.fn(),
    showWatchedKeywordsCard: vi.fn()
  };
}
