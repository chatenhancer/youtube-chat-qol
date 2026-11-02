import type { JSONReport, JSONReportTest } from '@playwright/test/reporter';
import { describe, expect, it } from 'vitest';
import { getYouTubeSetupRetryJob } from './retry-youtube-ci.ts';

const challenge = [
  'Error: YouTube live chat did not become ready after two page navigations.',
  'Requested URL: https://www.youtube.com/watch?v=test',
  'Final URL: https://www.google.com/sorry/index?continue=https://www.youtube.com/',
  'Chat iframe count: 0',
  'Chat renderer count: 0'
].join('\n');
const pollingStall =
  'Error: YouTube did not make a live-chat continuation request through the test interceptor.';

function createRun() {
  return {
    attempt: 1,
    status: 'completed',
    conclusion: 'failure',
    jobs: [
      { databaseId: 42, name: 'Test YouTube integration', conclusion: 'failure' },
      { databaseId: 43, name: 'Verify extension', conclusion: 'failure' },
      { databaseId: 44, name: 'Test extension', conclusion: 'success' }
    ]
  };
}

function createReport(message = challenge, projectName = 'youtube-live-logged-out') {
  const test = {
    status: 'unexpected',
    projectName,
    results: [{ status: 'failed', error: { message }, errors: [{ message }] }]
  } as JSONReportTest;
  const report = {
    errors: [],
    stats: { unexpected: 1 },
    suites: [{ suites: [{ specs: [{ tests: [test] }] }] }]
  } as JSONReport;
  return { report, test };
}

describe('YouTube chat setup CI retry', () => {
  it('selects the YouTube job when chat setup was blocked and provider tests passed', () => {
    const { report, test } = createReport();
    report.suites[0].suites[0].specs[0].tests.push({
      ...test, status: 'expected', projectName: 'integrations', results: []
    });
    expect(getYouTubeSetupRetryJob(createRun(), report)).toBe(42);
  });

  it('selects the YouTube job when chat never started polling during setup', () => {
    const { report, test } = createReport(pollingStall);
    test.results[0].errors = [{
      message: `${pollingStall}\n\n   at support/native-chat-transport.ts:661`
    }];
    expect(getYouTubeSetupRetryJob(createRun(), report)).toBe(42);
  });

  it.each([
    'Error: YouTube did not resume live-chat continuation requests after the chat frame reloaded.',
    `Expected extension control to be visible.\n${pollingStall}`
  ])('does not retry chat polling failures outside setup', (message) => {
    expect(getYouTubeSetupRetryJob(createRun(), createReport(message).report)).toBeUndefined();
  });

  it.each([2, 3])('never retries attempt %s again', (attempt) => {
    expect(getYouTubeSetupRetryJob({ ...createRun(), attempt }, createReport().report))
      .toBeUndefined();
  });

  it.each(['in_progress', 'queued'])('does not retry a run that is %s', (status) => {
    expect(getYouTubeSetupRetryJob({ ...createRun(), status }, createReport().report))
      .toBeUndefined();
  });

  it('does not retry unrelated failed jobs', () => {
    const run = createRun();
    run.jobs[2].conclusion = 'failure';
    expect(getYouTubeSetupRetryJob(run, createReport().report)).toBeUndefined();
  });

  it('requires the YouTube job itself to have failed', () => {
    const run = createRun();
    run.jobs[0].conclusion = 'success';
    expect(getYouTubeSetupRetryJob(run, createReport().report)).toBeUndefined();
  });

  it.each([
    challenge.replace('https://www.google.com/sorry/index?', 'https://www.youtube.com/watch?'),
    challenge.replace('Chat iframe count: 0', 'Chat iframe count: 1'),
    `Expected extension control to be visible.\n${challenge}`
  ])('does not mistake other chat failures for the Google challenge', (message) => {
    expect(getYouTubeSetupRetryJob(createRun(), createReport(message).report)).toBeUndefined();
  });

  it('does not retry when any test has a real failure', () => {
    const { report } = createReport();
    report.suites[0].suites[0].specs[0].tests.push(createReport('Assertion failed').test);
    report.stats.unexpected = 2;
    expect(getYouTubeSetupRetryJob(createRun(), report)).toBeUndefined();
  });

  it('does not retry other projects or additional teardown errors', () => {
    expect(getYouTubeSetupRetryJob(createRun(), createReport(challenge, 'integrations').report))
      .toBeUndefined();
    const { report, test } = createReport();
    test.results[0].errors.push({ message: 'Teardown failed' });
    expect(getYouTubeSetupRetryJob(createRun(), report)).toBeUndefined();
  });

  it('does not retry incomplete reports or global errors', () => {
    expect(getYouTubeSetupRetryJob(createRun(), { suites: [], errors: [] } as unknown as JSONReport))
      .toBeUndefined();
    const { report } = createReport();
    report.errors.push({ message: 'Browser crashed' });
    expect(getYouTubeSetupRetryJob(createRun(), report)).toBeUndefined();
  });
});
