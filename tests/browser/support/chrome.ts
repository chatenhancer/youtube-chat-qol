/**
 * Chrome launch and shutdown helpers for browser smoke tests.
 *
 * Fixture tests use Playwright's persistent Chromium context with the unpacked
 * extension loaded by flags. Logged-in YouTube tests use normal Chrome with a
 * prepared profile, then connect over CDP so Google login state is preserved.
 */
import { chromium, type Browser, type BrowserContext, type TestInfo } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { access } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { extensionDir } from './paths';

const MUTE_AUDIO_ARG = '--mute-audio';
const DISABLE_QUIC_ARG = '--disable-quic';

interface LaunchExtensionContextOptions {
  channel?: string;
  headless?: boolean;
  profileDir: string;
  testInfo?: Pick<TestInfo, 'annotations'>;
  userAgent?: string;
}

interface LaunchNormalChromeExtensionContextOptions {
  headless?: boolean;
  initialUrl?: string;
  profileDir: string;
  testInfo?: Pick<TestInfo, 'annotations'>;
  userAgent?: string;
}

interface NormalChromeExtensionContext {
  browser: Browser;
  browserProcess: ChildProcess;
  context: BrowserContext;
  close: () => Promise<void>;
}

export async function launchExtensionContext({
  channel: requestedChannel,
  headless: requestedHeadless,
  profileDir,
  testInfo,
  userAgent
}: LaunchExtensionContextOptions): Promise<BrowserContext> {
  if (!existsSync(extensionDir)) {
    throw new Error('Missing dist/extension-chrome. Run npm run build:chrome first.');
  }

  const headless = requestedHeadless ?? false;
  const channel = requestedChannel || process.env.YTCQ_CHROME_CHANNEL || (headless ? 'chromium' : undefined);
  testInfo?.annotations.push({
    type: 'chrome-profile',
    description: profileDir
  });

  try {
    return await chromium.launchPersistentContext(profileDir, {
      channel,
      headless,
      ignoreDefaultArgs: ['--disable-extensions'],
      viewport: {
        height: 900,
        width: 1280
      },
      ...(userAgent ? { userAgent } : {}),
      args: [
        '--disable-features=DisableLoadExtensionCommandLineSwitch',
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`,
        '--profile-directory=Default',
        '--no-first-run',
        DISABLE_QUIC_ARG,
        MUTE_AUDIO_ARG
      ]
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Opening in existing browser session')) {
      throw new Error([
        `Chrome profile is already open: ${profileDir}`,
        'Close any Chrome window using that profile before rerunning the smoke test.'
      ].join('\n'));
    }

    throw error;
  }
}

export async function closeExtensionContext(context: BrowserContext): Promise<void> {
  await Promise.race([
    context.close(),
    delay(5_000)
  ]);
}

export async function launchNormalChromeExtensionContext({
  headless = false,
  initialUrl,
  profileDir,
  testInfo,
  userAgent
}: LaunchNormalChromeExtensionContextOptions): Promise<NormalChromeExtensionContext> {
  if (!existsSync(extensionDir)) {
    throw new Error('Missing dist/extension-chrome. Run npm run build:chrome first.');
  }

  const remoteDebuggingPort = await getFreePort();
  testInfo?.annotations.push({
    type: 'chrome-profile',
    description: profileDir
  });

  const args = [
    `--user-data-dir=${profileDir}`,
    '--profile-directory=Default',
    `--remote-debugging-port=${remoteDebuggingPort}`,
    '--no-first-run',
    DISABLE_QUIC_ARG,
    MUTE_AUDIO_ARG,
    ...(headless ? [
      '--headless=new',
      '--window-size=1280,900'
    ] : []),
    ...(userAgent ? [`--user-agent=${userAgent}`] : []),
    ...(initialUrl ? [initialUrl] : [])
  ];
  const browserProcess = spawn(await getChromeExecutable(), args, {
    stdio: 'ignore'
  });

  try {
    const browser = await connectToChrome(remoteDebuggingPort, browserProcess, profileDir);
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error('Could not find the normal Chrome profile context.');
    }

    return {
      browser,
      browserProcess,
      context,
      close: async () => {
        await Promise.race([
          closeNormalChrome(browser),
          delay(5_000)
        ]).catch(() => undefined);
        if (browserProcess.exitCode !== null) return;
        await Promise.race([
          waitForProcessExit(browserProcess),
          delay(5_000)
        ]);
        if (browserProcess.exitCode !== null) return;
        browserProcess.kill();
        await Promise.race([
          waitForProcessExit(browserProcess),
          delay(5_000)
        ]);
      }
    };
  } catch (error) {
    browserProcess.kill();
    throw error;
  }
}

async function getFreePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.close(() => resolve());
  });

  if (!address || typeof address === 'string') {
    throw new Error('Could not reserve a local remote debugging port for Chrome.');
  }

  return address.port;
}

async function connectToChrome(
  remoteDebuggingPort: number,
  browserProcess?: ChildProcess,
  profileDir?: string
): Promise<Browser> {
  const endpoint = `http://127.0.0.1:${remoteDebuggingPort}`;
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < 15_000) {
    if (browserProcess?.exitCode !== null) {
      throw new Error([
        `Chrome exited before opening DevTools at ${endpoint}.`,
        profileDir
          ? `The Chrome profile may already be open: ${profileDir}`
          : 'The requested Chrome profile may already be open.',
        'Close that Chrome window before rerunning the smoke test.'
      ].join('\n'));
    }

    try {
      return await chromium.connectOverCDP(endpoint);
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }

  throw new Error(`Could not connect to Chrome DevTools at ${endpoint}: ${String(lastError)}`);
}

async function closeNormalChrome(browser: Browser): Promise<void> {
  const session = await browser.newBrowserCDPSession();
  await session.send('Browser.close').catch(async () => {
    await browser.close().catch(() => undefined);
  });
  await session.detach().catch(() => undefined);
}

function waitForProcessExit(browserProcess: ChildProcess): Promise<void> {
  if (browserProcess.exitCode !== null) return Promise.resolve();

  return new Promise((resolve) => {
    browserProcess.once('exit', () => resolve());
  });
}

function delay(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}

async function getChromeExecutable(): Promise<string> {
  if (process.env.YTCQ_CHROME_EXE) return process.env.YTCQ_CHROME_EXE;

  if (process.platform === 'darwin') {
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      path.join(process.env.HOME || '', 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome')
    ];
    for (const candidate of candidates) {
      if (await fileExists(candidate)) return candidate;
    }
  }

  if (process.platform === 'win32') return 'chrome';
  return 'google-chrome';
}

async function fileExists(filePath: string): Promise<boolean> {
  return access(filePath).then(() => true, () => false);
}
