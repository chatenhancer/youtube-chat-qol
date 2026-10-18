/* Retry the YouTube CI job once on a fresh runner when Google blocks chat setup. */
import type { JSONReport, JSONReportSuite, JSONReportTest } from '@playwright/test/reporter';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface WorkflowRun {
  attempt: number;
  status: string;
  conclusion: string;
  jobs: { databaseId: number; name: string; conclusion: string }[];
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const runId = process.env.YTCQ_RETRY_RUN_ID;
  const reportPath = process.env.YTCQ_RETRY_REPORT;
  const repo = process.env.GH_REPO;
  if (!runId || !reportPath || !repo) throw new Error('Missing YouTube CI retry settings.');

  // Check the current attempt too, in case somebody already retried the original run.
  const run = JSON.parse(execFileSync('gh', [
    'run', 'view', runId, '--repo', repo, '--json', 'attempt,status,conclusion,jobs'
  ], { encoding: 'utf8' }));
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const jobId = getYouTubeChallengeRetryJob(run, report);
  let message = 'No retry: this run was already retried or has failures beyond Google-blocked chat setup.';
  if (jobId !== undefined) {
    // GitHub also re-runs dependent jobs, including the final verification gate.
    execFileSync('gh', ['run', 'rerun', '--repo', repo, '--job', String(jobId)], {
      stdio: 'inherit'
    });
    message = `Requested one fresh-runner retry of the YouTube integration job in run ${runId}.`;
  }
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
  }
}

export function getYouTubeChallengeRetryJob(run: WorkflowRun, report: JSONReport): number | undefined {
  if (run.attempt !== 1 || run.status !== 'completed' || run.conclusion !== 'failure') return;
  const job = run.jobs.find((candidate) => candidate.name === 'Test YouTube integration');
  if (job?.conclusion !== 'failure') return;
  if (run.jobs.some((candidate) => candidate.conclusion === 'failure'
    && candidate !== job && candidate.name !== 'Verify extension')) return;
  if (report.errors?.length) return;

  const failures = collectTests(report.suites ?? [])
    .filter((test) => test.status !== 'expected' && test.status !== 'skipped');
  if (!failures.length || report.stats?.unexpected !== failures.length) return;
  if (!failures.every((test) => test.projectName === 'youtube-live-logged-out'
    && test.status === 'unexpected' && test.results.length > 0
    && test.results.every((result) => result.status === 'failed'
      && isGoogleChallenge(result.error?.message)
      && result.errors.every((error) => isGoogleChallenge(error.message))))) return;

  return job.databaseId;
}

function collectTests(suites: JSONReportSuite[]): JSONReportTest[] {
  return suites.flatMap((suite) => [
    ...(suite.specs ?? []).flatMap((spec) => spec.tests),
    ...collectTests(suite.suites ?? [])
  ]);
}

function isGoogleChallenge(message: string | undefined): boolean {
  return Boolean(message?.startsWith(
    'Error: YouTube live chat did not become ready after two page navigations.\n'
  ) && /^Final URL: https:\/\/www\.google\.com\/sorry\/index\?/m.test(message)
    && /^Chat iframe count: 0$/m.test(message));
}
