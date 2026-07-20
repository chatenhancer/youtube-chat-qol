#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getWalkthroughLocales } from './walkthrough-locales.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const captureScriptPath = path.join(scriptDir, 'capture-walkthrough-demo.mjs');
const supportedLocales = await getWalkthroughLocales();
const locales = readRequestedLocales(process.argv.slice(2), supportedLocales);
const workerCount = readWorkerCount(process.argv.slice(2), locales.length);
const captureArgs = process.argv.includes('--preview') ? ['--preview'] : [];
const maxAttemptsPerLocale = 2;
let nextLocaleIndex = 0;
let completedLocales = 0;
const failures = [];

console.log(
  `[walkthrough] Rendering ${locales.length} locale${locales.length === 1 ? '' : 's'} ` +
  `with ${workerCount} parallel profile${workerCount === 1 ? '' : 's'}.`
);

await Promise.all(Array.from({ length: workerCount }, runWorker));

if (failures.length) {
  throw new AggregateError(
    failures.map(({ error }) => error),
    `Walkthrough rendering failed for: ${failures.map(({ locale }) => locale).join(', ')}.`
  );
}

console.log(`[walkthrough] Rendered ${locales.length} localized walkthrough videos.`);

async function runWorker() {
  while (true) {
    const localeIndex = nextLocaleIndex;
    nextLocaleIndex += 1;
    if (localeIndex >= locales.length) return;

    const locale = locales[localeIndex];
    console.log(`[walkthrough:${locale}] Starting ${localeIndex + 1}/${locales.length}.`);
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttemptsPerLocale; attempt += 1) {
      try {
        await runProcess(process.execPath, [captureScriptPath, `--locale=${locale}`, ...captureArgs]);
        completedLocales += 1;
        lastError = null;
        console.log(`[walkthrough:${locale}] Finished (${completedLocales}/${locales.length}).`);
        break;
      } catch (error) {
        lastError = error;
        if (attempt < maxAttemptsPerLocale) {
          console.warn(`[walkthrough:${locale}] Capture failed; retrying once with a fresh profile.`);
        }
      }
    }

    if (lastError) {
      failures.push({ error: lastError, locale });
      console.error(`[walkthrough:${locale}] Failed after ${maxAttemptsPerLocale} attempts.`);
    }
  }
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        YTCQ_DEMO_CLEANUP_PROFILE: '1',
        YTCQ_DEMO_PROGRESS_LINES: '1',
        YTCQ_DEMO_PROGRESS_MS: process.env.YTCQ_DEMO_PROGRESS_MS || '5000'
      },
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} failed with ${signal || `exit code ${code}`}.`));
    });
  });
}

function readRequestedLocales(args, supportedLocales) {
  const localesArgument = args.find((argument) => argument.startsWith('--locales='));
  const requestedValue = localesArgument?.slice('--locales='.length) || process.env.YTCQ_DEMO_LOCALES;
  if (!requestedValue) return supportedLocales;

  const requestedLocales = [...new Set(requestedValue.split(',').map((locale) => locale.trim()).filter(Boolean))];
  const unsupportedLocales = requestedLocales.filter((locale) => !supportedLocales.includes(locale));
  if (unsupportedLocales.length) {
    throw new Error(
      `Unsupported walkthrough locales: ${unsupportedLocales.join(', ')}. ` +
      `Expected: ${supportedLocales.join(', ')}.`
    );
  }
  if (!requestedLocales.length) throw new Error('At least one walkthrough locale is required.');
  return requestedLocales;
}

function readWorkerCount(args, localeCount) {
  const workersArgument = args.find((argument) => argument.startsWith('--workers='));
  const rawValue = workersArgument?.slice('--workers='.length) || process.env.YTCQ_DEMO_WORKERS || '2';
  const workerCount = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(workerCount) || workerCount < 1) {
    throw new Error(`Walkthrough workers must be a positive integer, received: ${rawValue}.`);
  }
  return Math.min(workerCount, localeCount);
}
