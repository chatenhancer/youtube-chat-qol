/*
 * DOM screenshot generation script.
 *
 * Opens the generated docs pages in headless Chrome, captures each showcase
 * panel at 2x resolution, then writes store-ready 1280x800 screenshots.
 *
 * Uploadable screenshot outputs live under dist/screenshots so localized
 * store assets do not flood source control. The English README showcase is
 * also copied to assets/readme-showcase.png so GitHub can load it from a
 * tracked public asset path.
 */
import { access, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { once } from 'node:events';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsBuildDir = path.join(root, 'dist', 'docs');
const readmeAssetsDir = path.join(root, 'assets');
const distScreenshotsDir = path.join(root, 'dist', 'screenshots');

const viewportSize = {
  width: 1280,
  height: 800
};

const rawSize = {
  width: viewportSize.width * 2,
  height: viewportSize.height * 2
};

const chromeWebStoreSize = {
  width: 1280,
  height: 800
};

const whiteBackground = {
  r: 255,
  g: 255,
  b: 255,
  alpha: 1
};

const panels = [
  { id: 'translation', filename: '01-translation.png' },
  { id: 'inbox-context', filename: '02-inbox-context.png' },
  { id: 'extras', filename: '03-profile-emoji-commands.png' }
];

let chromePath;
let cdp;
let profileDir;

async function main() {
  const selectedLocales = getSelectedLocales();
  chromePath = await findChromeExecutable();
  const localePages = await getLocalePages();
  const pagesToCapture = selectedLocales.length
    ? localePages.filter((page) => selectedLocales.includes(page.locale))
    : localePages;

  if (!pagesToCapture.length) {
    throw new Error(`No docs pages matched locale filter: ${selectedLocales.join(', ')}`);
  }

  profileDir = await mkdtemp(path.join(os.tmpdir(), 'ytcq-dom-screenshots-'));
  let chrome;

  try {
    ({ chrome, cdp } = await startChrome());

    for (const page of pagesToCapture) {
      const outputDir = path.join(distScreenshotsDir, page.locale);
      await rm(outputDir, { force: true, recursive: true });

      const fullSizeDir = path.join(outputDir, 'full-size');
      const chromeWebStoreDir = path.join(outputDir, 'chrome-web-store');

      await mkdir(fullSizeDir, { recursive: true });
      await mkdir(chromeWebStoreDir, { recursive: true });

      const sourcePaths = [];

      for (const panel of panels) {
        const sourcePath = path.join(fullSizeDir, panel.filename);
        await capturePanel({
          htmlPath: page.htmlPath,
          outputPath: sourcePath,
          panelId: panel.id
        });
        await assertScreenshotSize(sourcePath);
        await writeChromeWebStoreScreenshot(sourcePath, path.join(chromeWebStoreDir, panel.filename));
        sourcePaths.push(sourcePath);
      }

      await writeReadmeShowcase(sourcePaths, path.join(outputDir, 'readme-showcase.png'));

      if (page.locale === 'en') {
        await syncEnglishReadmeShowcase(sourcePaths);
      }

      console.log(`Generated DOM screenshots for ${page.locale}`);
    }
  } finally {
    await closeChrome(cdp, chrome);
    await rm(profileDir, {
      force: true,
      maxRetries: 5,
      recursive: true,
      retryDelay: 200
    }).catch((error) => {
      console.warn(`Could not remove temporary Chrome profile ${profileDir}: ${error.message}`);
    });
  }
}

function getSelectedLocales() {
  const localeArg = process.argv.find((arg) => arg.startsWith('--locale='));
  if (!localeArg) return [];
  return localeArg
    .slice('--locale='.length)
    .split(',')
    .map((locale) => locale.trim().replace('_', '-'))
    .filter(Boolean);
}

async function getLocalePages() {
  const entries = await readdir(docsBuildDir, { withFileTypes: true });
  const localizedPages = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const htmlPath = path.join(docsBuildDir, entry.name, 'index.html');
    if (await fileExists(htmlPath)) {
      localizedPages.push({
        htmlPath,
        locale: entry.name
      });
    }
  }

  return [
    {
      htmlPath: path.join(docsBuildDir, 'index.html'),
      locale: 'en'
    },
    ...localizedPages.sort((a, b) => a.locale.localeCompare(b.locale))
  ];
}

