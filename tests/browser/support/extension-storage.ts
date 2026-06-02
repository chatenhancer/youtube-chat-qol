/**
 * WebExtension storage helpers for browser tests.
 *
 * Tests use the extension service worker to read and write chrome.storage
 * because content scripts cannot call extension APIs from the page context.
 */
import type { BrowserContext, Worker } from '@playwright/test';
import { getExtensionServiceWorker } from './extension';

type StorageArea = 'local' | 'sync';
type StorageValues = Record<string, unknown>;

export async function withExtensionStorageValues<T>(
  context: BrowserContext,
  area: StorageArea,
  values: StorageValues,
  callback: () => Promise<T>
): Promise<T> {
  const keys = Object.keys(values);
  const previous = await readExtensionStorageSnapshot(context, area, keys);
  await setExtensionStorageValues(context, area, values);

  try {
    return await callback();
  } finally {
    await restoreExtensionStorageValues(context, area, previous);
  }
}

export async function withExtensionStorageSnapshot<T>(
  context: BrowserContext,
  area: StorageArea,
  callback: () => Promise<T>
): Promise<T> {
  const previous = await readEntireExtensionStorage(context, area);

  try {
    return await callback();
  } finally {
    await replaceExtensionStorageValues(context, area, previous);
  }
}

export async function getExtensionStorageValues(
  context: BrowserContext,
  area: StorageArea,
  keys: string[]
): Promise<StorageValues> {
  return (await readExtensionStorageSnapshot(context, area, keys)).values;
}

export async function clearExtensionStorageArea(
  context: BrowserContext,
  area: StorageArea
): Promise<void> {
  await replaceExtensionStorageValues(context, area, {});
}

async function readExtensionStorageSnapshot(
  context: BrowserContext,
  area: StorageArea,
  keys: string[]
): Promise<{
  requestedKeys: string[];
  existingKeys: string[];
  values: StorageValues;
}> {
  return withExtensionServiceWorker(context, (serviceWorker) => serviceWorker.evaluate(
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

async function readEntireExtensionStorage(
  context: BrowserContext,
  area: StorageArea
): Promise<StorageValues> {
  return withExtensionServiceWorker(context, (serviceWorker) => serviceWorker.evaluate(
    ({ storageArea }) => new Promise((resolve) => {
      chrome.storage[storageArea].get(null, (stored) => resolve(stored));
    }),
    { storageArea: area }
  ));
}

async function setExtensionStorageValues(
  context: BrowserContext,
  area: StorageArea,
  values: StorageValues
): Promise<void> {
  await withExtensionServiceWorker(context, (serviceWorker) => serviceWorker.evaluate(
    ({ storageArea, storageValues }) => new Promise<void>((resolve) => {
      chrome.storage[storageArea].set(storageValues, () => resolve());
    }),
    { storageArea: area, storageValues: values }
  ));
}

async function replaceExtensionStorageValues(
  context: BrowserContext,
  area: StorageArea,
  values: StorageValues
): Promise<void> {
  await withExtensionServiceWorker(context, (serviceWorker) => serviceWorker.evaluate(
    ({ storageArea, storageValues }) => new Promise<void>((resolve) => {
      chrome.storage[storageArea].clear(() => {
        chrome.storage[storageArea].set(storageValues, () => resolve());
      });
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

  await withExtensionServiceWorker(context, (serviceWorker) => serviceWorker.evaluate(
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

async function withExtensionServiceWorker<T>(
  context: BrowserContext,
  callback: (serviceWorker: Worker) => Promise<T>
): Promise<T> {
  return callback(await getExtensionServiceWorker(context));
}
