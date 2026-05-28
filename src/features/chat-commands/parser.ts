import { cleanText } from '../../shared/text';
import type { ChatInputTextSelection } from '../../youtube/chat-input';
import type { InlineParsedCommand, ParsedCommand } from './types';

export function parseCommand(value: string): ParsedCommand | null {
  const text = cleanText(value);
  if (!text.startsWith('/')) return null;
  if (text.startsWith('//')) {
    return {
      args: '',
      name: '',
      text
    };
  }

  const match = /^\/([^\s/]+)(?:\s+([\s\S]*))?$/.exec(text);
  if (!match) return null;

  return {
    args: cleanText(match[2] || ''),
    name: match[1].toLowerCase(),
    text
  };
}

export function parseInlineTextCommand(
  selection: ChatInputTextSelection,
  inlineCommands: Set<string>
): InlineParsedCommand | null {
  if (selection.selectionStart !== selection.selectionEnd) return null;

  return parseInlineTextCommandAt(selection.text, selection.selectionStart, inlineCommands) ||
    parseInlineTextCommandAt(selection.text, selection.text.length, inlineCommands);
}

export function normalizeCommandToken(value: string): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/[()[\]]/g, '')
    .replace(/[\s_-]+/g, '');
}

function parseInlineTextCommandAt(
  text: string,
  end: number,
  inlineCommands: Set<string>
): InlineParsedCommand | null {
  const beforeCaret = text.slice(0, end);
  for (let start = beforeCaret.lastIndexOf('/'); start >= 0; start = beforeCaret.lastIndexOf('/', start - 1)) {
    if (start > 0 && !/\s/.test(beforeCaret[start - 1])) continue;
    if (beforeCaret[start + 1] === '/') continue;

    const parsed = parseCommand(beforeCaret.slice(start));
    if (parsed && inlineCommands.has(parsed.name)) {
      return {
        ...parsed,
        end,
        start
      };
    }
  }

  return null;
}
