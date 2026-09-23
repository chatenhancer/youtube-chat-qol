import { expect, test } from '@playwright/test';
import { withExtensionStorageValues } from '../support/extension-storage';
import { fixtureLoggedInLiveChatUrl } from '../support/live-chat-fixture';
import type { BrowserScenario } from './types';

export const startupEffectWaitsForChatScenario: BrowserScenario = async ({ page, context }) => {
  const watchUrl = 'https://www.youtube.com/watch?v=ytcq-startup';
  await page.route(watchUrl, route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><body>
      <button onclick="document.getElementById('chatframe').style.display = 'block'">Show chat</button>
      <ytd-live-chat-frame><iframe id="chatframe" src="${fixtureLoggedInLiveChatUrl}"
        style="display:none;width:430px;height:650px;border:0"></iframe></ytd-live-chat-frame>
    </body></html>`
  }));
  try {
    for (const liteModeEnabled of [false, true]) {
      await test.step(`Startup waits for the ${liteModeEnabled ? 'Lite' : 'native'} chat frame to be shown`, async () => {
        await page.goto('about:blank');
        await withExtensionStorageValues(context, 'sync', { startupEffect: true, liteModeEnabled }, async () => {
          await page.goto(watchUrl);
          const chat = page.frameLocator('#chatframe');
          const active = chat.locator('.ytcq-enhanced-effect-active');
          const canvas = chat.locator('.ytcq-enhanced-effect canvas');
          await expect(canvas).toHaveCount(1);
          // Keep the loaded frame hidden longer than the entire startup effect.
          await page.waitForTimeout(1_600);
          await expect(active).toHaveCount(0);

          await page.getByRole('button', { name: 'Show chat', exact: true }).click();
          await expect(active).toBeVisible();
          await expect.poll(() => canvas.evaluate(element => {
            const canvas = element as HTMLCanvasElement;
            const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
            return pixels.some((value, index) => index % 4 === 3 && value > 10);
          })).toBe(true);
          await expect(active).toHaveCount(0);
        });
      });
    }
  } finally {
    await page.unroute(watchUrl);
  }
};
