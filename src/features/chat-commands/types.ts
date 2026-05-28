import type { t } from '../../shared/i18n';
import type { Options } from '../../shared/options';

export type SaveOptions = (values: Partial<Options>) => void;

export interface ParsedCommand {
  args: string;
  name: string;
  text: string;
}

export interface InlineParsedCommand extends ParsedCommand {
  end: number;
  start: number;
}

export type CommandAutocompleteContextKind = 'argument' | 'command';

export interface CommandAutocompleteContext {
  command?: ChatCommandDefinition;
  end: number;
  fragment: string;
  inline: boolean;
  kind: CommandAutocompleteContextKind;
  start: number;
}

export interface CommandAutocompleteOption {
  aliases?: string[];
  description: string;
  label: string;
  value: string;
}

export interface CommandAutocompleteSuggestion extends CommandAutocompleteOption {
  command: ChatCommandDefinition;
}

export interface CommandAutocompleteState {
  context: CommandAutocompleteContext;
  suggestions: CommandAutocompleteSuggestion[];
}

export type ChatCommandKind = 'setting' | 'text';
export type ChatCommandHandler = (parsed: ParsedCommand, context: ChatCommandContext) => void | Promise<void>;
export type InlineChatCommandHandler = (parsed: InlineParsedCommand) => void | Promise<void>;
export type MessageKey = Parameters<typeof t>[0];

export interface ChatCommandContext {
  saveOptions: SaveOptions;
}

export interface ChatCommandRuntime {
  clearInput(): void;
  replaceCommandText(text: string, emptyMessage: string): void;
  replaceInlineCommandText(text: string, parsed: InlineParsedCommand, emptyMessage: string): void;
  replaceLastSentMessage(): void;
  showCommandHelp(): void;
  showWatchedKeywordsCard(keywords: string[]): void;
}

export interface ChatCommandDefinition {
  argumentOptions?: () => CommandAutocompleteOption[];
  acceptsArguments?: boolean;
  hideExactArgumentAutocomplete?: boolean;
  helpDescription?: string;
  helpDescriptionKey?: MessageKey;
  helpLabel: string;
  hiddenAliases?: string[];
  inline?: boolean;
  kind: ChatCommandKind;
  names: string[];
  runWithoutArgumentNames?: string[];
  run: ChatCommandHandler;
  runInline?: InlineChatCommandHandler;
}
