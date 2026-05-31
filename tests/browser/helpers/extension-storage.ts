/**
 * WebExtension storage helpers for browser tests.
 *
 * Tests use an extension page to read and write chrome.storage because content
 * scripts cannot call extension APIs from the page context.
 */
import type { BrowserContext, Page } from '@playwright/test';
import { getExtensionId } from './extension';

type StorageArea = 'local' | 'sync';
type StorageValues = Record<string, unknown>;

export async function withExtensionStorageValues<T>(
  context: BrowserContext,
  area: StorageArea,
  values: StorageValues,
  callback: () => Promise<T>
): Promise<T> {
  const keys = Object.keys(values);
  const previous = await readExtensionStorageValues(context, area, keys);
  await setExtensionStorageValues(context, area, values);

  try {
    return await callback();
  } finally {
    await restoreExtensionStorageValues(context, area, previous);
  }
}

async function readExtensionStorageValues(
  context: BrowserContext,
  area: StorageArea,
  keys: string[]
): Promise<{
  requestedKeys: string[];
  existingKeys: string[];
  values: StorageValues;
}> {
  return withExtensionPage(context, (page) => page.evaluate(
    ({ storageArea, storageKeys }) => new Promise((resolve) => {
      chrome.storage[storageArea].get(storageKeys, (stored) => {
        resolve({
          requestedKeys: storageKeys,
          existingKeys: Object.keys(stored),
          values: stored
        });
      });
    }),
    { storageArea: area, storageKeys: keys }
  ));
}

async function setExtensionStorageValues(
  context: BrowserContext,
  area: StorageArea,
  values: StorageValues
): Promise<void> {
  await withExtensionPage(context, (page) => page.evaluate(
    ({ storageArea, storageValues }) => new Promise<void>((resolve) => {
      chrome.storage[storageArea].set(storageValues, () => resolve());
    }),
    { storageArea: area, storageValues: values }
  ));
}

async function restoreExtensionStorageValues(
  context: BrowserContext,
  area: StorageArea,
  previous: {
    requestedKeys: string[];
    existingKeys: string[];
    values: StorageValues;
  }
): Promise<void> {
  const keysToRemove = previous.requestedKeys
    .filter((key) => !previous.existingKeys.includes(key));

  await withExtensionPage(context, (page) => page.evaluate(
    ({ storageArea, storageKeys, storageValues }) => new Promise<void>((resolve) => {
      chrome.storage[storageArea].remove(storageKeys, () => {
        chrome.storage[storageArea].set(storageValues, () => resolve());
      });
    }),
    {
      storageArea: area,
      storageKeys: keysToRemove,
      storageValues: previous.values
    }
  ));
}

async function withExtensionPage<T>(
  context: BrowserContext,
  callback: (page: Page) => Promise<T>
): Promise<T> {
  const extensionId = await getExtensionId(context);
  const page = await context.newPage();

  try {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    return await callback(page);
  } finally {
    await page.close();
  }
}
