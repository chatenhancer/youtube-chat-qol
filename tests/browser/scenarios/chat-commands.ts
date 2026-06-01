/**
 * Browser scenario for Tab-expanded chat commands.
 *
 * The checks exercise real contenteditable command handling while avoiding
 * Enter/send so no message is posted to YouTube.
 */
import { expect, test, type BrowserContext } from '@playwright/test';
import {
  clearChatComposer,
  getChatComposerInput,
  getChatComposerText,
  setChatComposerText
} from '../helpers/composer';
import {
  getExtensionStorageValues,
  withExtensionStorageValues
} from '../helpers/extension-storage';
import type { BrowserScenario, ChatSurface } from './types';

const COMMAND_KEYWORD = 'browser command phrase';

export const chatCommandsFullScenario: BrowserScenario = async ({ chat, context }) => {
  await expectChatCommands({ chat, context, fullCoverage: true });
};

export const chatCommandsSmokeScenario: BrowserScenario = async ({ chat, context }) => {
  await expectChatCommands({ chat, context, fullCoverage: false });
};

export const chatCommandAutocompleteScenario: BrowserScenario = async ({ chat }) => {
  await expectCommandAutocomplete(chat);
};

async function expectChatCommands({
  chat,
  context,
  fullCoverage
}: {
  chat: ChatSurface;
  context: BrowserContext;
  fullCoverage: boolean;
}): Promise<void> {
  await withExtensionStorageValues(context, 'sync', {
    targetLanguage: 'ja',
    lastTranslationTarget: 'ja',
    translationDisplay: 'replace'
  }, async () => {
    await withExtensionStorageValues(context, 'local', {
      ytcqInboxKeywords: []
    }, async () => {
      await expectTimeCommandsExpand(chat, fullCoverage);
      if (fullCoverage) {
        await expectDisplayCommandApplies(chat, context);
        await expectLangOffCommandApplies(chat, context);
        await expectWatchCommandApplies(chat, context);
      }
      await expectHelpCommandOpensCard(chat);
    });
  });
}

async function expectCommandAutocomplete(chat: ChatSurface): Promise<void> {
  await test.step('Autocomplete command names', async () => {
    await setChatComposerText(chat, '/tr');
    await expect(chat.locator('.ytcq-command-autocomplete-card')).toBeVisible({ timeout: 5_000 });
    await expect(chat.locator('.ytcq-command-autocomplete-name').filter({
      hasText: '/translate'
    }).first()).toBeVisible();

    await getChatComposerInput(chat).press('Tab');
    await expect.poll(async () => getNormalizedChatComposerText(chat), {
      message: 'Tab should accept the best command autocomplete suggestion.',
      timeout: 5_000
    }).toBe('/translate ');
  });

  await test.step('Autocomplete command arguments', async () => {
    await setChatComposerText(chat, '/lang j');
    await expect(chat.locator('.ytcq-command-autocomplete-card')).toBeVisible({ timeout: 5_000 });
    await expect(chat.locator('.ytcq-command-autocomplete-option').filter({
      hasText: 'Japanese'
    }).first()).toBeVisible();

    await getChatComposerInput(chat).press('Tab');
    await expect.poll(async () => getNormalizedChatComposerText(chat), {
      message: 'Tab should accept the best command argument suggestion.',
      timeout: 5_000
    }).toBe('/lang japanese ');
  });

  await test.step('Clear autocomplete draft', async () => {
    await clearChatComposer(chat);
  });
}

async function expectTimeCommandsExpand(
  chat: ChatSurface,
  fullCoverage: boolean
): Promise<void> {
  await test.step('Expand time commands', async () => {
    await expectCommandReplacesText(chat, '/time', {
      message: '/time should expand to a visible local time.'
    });
    if (!fullCoverage) return;

    await expectCommandReplacesText(chat, '/time tokyo', {
      message: '/time tokyo should expand to the current time in Tokyo.'
    });
    await expectCommandReplacesText(chat, '/t utc', {
      message: '/t should work as the /time alias.'
    });
    await expectInlineCommandReplacesText(chat, 'Now in Tokyo: /time tokyo', 'Now in Tokyo: ');
    await expectWhenCommandReplacesText(chat, '/when 2099-01-01 8pm utc');
    await expectWhenCommandReplacesText(chat, '/timeuntil 2099-01-01 8pm utc');
  });
}

