import { expect } from '@playwright/test';
import { getExtensionId } from '../support/extension';
import { withExtensionStorageValues } from '../support/extension-storage';
import { fixtureLoggedInLiveChatUrl } from '../support/live-chat-fixture';
import { openChatEnhancerMenu } from '../support/menu-openers';
import type { BrowserScenario } from './types';

export const attachEnabledExtensionScenario: BrowserScenario = async ({ page, context }) => {
  await runAttachmentScenario({ page, context });
};

export const attachEnabledExtensionLiteScenario: BrowserScenario = async ({ page, context }) => {
  await withExtensionStorageValues(context, 'sync', { liteModeEnabled: true }, async () => {
    await runAttachmentScenario({ page, context }, { lite: true });
  });
};

export const reconnectEnabledExtensionScenario: BrowserScenario = async ({ page, context }) => {
  await runAttachmentScenario({ page, context }, { reconnect: true });
};

export const reconnectEnabledExtensionLiteScenario: BrowserScenario = async ({ page, context }) => {
  await withExtensionStorageValues(context, 'sync', {
    liteModeEnabled: true,
    chatSkin: 'aero',
    messageDensity: 'compact'
  }, async () => {
    await runAttachmentScenario({ page, context }, { lite: true, reconnect: true });
  });
};

async function runAttachmentScenario(
  { page, context }: Pick<Parameters<BrowserScenario>[0], 'page' | 'context'>,
  { lite = false, reconnect = false }: { lite?: boolean; reconnect?: boolean } = {}
): Promise<void> {
  const extensionId = await getExtensionId(context);
  const extensions = await context.newPage();
  await extensions.goto('chrome://extensions');
  const developerMode = extensions.locator('extensions-toolbar #devMode');
  if (!(await developerMode.evaluate((toggle) => (toggle as HTMLElement & { checked: boolean }).checked))) {
    await developerMode.click();
  }
  const toggle = extensions.locator(`extensions-item[id="${extensionId}"] #enableToggle`);
  const watchUrl = 'https://www.youtube.com/watch?v=attach-test-01';
  const foreignFrameUrl = 'https://example.com/unrelated-embed';
  await context.route(foreignFrameUrl, (route) => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Unrelated frame</title>'
  }));
  await context.route(watchUrl, (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="en"><title>Existing stream</title>
      <style>body { display:flex; } video { width:480px; height:270px; } iframe { width:400px; height:800px; }</style>
      <div id="movie_player"><video muted></video></div>
      <ytd-live-chat-frame><iframe id="chatframe" src="${fixtureLoggedInLiveChatUrl}&v=attach-test-01"></iframe></ytd-live-chat-frame>
      <iframe hidden src="${foreignFrameUrl}"></iframe>
    </html>`
  }));

  try {
    if (!reconnect) {
      // First attachment cannot rely on a previous content script helping.
      await toggle.click();
      await expect(toggle).toHaveJSProperty('checked', false);
    }
    await page.goto(watchUrl);
    const chat = page.frameLocator('#chatframe');
    await expect(chat.locator('#input[contenteditable]')).toBeVisible();
    await expect(chat.locator('.ytcq-inbox-button')).toHaveCount(reconnect ? 1 : 0);
    const previousInstance = await chat.locator('html').getAttribute('data-ytcq-content-instance');
    await chat.locator('#input[contenteditable]').fill('Draft before enabling');
    const input = await chat.locator('#input[contenteditable]').evaluateHandle((element) => element);
    const player = await page.locator('#movie_player').evaluateHandle((element) => element);
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 270;
      const drawing = canvas.getContext('2d')!;
      window.setInterval(() => drawing.fillRect(0, 0, 480, 270), 100);
      const video = document.querySelector('video')!;
      video.srcObject = canvas.captureStream(1);
      await video.play();
    });

    if (reconnect) {
      await toggle.click();
      await expect(toggle).toHaveJSProperty('checked', false);
      await page.bringToFront();
      // A plain disable must restore native chat without the five-second wait.
      await expect(chat.locator('.ytcq-inbox-button, .ytcq-lite-root')).toHaveCount(0, { timeout: 1_500 });
      await expect(chat.locator('yt-live-chat-text-message-renderer').first()).toBeVisible({ timeout: 1_500 });
      await expect(chat.locator('html')).not.toHaveAttribute('data-ytcq-chat-skin');
      await expect(chat.locator('html')).not.toHaveAttribute('data-ytcq-message-density');
      await expect(page.locator('video')).toHaveJSProperty('paused', false);
    }

    await toggle.click();
    await expect(toggle).toHaveJSProperty('checked', true);
    await page.bringToFront();
    if (previousInstance) {
      await expect(chat.locator('html')).not.toHaveAttribute('data-ytcq-content-instance', previousInstance);
    }
    await expect(chat.locator('.ytcq-inbox-button')).toBeVisible();
    await expect(chat.locator('.ytcq-inbox-button')).toHaveCount(1);
    if (lite) {
      await expect(chat.locator('.ytcq-lite-root')).toHaveCount(1);
      await expect(chat.locator('.ytcq-lite-message').first()).toBeVisible();
    }
    await expect(chat.locator('#input[contenteditable]')).toHaveText('Draft before enabling');
    if (!reconnect) expect(await input.evaluate((element) => element.isConnected)).toBe(true);
    expect(await player.evaluate((element) => element.isConnected)).toBe(true);
    await expect(page.locator('video')).toHaveJSProperty('paused', false);

    const menu = await openChatEnhancerMenu(chat);
    await expect(menu.locator('.ytcq-settings-grid')).toHaveCSS('display', 'grid');
    const opened = context.waitForEvent('page');
    await menu.locator('[data-ytcq-action="picture-in-picture"]').click();
    const pip = await opened;
    await expect(pip.locator('video')).toHaveJSProperty('paused', false);
    await pip.close();
    await expect(page.locator('video')).toHaveJSProperty('paused', false);
    await input.dispose();
    await player.dispose();
  } finally {
    if (!(await toggle.evaluate((element) => (element as HTMLElement & { checked: boolean }).checked))) {
      await toggle.click();
    }
    await extensions.close();
    await context.unroute(watchUrl);
    await context.unroute(foreignFrameUrl);
  }
}
