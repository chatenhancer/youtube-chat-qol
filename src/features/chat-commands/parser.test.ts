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

  it('rejects non-command and malformed slash text', () => {
    expect(parseCommand('hello /time tokyo')).toBeNull();
    expect(parseCommand('/')).toBeNull();
    expect(parseCommand('/ time')).toBeNull();
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

  it('does not parse inline commands from a selected range or embedded slash token', () => {
    const inlineCommands = new Set(['time']);
    const text = 'hello word/time tokyo and /time paris';

    expect(parseInlineTextCommand({
      selectionEnd: 11,
      selectionStart: 6,
      text
    }, inlineCommands)).toBeNull();
    expect(parseInlineTextCommand({
      selectionEnd: 21,
      selectionStart: 21,
      text
    }, inlineCommands)).toEqual({
      args: 'paris',
      end: text.length,
      name: 'time',
      start: 26,
      text: '/time paris'
    });
  });

  it('normalizes command tokens for aliases and timezone names', () => {
    expect(normalizeCommandToken(' Los_Angeles ')).toBe('losangeles');
    expect(normalizeCommandToken('(time-until)')).toBe('timeuntil');
  });
});