async function getNormalizedChatComposerText(chat: ChatSurface): Promise<string> {
  return (await getChatComposerText(chat)).replace(/\u00a0/g, ' ');
}

async function expectDisplayCommandApplies(chat: ChatSurface, context: BrowserContext): Promise<void> {
  await test.step('Apply /settranslationdisplay command', async () => {
    await runCommand(chat, '/settranslationdisplay below');
    await expectStorageValue(context, 'sync', 'translationDisplay', 'below');
    await expectComposerCleared(chat);
  });
}

async function expectLangOffCommandApplies(chat: ChatSurface, context: BrowserContext): Promise<void> {
  await test.step('Apply /lang off command', async () => {
    await runCommand(chat, '/lang off');
    await expectStorageValue(context, 'sync', 'targetLanguage', '');
    await expectComposerCleared(chat);
  });
}

async function expectWatchCommandApplies(chat: ChatSurface, context: BrowserContext): Promise<void> {
  await test.step('Apply /watch command', async () => {
    await runCommand(chat, `/watch "${COMMAND_KEYWORD}"`);
    await expect.poll(async () => {
      const values = await getExtensionStorageValues(context, 'local', ['ytcqInboxKeywords']);
      return values.ytcqInboxKeywords;
    }, {
      message: '/watch should persist the watched phrase.',
      timeout: 5_000
    }).toContain(COMMAND_KEYWORD);
    await expectComposerCleared(chat);
  });
}

async function expectHelpCommandOpensCard(chat: ChatSurface): Promise<void> {
  await test.step('Open /help command card', async () => {
    await runCommand(chat, '/help');
    await expect(chat.locator('.ytcq-command-help-card')).toBeVisible({ timeout: 5_000 });
    await expectComposerCleared(chat);
    await chat.locator('.ytcq-command-help-close').click();
    await expect(chat.locator('.ytcq-command-help-card')).toHaveCount(0);
  });
}

async function runCommand(chat: ChatSurface, command: string): Promise<void> {
  await setChatComposerText(chat, command);
  await getChatComposerInput(chat).press('Tab');
}

async function expectCommandReplacesText(
  chat: ChatSurface,
  command: string,
  options: { message: string }
): Promise<string> {
  await runCommand(chat, command);
  const output = await expectComposerHasExpandedCommandOutput(chat, options.message);
  expect(output).not.toContain(command);
  await clearChatComposer(chat);
  return output;
}

async function expectInlineCommandReplacesText(
  chat: ChatSurface,
  command: string,
  expectedPrefix: string
): Promise<void> {
  await runCommand(chat, command);
  const output = await expectComposerHasExpandedCommandOutput(chat, 'Inline /time should expand inside surrounding text.');
  expect(output).toContain(expectedPrefix);
  expect(output).not.toContain('/time');
  await clearChatComposer(chat);
}

async function expectWhenCommandReplacesText(chat: ChatSurface, command: string): Promise<void> {
  await runCommand(chat, command);
  const output = await expectComposerHasExpandedCommandOutput(chat, `${command} should expand to an insertable duration.`);
  expect(output).not.toContain(command.split(/\s+/)[0]);
  await expect(chat.locator('.ytcq-toast')).toContainText(output, { timeout: 5_000 });
  await clearChatComposer(chat);
}

async function expectComposerHasExpandedCommandOutput(chat: ChatSurface, message: string): Promise<string> {
  await expect.poll(async () => getChatComposerText(chat), {
    message,
    timeout: 5_000
  }).toMatch(/\d/);

  return getChatComposerText(chat);
}

async function expectComposerCleared(chat: ChatSurface): Promise<void> {
  await expect.poll(async () => getChatComposerText(chat), {
    message: 'Command should clear the composer after it runs.',
    timeout: 5_000
  }).toBe('');
}

async function expectStorageValue(
  context: BrowserContext,
  area: 'local' | 'sync',
  key: string,
  expectedValue: unknown
): Promise<void> {
  await expect.poll(async () => {
    const values = await getExtensionStorageValues(context, area, [key]);
    return values[key];
  }, {
    timeout: 5_000
  }).toEqual(expectedValue);
}
