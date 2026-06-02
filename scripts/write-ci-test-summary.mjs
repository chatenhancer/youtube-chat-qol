/*
 * GitHub Actions test summary writer.
 *
 * Reads the machine-readable reports produced by the unit and browser runners
 * and writes one Chat Enhancer summary to GITHUB_STEP_SUMMARY.
 */
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const UNIT_REPORT_JSON = process.env.YTCQ_UNIT_REPORT_JSON || path.join('test-results', 'unit', 'vitest-report.json');
const BROWSER_REPORT_JSON = process.env.YTCQ_PLAYWRIGHT_JSON_REPORT || path.join('test-results', 'browser', 'playwright-report.json');

const unitReport = await readJsonFile(UNIT_REPORT_JSON);
const browserReport = await readJsonFile(BROWSER_REPORT_JSON);
const markdown = buildSummary({
  browser: browserReport ? summarizeBrowserReport(browserReport) : null,
  unit: unitReport ? summarizeUnitReport(unitReport) : null
});

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`, 'utf8');
} else {
  console.log(markdown);
}

function buildSummary({ browser, unit }) {
  const lines = [
    '## Chat Enhancer Test Report',
    '',
    '| Suite | Files | Tests | Result |',
    '| --- | ---: | ---: | --- |'
  ];

  lines.push(formatSuiteRow('Unit', unit));
  lines.push(formatSuiteRow('Browser', browser));

  if (browser?.projects.length) {
    lines.push(
      '',
      '<details>',
      '<summary>Browser project breakdown</summary>',
      '',
      '| Project | Tests | Result |',
      '| --- | ---: | --- |'
    );
    for (const project of browser.projects) {
      lines.push(`| ${escapeMarkdown(project.name)} | ${formatTestCount(project)} | ${formatResult(project)} |`);
    }
    lines.push('', '</details>');
  }

  const missing = [];
  if (!unit) missing.push(`unit report: \`${UNIT_REPORT_JSON}\``);
  if (!browser) missing.push(`browser report: \`${BROWSER_REPORT_JSON}\``);
  if (missing.length) {
    lines.push('', `Missing reports: ${missing.join(', ')}.`);
  }

  lines.push('', `Job summary generated at run-time.`);
  return lines.join('\n');
}

function formatSuiteRow(label, summary) {
  if (!summary) return `| ${label} | - | - | ⚪ not available |`;
  return [
    `| ${label}`,
    formatFileCount(summary),
    formatTestCount(summary),
    formatResult(summary)
  ].join(' | ') + ' |';
}

function formatFileCount(summary) {
  if (summary.failedFiles) {
    return `${statusIcon(summary)} ${summary.passedFiles} passed · ${summary.failedFiles} failed · ${summary.totalFiles} total`;
  }
  return `${statusIcon(summary)} ${summary.passedFiles} passed · ${summary.totalFiles} total`;
}

function formatTestCount(summary) {
  const parts = [];
  if (summary.passedTests) parts.push(`${summary.passedTests} passed`);
  if (summary.failedTests) parts.push(`${summary.failedTests} failed`);
  if (summary.flakyTests) parts.push(`${summary.flakyTests} flaky`);
  if (summary.skippedTests) parts.push(`${summary.skippedTests} skipped`);
  if (!parts.length) parts.push('0 passed');
  parts.push(`${summary.totalTests} total`);
  return `${statusIcon(summary)} ${parts.join(' · ')}`;
}

function formatResult(summary) {
  if (summary.failedTests || summary.failedFiles) return '❌ failed';
  if (summary.flakyTests) return '⚠️ flaky';
  return '✅ passed';
}

function statusIcon(summary) {
  if (summary.failedTests || summary.failedFiles) return '❌';
  if (summary.flakyTests) return '⚠️';
  return '✅';
}

function summarizeUnitReport(report) {
  const files = Array.isArray(report.testResults) ? report.testResults : [];
  const failedFiles = files.filter((file) => file.status === 'failed').length;
  const pendingFiles = files.filter((file) => file.status !== 'passed' && file.status !== 'failed').length;
  return {
    failedFiles,
    failedTests: Number(report.numFailedTests || 0),
    flakyTests: 0,
    passedFiles: files.length - failedFiles - pendingFiles,
    passedTests: Number(report.numPassedTests || 0),
    projects: [],
    skippedTests: Number(report.numPendingTests || 0) + Number(report.numTodoTests || 0),
    totalFiles: files.length,
    totalTests: Number(report.numTotalTests || 0)
  };
}

function summarizeBrowserReport(report) {
  const tests = collectBrowserTests(report);
  const files = new Map();
  const projects = new Map();
  const summary = createEmptyBrowserSummary();

  for (const test of tests) {
    addBrowserStatus(summary, test.status);

    const file = files.get(test.file) || createEmptyBrowserSummary();
    addBrowserStatus(file, test.status);
    files.set(test.file, file);

    const project = projects.get(test.projectName) || {
      ...createEmptyBrowserSummary(),
      name: test.projectName || 'unknown'
    };
    addBrowserStatus(project, test.status);
    projects.set(project.name, project);
  }

  summary.totalFiles = files.size;
  summary.passedFiles = [...files.values()].filter((file) => !file.failedTests && !file.flakyTests).length;
  summary.failedFiles = [...files.values()].filter((file) => file.failedTests).length;
  summary.projects = [...projects.values()].sort((a, b) => a.name.localeCompare(b.name));
  return summary;
}

function collectBrowserTests(report) {
  const tests = [];
  for (const suite of report.suites || []) {
    collectBrowserTestsFromSuite(suite, suite.file || '', tests);
  }
  return tests;
}

function collectBrowserTestsFromSuite(suite, inheritedFile, tests) {
  const file = suite.file || inheritedFile;
  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      tests.push({
        file: spec.file || file,
        projectName: test.projectName || test.projectId || 'unknown',
        status: test.status || 'unknown'
      });
    }
  }
  for (const child of suite.suites || []) {
    collectBrowserTestsFromSuite(child, file, tests);
  }
}

function createEmptyBrowserSummary() {
  return {
    failedFiles: 0,
    failedTests: 0,
    flakyTests: 0,
    passedFiles: 0,
    passedTests: 0,
    projects: [],
    skippedTests: 0,
    totalFiles: 0,
    totalTests: 0
  };
}

function addBrowserStatus(summary, status) {
  summary.totalTests += 1;
  if (status === 'expected') {
    summary.passedTests += 1;
  } else if (status === 'flaky') {
    summary.flakyTests += 1;
  } else if (status === 'skipped') {
    summary.skippedTests += 1;
  } else {
    summary.failedTests += 1;
  }
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function escapeMarkdown(value) {
  return String(value).replace(/\|/g, '\\|');
}
