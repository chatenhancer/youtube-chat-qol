/** Outside-frame dismissal uses real browser focus changes around the chat fixture. */
import { expect, test } from '@playwright/test';
import { getChatComposerInput, setChatComposerText } from '../support/composer';
import { withExtensionStorageValues } from '../support/extension-storage';
import { fixtureLoggedInLiveChatUrl } from '../support/live-chat-fixture';
import { createMockPlaygroundSnapshot, installMockPlaygroundBackend } from '../support/playground-backend';
import { openGamesCard } from './playground/interactions';
import type { BrowserScenario } from './types';

export const panelsCloseOnWatchPageClickScenario: BrowserScenario = async ({ page, context }) => {
  const watchUrl = 'https://www.youtube.com/watch?v=panel-focus';
  await page.route(watchUrl, (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="en"><title>Panel dismissal fixture</title>
      <style>
        body { display: flex; gap: 24px; }
        iframe { width: 500px; height: 800px; border: 0; }
      </style>
      <div><button id="outside">Outside chat frame</button></div>
      <iframe id="chatframe" src="${fixtureLoggedInLiveChatUrl}"></iframe>
    </html>`
  }));
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot()
  });
  await page.goto(watchUrl);
  const chat = page.frameLocator('#chatframe');
  const outside = page.locator('#outside');
  const inbox = chat.locator('.ytcq-inbox-card');
  await expect(chat.locator('.ytcq-inbox-button')).toBeVisible();

  await test.step('Inbox allows keyboard focus within the panel, then closes outside', async () => {
    await chat.locator('.ytcq-inbox-button').click();
    await inbox.locator('.ytcq-inbox-keyword-toggle').click();
    await expect(inbox.locator('.ytcq-inbox-keyword-input')).toBeFocused();
    await inbox.locator('.ytcq-inbox-keyword-input').press('Tab');
    await expect(inbox).toBeVisible();
    await outside.click();
    await expect(inbox).toBeHidden();
    await chat.locator('.ytcq-inbox-button').click();
    await expect(inbox).toBeVisible();
    await outside.click();
    await expect(inbox).toBeHidden();
  });

  await test.step('Draft translation keeps its language selector usable', async () => {
    await chat.locator('.ytcq-composer-translate-button').click();
    const panel = chat.locator('.ytcq-composer-translate-panel');
    await expect(panel).toBeVisible();
    await panel.locator('select').press('Shift+Tab');
    await expect(panel).toBeVisible();
    await outside.click();
    await expect(panel).toBeHidden();
  });

  await test.step('Command suggestions and help close without changing the draft', async () => {
    await setChatComposerText(chat, '/he');
    const suggestions = chat.locator('.ytcq-command-autocomplete-card');
    await expect(suggestions).toBeVisible();
    await outside.click();
    await expect(suggestions).toBeHidden();
    await expect(getChatComposerInput(chat)).toHaveText('/he');
    await setChatComposerText(chat, '/help');
    await getChatComposerInput(chat).press('Tab');
    await expect(chat.locator('.ytcq-command-help-card')).toBeVisible();
    await outside.click();
    await expect(chat.locator('.ytcq-command-help-card')).toBeHidden();
  });

  await test.step('Games lobby closes when focus leaves chat', async () => {
    await withExtensionStorageValues(context, 'sync', { playgroundEnabled: true }, async () => {
      const card = await openGamesCard(chat, backend);
      await outside.click();
      await expect(card).toBeHidden();
      await expect(chat.locator('.ytcq-games-button')).toHaveAttribute('aria-expanded', 'false');
    });
  });
};
