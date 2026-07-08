# Browser tests

Browser tests run the built extension in Chromium through Playwright. They cover
behavior Vitest cannot cover: content-script wiring, injected UI, composer
behavior, popup status, and real YouTube DOM compatibility.

## Layout

```text
tests/browser/
  support/     launchers, fixtures, storage, popup, DOM, and YouTube helpers
  scenarios/   reusable feature-level behavior checks
  specs/       Playwright plan files
```

- `support/` is shared test plumbing.
- `scenarios/` contains reusable checks with one fixed assertion set.
- `specs/` decides which scenarios run on mock, live, replay, or performance
  surfaces.

Spec groups:

- `yt-mock-*`: deterministic YouTube-like fixture, broad and CI-safe.
- `yt-live-*`: real YouTube pages for DOM, iframe, composer, menu, and provider
  regressions.
- `yt-mock-perf-*`: mock performance workloads and reports.
- Replay specs cover YouTube's read-only `live_chat_replay` iframe.

## Commands

Fresh `npm install` installs Playwright Chromium unless this environment
variable is set:

```sh
YTCQ_SKIP_PLAYWRIGHT_INSTALL=1 npm install
```

Commands:

- `npm run test:browser:install`: install Playwright Chromium.
- `npm run test:browser:install-deps`: install Chromium and Linux system
  dependencies.
- `npm run test:browser:mock`: run deterministic mock browser specs.
- `npm run test:browser:live`: run real YouTube browser specs.
- `npm run test:browser`: run all browser behavior specs.
- `npm run test:browser:flake`: repeat browser behavior specs.
- `npm run test:browser:perf`: run mock browser performance specs.
- `npm run test:browser:perf:live`: run the manual hybrid real-DOM benchmark.
- `npm run test:all`: run Vitest, browser behavior specs, and mock performance
  specs once.

Subset examples with Playwright grep:

```sh
npm run test:browser:live -- -g logged-in
npm run test:browser:mock -- -g "focus panel"
```

Visible-browser debugging:

```sh
YTCQ_TEST_HEADLESS=0 npm run test:browser:mock
YTCQ_TEST_LIVE_HEADLESS=0 npm run test:browser:live
```

## Logged-in live setup

Prepare the dedicated Chrome profile with:

```sh
npm run test:youtube-login
```

In the opened `.chrome-test-profiles/pristine/` window:

1. Sign in to YouTube.
2. Open `chrome://extensions`.
3. Enable Developer Mode.
4. Load `dist/extension-chrome` if needed.
5. Make sure the extension is enabled.

Do not use a personal Chrome profile. Logged-in live specs copy the pristine
profile into generated working profiles for each run.

Browser sessions are worker-scoped. Single-worker runs keep a shared timeline
while debugging:

```sh
YTCQ_TEST_WORKERS=1 npm run test:browser
```

## Reports and artifacts

Reports open with:

```sh
npx playwright show-report playwright-report/browser
npx playwright show-report playwright-report/youtube-mock
npx playwright show-report playwright-report/youtube-live
npx playwright show-report playwright-report/performance
```

Local failure artifacts are under `test-results/browser/`. They may include
screenshots, videos, traces, and DOM dumps. A trace opens directly with:

```sh
npx playwright show-trace test-results/browser/<failed-test>/trace.zip
```

GitHub Actions uploads failed mock artifacts from
`test-results/browser/mock-artifacts/`. Live YouTube artifacts can contain real
chat text; CI keeps live artifact capture disabled by default.