async function capturePanel({ htmlPath, outputPath, panelId }) {
  const url = `${pathToFileURL(htmlPath).href}?ytcq-screenshot=${encodeURIComponent(panelId)}`;
  const { targetId } = await cdp.send('Target.createTarget', {
    url: 'about:blank'
  });
  const { sessionId } = await cdp.send('Target.attachToTarget', {
    flatten: true,
    targetId
  });

  try {
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      deviceScaleFactor: 2,
      height: viewportSize.height,
      mobile: false,
      width: viewportSize.width
    }, sessionId);

    const loaded = cdp.waitForEvent('Page.loadEventFired', sessionId, 15000);
    await cdp.send('Page.navigate', { url }, sessionId);
    await loaded;
    await waitForPageAssets(sessionId);

    const screenshot = await cdp.send('Page.captureScreenshot', {
      captureBeyondViewport: false,
      format: 'png',
      fromSurface: true
    }, sessionId);

    await writeFile(outputPath, Buffer.from(screenshot.data, 'base64'));
  } catch (error) {
    throw new Error(`Failed to capture ${path.relative(root, outputPath)}: ${error.message}`);
  } finally {
    await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  }
}

async function waitForPageAssets(sessionId) {
  await cdp.send('Runtime.evaluate', {
    awaitPromise: true,
    expression: `Promise.all([
      document.fonts?.ready || Promise.resolve(),
      ...Array.from(document.images, (image) => image.complete ? Promise.resolve() : new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      }))
    ])`
  }, sessionId);
}

async function assertScreenshotSize(filePath) {
  const metadata = await sharp(filePath).metadata();
  if (metadata.width !== rawSize.width || metadata.height !== rawSize.height) {
    throw new Error(
      `${path.relative(root, filePath)} rendered at ${metadata.width}x${metadata.height}; expected ${rawSize.width}x${rawSize.height}.`
    );
  }
}

async function writeChromeWebStoreScreenshot(inputPath, outputPath) {
  await sharp(inputPath)
    .resize(chromeWebStoreSize.width, chromeWebStoreSize.height, {
      fit: 'contain',
      position: 'center',
      background: whiteBackground
    })
    .flatten({ background: whiteBackground })
    .png()
    .toFile(outputPath);
}

async function writeReadmeShowcase(sourcePaths, outputPath) {
  const normalizedScreenshots = await Promise.all(sourcePaths.map((sourcePath) => sharp(sourcePath)
    .resize(viewportSize.width, viewportSize.height, {
      fit: 'contain',
      position: 'center',
      background: whiteBackground
    })
    .flatten({ background: whiteBackground })
    .png()
    .toBuffer()));

  const showcase = await sharp({
    create: {
      width: viewportSize.width,
      height: viewportSize.height * normalizedScreenshots.length,
      channels: 4,
      background: whiteBackground
    }
  })
    .composite(normalizedScreenshots.map((input, index) => ({
      input,
      left: 0,
      top: index * viewportSize.height
    })))
    .png()
    .toBuffer();

  await sharp(showcase).toFile(outputPath);
}

async function syncEnglishReadmeShowcase(sourcePaths) {
  await mkdir(readmeAssetsDir, { recursive: true });
  await writeReadmeShowcase(sourcePaths, path.join(readmeAssetsDir, 'readme-showcase.png'));
}

async function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    which('google-chrome'),
    which('google-chrome-stable'),
    which('chromium'),
    which('chromium-browser')
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }

  throw new Error('Could not find Chrome. Install Chrome or set CHROME_BIN=/path/to/chrome.');
}

