import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const badgesDir = path.join(rootDir, 'docs', 'badges');

fs.mkdirSync(badgesDir, { recursive: true });

const coverage = readCoverageSummary();
writeBadge('unit-coverage.json', createCoverageBadge(coverage));
writeBadge('unit-tests.json', {
  label: 'unit tests',
  message: String(countUnitTests()),
  color: '8b5cf6'
});
writeBadge('browser-tests.json', createBrowserTestsBadge());

function readCoverageSummary() {
  const summaryPath = path.join(rootDir, 'coverage', 'unit', 'coverage-summary.json');
  if (!fs.existsSync(summaryPath)) return null;

  return JSON.parse(fs.readFileSync(summaryPath, 'utf8')).total;
}

function createCoverageBadge(summary) {
  if (!summary?.lines || !summary?.branches) {
    return {
      label: 'unit coverage',
      message: 'run npm run test:coverage',
      color: 'lightgrey'
    };
  }

  const linePct = Number(summary.lines.pct);
  const branchPct = Number(summary.branches.pct);
  return {
    label: 'unit coverage',
    message: `${formatPercent(linePct)} lines / ${formatPercent(branchPct)} branches`,
    color: coverageColor(Math.min(linePct, branchPct))
  };
}

function createBrowserTestsBadge() {
  const specsDir = path.join(rootDir, 'tests', 'browser', 'specs');
  const specFiles = walk(specsDir).filter((file) => file.endsWith('.spec.ts'));
  const mockCount = countTestsInFiles(specFiles.filter((file) => file.includes(`${path.sep}youtube-mock${path.sep}`)));
  const liveCount = countTestsInFiles(specFiles.filter((file) => file.includes(`${path.sep}youtube-live${path.sep}`)));

  return {
    label: 'browser tests',
    message: `${mockCount} mock / ${liveCount} live`,
    color: '0891b2'
  };
}

function countUnitTests() {
  const testFiles = walk(rootDir).filter((file) => {
    if (!/\.(test)\.(ts|tsx|js|mjs)$/.test(file)) return false;
    const relative = path.relative(rootDir, file);
    return !relative.startsWith(`tests${path.sep}browser${path.sep}`);
  });
  return countTestsInFiles(testFiles);
}

function countTestsInFiles(files) {
  return files.reduce((count, file) => {
    const source = fs.readFileSync(file, 'utf8');
    return count + (source.match(/\b(?:it|test)\s*\(/g) || []).length;
  }, 0);
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];

  const ignored = new Set([
    '.git',
    '.chrome-test-profile',
    'coverage',
    'dist',
    'node_modules',
    'playwright-report',
    'test-results'
  ]);
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    if (ignored.has(entry.name)) return [];

    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(entryPath) : [entryPath];
  });
}

function writeBadge(fileName, badge) {
  const outputPath = path.join(badgesDir, fileName);
  fs.writeFileSync(outputPath, `${JSON.stringify({
    schemaVersion: 1,
    cacheSeconds: 300,
    ...badge
  }, null, 2)}\n`);
}

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

function coverageColor(value) {
  if (value >= 90) return 'brightgreen';
  if (value >= 80) return 'green';
  if (value >= 65) return 'yellow';
  if (value >= 50) return 'orange';
  return 'red';
}
