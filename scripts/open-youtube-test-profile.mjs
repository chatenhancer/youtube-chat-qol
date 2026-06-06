#!/usr/bin/env node
/**
 * Open the persistent YouTube smoke-test profile in a normal browser.
 *
 * Google may block sign-in from Playwright-controlled browsers. This script
 * opens the repo-local `.chrome-test-profiles/pristine` with a normal Chrome
 * launch so a developer can sign in to YouTube web once. It keeps running until
 * YouTube's own page config reports that the web session is signed in.
 */
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profileDir = path.resolve(process.env.YTCQ_CHROME_PROFILE || path.join(repoRoot, '.chrome-test-profiles', 'pristine'));
const extensionDir = path.join(repoRoot, 'dist', 'extension-chrome');
const liveUrl = process.env.YTCQ_LIVE_URL || 'https://www.youtube.com/@LofiGirl/live';
const authCookieNames = [
  'APISID',
  'HSID',
  'SAPISID',
  'SID',
  'SSID',
  '__Secure-1PAPISID',
  '__Secure-1PSID',
  '__Secure-3PAPISID',
  '__Secure-3PSID'
];
const loginWaitMs = Number(process.env.YTCQ_LOGIN_WAIT_MS || 10 * 60_000);
const setupWaitMs = Number(process.env.YTCQ_SETUP_WAIT_MS || 10 * 60_000);

await mkdir(profileDir, { recursive: true });
const remoteDebuggingPort = await getFreePort();
const browserProcess = await openBrowser(profileDir, liveUrl, remoteDebuggingPort);

console.log(`Opened Chrome with profile: ${profileDir}`);
console.log('Sign in to YouTube web in that window.');
console.log('For signed-in extension smoke tests on Chrome 137+, make sure dist/extension-chrome is installed in this profile through chrome://extensions once.');
console.log('This command will close Chrome automatically after YouTube is signed in and Chat Enhancer is installed.');
const browser = await connectToChrome(remoteDebuggingPort);
await waitForYouTubeSignedIn(browser);
console.log('Detected a signed-in YouTube web session in the test profile.');
if (await getInstalledProfileExtensionId()) {
  console.log('Detected Chat Enhancer installed in this Chrome profile.');
} else {
  console.log('Chat Enhancer is not installed in this Chrome profile yet.');
  console.log(`Open chrome://extensions, enable Developer mode, click Load unpacked, and choose: ${extensionDir}`);
  await waitForChatEnhancerInstalled(browserProcess);
  console.log('Detected Chat Enhancer installed in this Chrome profile.');
}
console.log(successMessage('Setup detected: YouTube is signed in and Chat Enhancer is installed. Closing Chrome...'));
await closeBrowser(browser);
await waitForBrowserExit(browserProcess);
if (!hasGoogleAuthCookies()) {
  throw new Error([
    'Google web auth cookies were detected while Chrome was open, but were not present after Chrome closed.',
    'That usually means Chrome opened or saved a different profile than the signed-in smoke test will use.',
    `Expected profile: ${profileDir}`
  ].join('\n'));
}
if (!(await getInstalledProfileExtensionId())) {
  throw new Error([
    'The profile is signed in, but Chat Enhancer was not found as an installed extension after Chrome closed.',
    'Run this command again, open chrome://extensions in that Chrome window, enable Developer mode, click Load unpacked, and choose:',
    extensionDir
  ].join('\n'));
}
console.log(successMessage('Setup complete: saved profile is ready for signed-in YouTube smoke tests.'));

async function openBrowser(userDataDir, url, remotePort) {
  const commonArgs = [
    `--user-data-dir=${userDataDir}`,
    '--profile-directory=Default',
    `--remote-debugging-port=${remotePort}`,
    '--no-first-run',
    url
  ];

  if (process.platform === 'darwin') {
    return spawnBrowser(await getMacChromeExecutable(), commonArgs);
  }

  if (process.platform === 'win32') {
    return spawnBrowser(process.env.YTCQ_CHROME_EXE || 'chrome', commonArgs);
  }

  return spawnBrowser(process.env.YTCQ_CHROME_EXE || 'google-chrome', commonArgs);
}

async function getMacChromeExecutable() {
  if (process.env.YTCQ_CHROME_EXE) return process.env.YTCQ_CHROME_EXE;

  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    path.join(process.env.HOME || '', 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome')
  ];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }

  throw new Error('Could not find Google Chrome. Set YTCQ_CHROME_EXE to the Chrome executable path.');
}

async function fileExists(filePath) {
  return access(filePath).then(() => true, () => false);
}