async function startChrome() {
  const port = await getAvailablePort();
  const args = [
    '--headless=new',
    '--disable-background-networking',
    '--disable-gpu',
    '--disable-sync',
    '--hide-scrollbars',
    '--no-default-browser-check',
    '--no-first-run',
    '--run-all-compositor-stages-before-draw',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    `--window-size=${viewportSize.width},${viewportSize.height}`,
    'about:blank'
  ];
  const chromeProcess = spawn(chromePath, args, {
    stdio: ['ignore', 'ignore', 'pipe']
  });

  let stderr = '';
  chromeProcess.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const version = await waitForCdpVersion(port, chromeProcess, () => stderr);
  const client = await CdpClient.connect(version.webSocketDebuggerUrl);

  return {
    cdp: client,
    chrome: chromeProcess
  };
}

async function closeChrome(client, chromeProcess) {
  if (!chromeProcess) return;

  if (client) {
    await client.send('Browser.close').catch(() => {});
    client.close();
  }

  if (chromeProcess.exitCode === null && chromeProcess.signalCode === null) {
    const exited = once(chromeProcess, 'exit').then(() => true);
    const timedOut = new Promise((resolve) => setTimeout(() => resolve(false), 2000));
    if (!await Promise.race([exited, timedOut])) {
      chromeProcess.kill('SIGTERM');
    }
  }
}

async function waitForCdpVersion(port, chromeProcess, getStderr) {
  const url = `http://127.0.0.1:${port}/json/version`;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (chromeProcess.exitCode !== null || chromeProcess.signalCode !== null) {
      throw new Error(`Chrome exited before DevTools was ready.\n${getStderr()}`);
    }

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.ok) return response.json();
    } catch {
      // Chrome is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for Chrome DevTools.\n${getStderr()}`);
}

async function getAvailablePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  server.close();
  await once(server, 'close');
  return port;
}

class CdpClient {
  constructor(socket) {
    this.nextId = 1;
    this.pending = new Map();
    this.eventWaiters = [];
    this.socket = socket;
    this.socket.addEventListener('message', (event) => this.handleMessage(event));
    this.socket.addEventListener('close', () => this.rejectAll(new Error('Chrome DevTools socket closed.')));
    this.socket.addEventListener('error', () => this.rejectAll(new Error('Chrome DevTools socket errored.')));
  }

  static async connect(webSocketUrl) {
    const socket = new WebSocket(webSocketUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new CdpClient(socket);
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { reject, resolve });
      this.socket.send(JSON.stringify(payload));
    });
  }

  waitForEvent(method, sessionId, timeoutMs) {
    return new Promise((resolve, reject) => {
      const waiter = {
        method,
        reject,
        resolve,
        sessionId,
        timeout: setTimeout(() => {
          this.eventWaiters = this.eventWaiters.filter((entry) => entry !== waiter);
          reject(new Error(`Timed out waiting for CDP event ${method}.`));
        }, timeoutMs)
      };
      this.eventWaiters.push(waiter);
    });
  }

  close() {
    this.socket.close();
  }

  handleMessage(event) {
    const message = JSON.parse(String(event.data));

    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(`${message.error.message}: ${message.error.data || ''}`));
      } else {
        pending.resolve(message.result || {});
      }
      return;
    }

    this.eventWaiters = this.eventWaiters.filter((waiter) => {
      if (waiter.method === message.method && waiter.sessionId === message.sessionId) {
        clearTimeout(waiter.timeout);
        waiter.resolve(message.params || {});
        return false;
      }
      return true;
    });
  }

  rejectAll(error) {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();

    for (const waiter of this.eventWaiters) {
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
    this.eventWaiters = [];
  }
}

await main();

function which(binaryName) {
  const result = spawnSync('which', [binaryName], { encoding: 'utf8' });
  if (result.status !== 0) return '';
  return result.stdout.trim();
}

async function fileExists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
