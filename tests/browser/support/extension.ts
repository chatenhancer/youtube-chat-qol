/**
 * Extension detection helpers for browser smoke tests.
 *
 * Playwright needs the extension id to open the popup. The logged-in YouTube
 * smoke also validates that Chat Enhancer is installed in the persistent
 * Chrome profile before it opens a real livestream.
 */
import type { BrowserContext, Worker } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { extensionDir } from './paths';

export async function getExtensionId(context: BrowserContext): Promise<string> {
  const serviceWorker = await getExtensionServiceWorker(context);

  const match = serviceWorker.url().match(/^chrome-extension:\/\/([^/]+)\//);
  if (!match) {
    throw new Error(`Could not resolve extension id from service worker URL: ${serviceWorker.url()}`);
  }

  return match[1];
}

export async function getExtensionServiceWorker(context: BrowserContext): Promise<Worker> {
  const serviceWorker = await findChatEnhancerServiceWorker(context.serviceWorkers());
  if (serviceWorker) return serviceWorker;

  const startedAt = Date.now();
  let remainingMs = 15_000;

  while (remainingMs > 0) {
    const candidate = await context.waitForEvent('serviceworker', {
      predicate: isPossibleExtensionServiceWorker,
      timeout: remainingMs
    });
    if (await isChatEnhancerServiceWorker(candidate)) return candidate;
    remainingMs = 15_000 - (Date.now() - startedAt);
  }

  throw new Error('Could not find the Chat Enhancer extension service worker.');
}

async function findChatEnhancerServiceWorker(serviceWorkers: Worker[]): Promise<Worker | null> {
  for (const serviceWorker of serviceWorkers) {
    if (await isChatEnhancerServiceWorker(serviceWorker)) return serviceWorker;
  }
  return null;
}

function isPossibleExtensionServiceWorker(serviceWorker: Worker): boolean {
  return /^chrome-extension:\/\/[^/]+\/background\.js$/u.test(serviceWorker.url());
}

async function isChatEnhancerServiceWorker(serviceWorker: Worker): Promise<boolean> {
  if (!isPossibleExtensionServiceWorker(serviceWorker)) return false;

  return serviceWorker.evaluate(() => {
    const manifest = chrome.runtime.getManifest();
    const background = manifest.background;
    const backgroundServiceWorker = background && 'service_worker' in background
      ? background.service_worker
      : '';
    const hasLiveChatContentScript = Boolean(manifest.content_scripts?.some((contentScript) => {
      return contentScript.matches?.some((matchPattern) => matchPattern.includes('youtube.com/live_chat'));
    }));

    return manifest.default_locale === 'en' &&
      manifest.action?.default_popup === 'popup.html' &&
      backgroundServiceWorker === 'background.js' &&
      hasLiveChatContentScript &&
      Boolean(chrome.storage?.local && chrome.storage?.sync);
  }).catch(() => false);
}

export async function getInstalledProfileExtensionId(profileDir: string): Promise<string | null> {
  const preferencesPaths = [
    path.join(profileDir, 'Default', 'Preferences'),
    path.join(profileDir, 'Default', 'Secure Preferences')
  ];

  for (const preferencesPath of preferencesPaths) {
    const preferences = await readJsonFile<ChromePreferences>(preferencesPath).catch(() => null);
    const settings = preferences?.extensions?.settings;
    if (!settings) continue;

    for (const [extensionId, extensionSettings] of Object.entries(settings)) {
      if (!isChatEnhancerExtensionSettings(extensionSettings)) continue;
      return extensionId;
    }
  }

  return null;
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

function isChatEnhancerExtensionSettings(settings: ChromeExtensionSettings): boolean {
  if (settings.state !== undefined && settings.state !== 1) return false;

  const installedPath = settings.path ? path.resolve(settings.path) : '';
  if (installedPath && installedPath === path.resolve(extensionDir)) return true;

  const manifest = settings.manifest;
  return manifest?.name === '__MSG_extensionName__' &&
    manifest.default_locale === 'en' &&
    manifest.action?.default_popup === 'popup.html' &&
    manifest.background?.service_worker === 'background.js' &&
    Boolean(manifest.content_scripts?.some((contentScript) => {
      return contentScript.matches?.some((matchPattern) => matchPattern.includes('youtube.com/live_chat'));
    }));
}

interface ChromePreferences {
  extensions?: {
    settings?: Record<string, ChromeExtensionSettings>;
  };
}

interface ChromeExtensionSettings {
  action?: unknown;
  background?: unknown;
  location?: number;
  manifest?: {
    action?: {
      default_popup?: string;
    };
    background?: {
      service_worker?: string;
    };
    content_scripts?: Array<{
      matches?: string[];
    }>;
    default_locale?: string;
    name?: string;
  };
  path?: string;
  state?: number;
}
