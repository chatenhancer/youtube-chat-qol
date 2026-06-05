/*
 * Coverage notice writer.
 *
 * `npm run test:coverage` should report coverage drift without making coverage
 * percentages a hard gate. Test failures still fail through Vitest's exit
 * code; this script only turns the generated summary into a local/CI notice.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const summaryPath = path.join(rootDir, 'coverage', 'unit', 'coverage-summary.json');
const targetPct = 90;

if (!fs.existsSync(summaryPath)) {
  writeNotice('Coverage summary was not found. Run `npm run test:coverage` to generate it.');
  process.exit(0);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')).total;
const metrics = ['lines', 'branches', 'functions', 'statements'];
const belowTarget = metrics
  .map((metric) => ({
    metric,
    pct: Number(summary?.[metric]?.pct)
  }))
  .filter(({ pct }) => Number.isFinite(pct) && pct < targetPct);

if (!belowTarget.length) {
  console.log(`Coverage notice: all tracked metrics are at or above ${targetPct}%.`);
  process.exit(0);
}

writeNotice(`Coverage is below ${targetPct}% for ${belowTarget.map(formatMetric).join(', ')}.`);

function formatMetric({ metric, pct }) {
  return `${metric} ${pct.toFixed(1)}%`;
}

function writeNotice(message) {
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::warning title=Coverage notice::${escapeGithubCommand(message)}`);
    return;
  }

  console.warn(`Coverage notice: ${message}`);
}

function escapeGithubCommand(value) {
  return value
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}
