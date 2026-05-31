/**
 * Extension detection helpers for browser smoke tests.
 *
 * Playwright needs the extension id to open the popup. The signed-in YouTube
 * smoke also validates that Chat Enhancer is installed in the persistent
 * Chrome profile before it opens a real livestream.
 */
import type { BrowserContext, Worker } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { extensionDir } from './paths';

export async function getExtensionId(context: BrowserContext): Promise<string> {
  let serviceWorker = context.serviceWorkers().find(isExtensionServiceWorker);
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', {
      predicate: isExtensionServiceWorker,
      timeout: 15_000
    });
  }

  const match = serviceWorker.url().match(/^chrome-extension:\/\/([^/]+)\//);
  if (!match) {
    throw new Error(`Could not resolve extension id from service worker URL: ${serviceWorker.url()}`);
  }

  return match[1];
}

function isExtensionServiceWorker(serviceWorker: Worker): boolean {
  return serviceWorker.url().startsWith('chrome-extension://');
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
