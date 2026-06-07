/**
 * Extension popup status helpers for browser tests.
 */
import { expect, type BrowserContext } from '@playwright/test';
import { getExtensionId } from './extension';

export async function expectPopupReportsConnectedStatus(
  context: BrowserContext
): Promise<void> {
  const extensionId = await getExtensionId(context);
  const popup = await context.newPage();

  try {
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    const status = popup.locator('[data-extension-status]');
    await expect(status).toHaveAttribute('data-extension-status', 'active');
    await expect(status).toContainText(/Active/i);
    await expect(status).toHaveAttribute('title', /^Extension connected/i);
    await expect(status).not.toHaveAttribute('title', /not connected/i);
  } finally {
    await popup.close();
  }
}
