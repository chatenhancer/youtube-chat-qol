/**
 * Small Locator helpers for browser scenarios.
 *
 * Real YouTube chat can sit under sticky page chrome at some viewport sizes, so
 * scenarios center rows before user-like clicks instead of relying on
 * Playwright's nearest-edge auto-scroll.
 */
import type { Locator } from '@playwright/test';

export async function centerLocatorInViewport(locator: Locator): Promise<void> {
  await locator.evaluate((element) => {
    element.scrollIntoView({
      block: 'center',
      inline: 'nearest'
    });
  }).catch(async () => {
    await locator.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => undefined);
  });
}

export async function clickLocatorAtCurrentCenter(locator: Locator): Promise<boolean> {
  const initialPoint = await getLocatorCenterInViewport(locator);
  if (!initialPoint) return false;

  await locator.page().mouse.move(initialPoint.x, initialPoint.y);
  await locator.page().waitForTimeout(75);

  const clickPoint = await getLocatorCenterInViewport(locator);
  if (!clickPoint) return false;

  await locator.page().mouse.click(clickPoint.x, clickPoint.y);
  return true;
}

async function getLocatorCenterInViewport(locator: Locator): Promise<{ x: number; y: number } | null> {
  const box = await locator.boundingBox().catch(() => null);
  const viewport = locator.page().viewportSize();
  if (!box || !viewport || box.width <= 0 || box.height <= 0) return null;

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (x < 0 || x > viewport.width || y < 0 || y > viewport.height) return null;

  return { x, y };
}
