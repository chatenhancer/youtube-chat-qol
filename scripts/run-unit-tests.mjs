/*
 * Unit-test runner.
 *
 * Local runs keep Vitest's normal output. CI asks Vitest for a JSON report so
 * the workflow can write one repo-owned test summary instead of separate
 * framework-branded summaries.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const DEFAULT_UNIT_REPORT_JSON = path.join('test-results', 'unit', 'vitest-report.json');
const args = process.argv.slice(2);
const reportPath = getUnitReportPath();
const vitestArgs = ['run', ...args];

if (reportPath) {
  vitestArgs.push(
    '--reporter=default',
    '--reporter=json',
    `--outputFile.json=${reportPath}`
  );
}

const result = spawnSync(getVitestCommand(), vitestArgs, {
  env: process.env,
  stdio: 'inherit'
});

process.exit(result.status ?? 1);

function getUnitReportPath() {
  if (process.env.YTCQ_UNIT_REPORT_JSON) return process.env.YTCQ_UNIT_REPORT_JSON;
  if (process.env.GITHUB_STEP_SUMMARY) return DEFAULT_UNIT_REPORT_JSON;
  return '';
}

function getVitestCommand() {
  return process.platform === 'win32' ? 'vitest.cmd' : 'vitest';
}
