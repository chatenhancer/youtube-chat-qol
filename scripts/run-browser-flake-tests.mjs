/*
 * Browser flake-test runner.
 *
 * Runs the normal browser suite repeatedly so a suspected flaky fix can be
 * checked. Extra arguments are forwarded to scripts/run-browser-tests.mjs.
 */
import { spawnSync } from 'node:child_process';

const DEFAULT_RUNS = 10;

const { browserArgs, runs } = parseArgs(process.argv.slice(2));
const timings = [];

for (let runIndex = 1; runIndex <= runs; runIndex += 1) {
  console.log(`\n=== browser suite run ${runIndex}/${runs} ===\n`);
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [
    'scripts/run-browser-tests.mjs',
    ...browserArgs
  ], {
    env: process.env,
    stdio: 'inherit'
  });
  const elapsedSeconds = (Date.now() - startedAt) / 1000;
  timings.push(elapsedSeconds);

  if (result.status !== 0) {
    console.error(`\nBrowser flake run ${runIndex}/${runs} failed after ${formatSeconds(elapsedSeconds)}.`);
    process.exit(result.status ?? 1);
  }
}

console.log(`\nBrowser flake run passed ${runs}/${runs} runs.`);
console.log(`Run times: ${timings.map(formatSeconds).join(', ')}`);

function parseArgs(args) {
  const browserArgs = [];
  let runs = getEnvRuns();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--runs') {
      runs = parseRuns(args[index + 1], '--runs');
      index += 1;
    } else if (arg.startsWith('--runs=')) {
      runs = parseRuns(arg.slice('--runs='.length), '--runs');
    } else {
      browserArgs.push(arg);
    }
  }

  return { browserArgs, runs };
}

function getEnvRuns() {
  return process.env.YTCQ_BROWSER_FLAKE_RUNS
    ? parseRuns(process.env.YTCQ_BROWSER_FLAKE_RUNS, 'YTCQ_BROWSER_FLAKE_RUNS')
    : DEFAULT_RUNS;
}

function parseRuns(value, source) {
  const runs = Number(value);
  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error(`${source} must be a positive integer.`);
  }
  return runs;
}

function formatSeconds(seconds) {
  return `${seconds.toFixed(1)}s`;
}