function spawnBrowser(executable, args) {
  return spawn(executable, args, {
    stdio: 'ignore'
  });
}

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.close(resolve);
  });

  if (!address || typeof address === 'string') {
    throw new Error('Could not reserve a local remote debugging port for Chrome.');
  }

  return address.port;
}

async function waitForBrowserExit(browserProcess) {
  if (browserProcess.exitCode !== null) return;

  await new Promise((resolve, reject) => {
    browserProcess.once('error', reject);
    browserProcess.once('exit', resolve);
  });
}

async function waitForYouTubeSignedIn(browser) {
  const startedAt = Date.now();
  const [context] = browser.contexts();
  if (!context) {
    throw new Error('Could not find the Chrome profile context over the DevTools connection.');
  }

  while (Date.now() - startedAt < loginWaitMs) {
    const page = await getYouTubePage(context);
    if (await isPageSignedIntoYouTube(page)) {
      return;
    }

    await page.waitForTimeout(2_000);
  }

  throw new Error([
    `Timed out after ${Math.round(loginWaitMs / 1000)} seconds waiting for YouTube to report a signed-in web session.`,
    'If Chrome looked signed in, it may have only signed into the browser profile, not YouTube web.',
    `Expected profile: ${profileDir}`
  ].join('\n'));
}

async function waitForChatEnhancerInstalled(browserProcess) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < setupWaitMs) {
    if (await getInstalledProfileExtensionId()) {
      return;
    }
    if (browserProcess.exitCode !== null) {
      return;
    }

    await delay(2_000);
  }

  throw new Error([
    `Timed out after ${Math.round(setupWaitMs / 1000)} seconds waiting for Chat Enhancer to be installed in the test profile.`,
    'Open chrome://extensions, enable Developer mode, click Load unpacked, and choose:',
    extensionDir
  ].join('\n'));
}

async function getYouTubePage(context) {
  const page = context.pages().find((candidate) => isYouTubeUrl(candidate.url()));
  if (page) {
    return page;
  }

  const newPage = await context.newPage();
  await newPage.goto(liveUrl, { waitUntil: 'domcontentloaded' });
  return newPage;
}

function isYouTubeUrl(value) {
  try {
    const { hostname } = new URL(value);
    return hostname === 'youtube.com' || hostname.endsWith('.youtube.com');
  } catch {
    return false;
  }
}

async function isPageSignedIntoYouTube(page) {
  return page.evaluate(() => {
    const ytcfg = globalThis.ytcfg;
    const getConfigValue = ytcfg?.get;
    return typeof getConfigValue === 'function' && Boolean(getConfigValue.call(ytcfg, 'LOGGED_IN'));
  }).catch(() => false);
}

async function connectToChrome(remotePort) {
  const endpoint = `http://127.0.0.1:${remotePort}`;
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < 15_000) {
    try {
      return await chromium.connectOverCDP(endpoint);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => {
        setTimeout(resolve, 250);
      });
    }
  }

  throw new Error(`Could not connect to Chrome DevTools at ${endpoint}: ${String(lastError)}`);
}

async function closeBrowser(browser) {
  const session = await browser.newBrowserCDPSession();
  await session.send('Browser.close').catch(async () => {
    await browser.close().catch(() => undefined);
  });
  await session.detach().catch(() => undefined);
}

function delay(timeoutMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}

function successMessage(message) {
  const prefix = process.env.NO_COLOR ? '[OK]' : '\x1b[32m✓\x1b[0m';
  return `${prefix} ${message}`;
}

function hasGoogleAuthCookies() {
  const cookieDbPath = path.join(profileDir, 'Default', 'Cookies');
  const result = spawnSync('sqlite3', [
    cookieDbPath,
    `select name from cookies where host_key like '%.google.com' and name in (${authCookieNames.map((name) => `'${name}'`).join(',')}) limit 1;`
  ], {
    encoding: 'utf8'
  });

  if (result.error) {
    console.log('Could not inspect Chrome cookies because sqlite3 is unavailable. Waiting anyway...');
    return false;
  }

  return result.status === 0 && Boolean(result.stdout.trim());
}

async function getInstalledProfileExtensionId() {
  const preferencesPaths = [
    path.join(profileDir, 'Default', 'Preferences'),
    path.join(profileDir, 'Default', 'Secure Preferences')
  ];

  for (const preferencesPath of preferencesPaths) {
    const preferences = await readJsonFile(preferencesPath).catch(() => null);
    const settings = preferences?.extensions?.settings;
    if (!settings) continue;

    for (const [extensionId, extensionSettings] of Object.entries(settings)) {
      if (!isChatEnhancerExtensionSettings(extensionSettings)) continue;
      return extensionId;
    }
  }

  return null;
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function isChatEnhancerExtensionSettings(settings) {
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
