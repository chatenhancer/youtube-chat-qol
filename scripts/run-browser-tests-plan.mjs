/*
 * Pure command planning for browser smoke tests.
 *
 * Kept separate from process spawning so command-line behavior can be unit
 * tested without launching Playwright or rebuilding the extension.
 */
const COMBINED_REPORT_DIR = 'playwright-report/browser';
const PROJECT_REPORT_DIRS = new Map([
  ['youtube-mock', 'playwright-report/youtube-mock'],
  ['youtube-live', 'playwright-report/youtube-live']
]);

export function createBrowserTestPlan(args) {
  const shouldBuild = !args.includes('--no-build');
  const playwrightArgs = [
    'test',
    '--config=playwright.config.ts',
    ...args.filter((arg) => arg !== '--no-build')
  ];

  return {
    playwrightArgs,
    reportOutputFolder: getReportOutputFolder(playwrightArgs),
    shouldBuild
  };
}

function getReportOutputFolder(playwrightArgs) {
  const projects = new Set();
  for (let index = 0; index < playwrightArgs.length; index += 1) {
    const arg = playwrightArgs[index];
    if (arg === '--project' && typeof playwrightArgs[index + 1] === 'string') {
      projects.add(playwrightArgs[index + 1]);
    } else if (arg.startsWith('--project=')) {
      projects.add(arg.slice('--project='.length));
    }
  }

  if (projects.size !== 1) return COMBINED_REPORT_DIR;

  const [project] = projects;
  return PROJECT_REPORT_DIRS.get(project) ?? COMBINED_REPORT_DIR;
}
