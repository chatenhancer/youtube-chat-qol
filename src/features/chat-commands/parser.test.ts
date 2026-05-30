import { describe, expect, it } from 'vitest';
import { normalizeCommandToken, parseCommand, parseInlineTextCommand } from './parser';

describe('chat command parser', () => {
  it('parses whole-input commands and arguments', () => {
    expect(parseCommand('/time tokyo')).toEqual({
      args: 'tokyo',
      name: 'time',
      text: '/time tokyo'
    });
  });

  it('treats double slash commands as escaped text', () => {
    expect(parseCommand('//time tokyo')).toEqual({
      args: '',
      name: '',
      text: '//time tokyo'
    });
  });

  it('finds inline commands at the caret and falls back to the end of text', () => {
    const inlineCommands = new Set(['time', 'when']);
    const text = 'hello /time tokyo';

    expect(parseInlineTextCommand({
      selectionEnd: text.length,
      selectionStart: text.length,
      text
    }, inlineCommands)).toEqual({
      args: 'tokyo',
      end: text.length,
      name: 'time',
      start: 6,
      text: '/time tokyo'
    });

    expect(parseInlineTextCommand({
      selectionEnd: 0,
      selectionStart: 0,
      text
    }, inlineCommands)?.name).toBe('time');
  });

  it('does not parse whole-input-only commands as inline commands', () => {
    const text = 'hello /quote';

    expect(parseInlineTextCommand({
      selectionEnd: text.length,
      selectionStart: text.length,
      text
    }, new Set(['time']))).toBeNull();
  });

  it('normalizes command tokens for aliases and timezone names', () => {
    expect(normalizeCommandToken(' Los_Angeles ')).toBe('losangeles');
    expect(normalizeCommandToken('(time-until)')).toBe('timeuntil');
  });
});
