/**
 * Extension popup status helpers for browser tests.
 */
import { expect, type BrowserContext } from '@playwright/test';
import { getExtensionId } from './extension';

export async function expectPopupReportsActiveStatus(
  context: BrowserContext
): Promise<void> {
  const extensionId = await getExtensionId(context);
  const popup = await context.newPage();

  try {
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.locator('[data-extension-status-text]')).toContainText(/Active/);
  } finally {
    await popup.close();
  }
}
