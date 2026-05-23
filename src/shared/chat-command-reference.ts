/**
 * Shared chat command metadata.
 *
 * The JSON file is the source of truth for extension help text and generated
 * public docs. Behavior-specific code still decides what each command does.
 */
import chatCommandReferenceJson from './chat-commands.json';

export interface ChatCommandEntry {
  docsDescription: string;
  examples: string[];
  helpDescription: string;
  helpLabel: string;
  hiddenAliases?: string[];
  inline?: boolean;
  kind: 'setting' | 'text';
  names: string[];
  readmeDescription: string;
  wholeInput?: boolean;
}

export interface ChatCommandGroup {
  commands: ChatCommandEntry[];
  id: string;
  title: string;
}

export interface ChatCommandTimeZone {
  aliases: string[];
  label: string;
  timeZone: string;
}

export interface ChatCommandReference {
  escapeExample: string;
  groups: ChatCommandGroup[];
  inlineSummary: string;
  intro: string;
  timeUntilFormats: string[];
  timeZones: ChatCommandTimeZone[];
}

export const CHAT_COMMAND_REFERENCE = chatCommandReferenceJson as ChatCommandReference;

export function getChatCommandEntries(): ChatCommandEntry[] {
  return CHAT_COMMAND_REFERENCE.groups.flatMap((group) => group.commands);
}

export function getChatCommandNames(kind?: ChatCommandEntry['kind']): string[] {
  return getChatCommandEntries()
    .filter((command) => kind === undefined || command.kind === kind)
    .flatMap((command) => [...command.names, ...(command.hiddenAliases || [])]);
}

export function getInlineChatCommandNames(): string[] {
  return getChatCommandEntries()
    .filter((command) => command.inline)
    .flatMap((command) => command.names);
}

export function getChatCommandHelpRows(): Array<[string, string]> {
  return getChatCommandEntries().map((command) => [command.helpLabel, command.helpDescription]);
}

export function getChatCommandTimeZones(): ChatCommandTimeZone[] {
  return CHAT_COMMAND_REFERENCE.timeZones;
}
