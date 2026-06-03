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
    await expect(popup.locator('[data-extension-status]')).toHaveAttribute('data-extension-status', 'active');
    await expect(popup.locator('[data-extension-status-helper]')).toContainText(/connected/i);
    await expect(popup.locator('[data-extension-status-helper]')).not.toContainText(/not connected/i);
  } finally {
    await popup.close();
  }
}
