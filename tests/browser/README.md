# Browser tests

Browser tests run the built extension in Chromium through Playwright. They cover
the behavior that Vitest cannot see: content-script attachment, YouTube chat
frame wiring, injected menus and panels, popup status, composer behavior, and
real YouTube DOM compatibility.

## Structure

```text
tests/browser/
  support/     launchers, fixtures, storage, popup, DOM, and YouTube utilities
  scenarios/   reusable feature-level behavior checks
  specs/       flattened Playwright plan files
```

`support/` is test plumbing. It should not export scenarios.

`scenarios/` contains reusable browser checks. A scenario should have one fixed
assertion set everywhere it runs.

`specs/` decides where each scenario runs:

```text
yt-mock-logged-in.spec.ts
yt-mock-logged-out.spec.ts
yt-mock-replay.spec.ts
yt-live-logged-in.spec.ts
yt-live-logged-out.spec.ts
yt-live-replay.spec.ts
yt-mock-perf-*.spec.ts
```

`yt-mock-*` specs use the deterministic local YouTube-like fixture. They are
broad, stable, and safe for CI.

`yt-live-*` specs use real YouTube pages. They are narrower and exist to catch
YouTube DOM, iframe, composer, menu, and provider-integration regressions.

`yt-mock-perf-*` specs use the mock fixture for performance workloads and write
timing/heap reports.

Replay specs cover YouTube's `live_chat_replay` iframe. Replay has no composer,
but read-only chat features should still attach.

## Commands

Fresh `npm install` runs a local postinstall helper that installs Playwright's
Chromium browser. CI skips that helper and installs/caches Chromium explicitly.
Use this opt-out when dependency-only installs are needed:

```sh
YTCQ_SKIP_PLAYWRIGHT_INSTALL=1 npm install
```

Retry the Chromium install manually:

```sh
npm run test:browser:install
```

On Linux, install Chromium plus system dependencies if Playwright reports
missing browser libraries:

```sh
npm run test:browser:install-deps
```

Run deterministic mock browser specs:

```sh
npm run test:browser:mock
```

Run real YouTube browser specs:

```sh
npm run test:browser:live
```

Run all browser behavior specs:

```sh
npm run test:browser
```

Run browser behavior specs repeatedly to check flakiness:

```sh
npm run test:browser:flake
```

Run mock browser performance specs:

```sh
npm run test:browser:perf
```

Run only a subset with Playwright's grep:

```sh
npm run test:browser:live -- -g logged-in
npm run test:browser:mock -- -g "focus panel"
```

Mock and live browser tests run headless by default. Use these when a visible
browser is needed for debugging:

```sh
YTCQ_TEST_HEADLESS=0 npm run test:browser:mock
YTCQ_TEST_LIVE_HEADLESS=0 npm run test:browser:live
```

## Logged-in live setup

Prepare the dedicated Chrome profile with:

```sh
npm run test:youtube-login
```

The helper opens Chrome with `.chrome-test-profiles/pristine/`. In that window:

1. Sign in to YouTube.
2. Open `chrome://extensions`.
3. Enable Developer Mode.
4. Load `dist/extension-chrome` if Chat Enhancer is not already installed.
5. Make sure the extension is enabled.

The helper closes Chrome once it detects both a signed-in YouTube session and
the installed unpacked extension. Do not use a personal everyday Chrome profile
for this.

Logged-in live specs do not run directly against the pristine profile. Each
logged-in live spec copies the pristine profile into a generated working profile
such as:

```text
.chrome-test-profiles/youtube-live-logged-in/
.chrome-test-profiles/youtube-live-replay/
```

Those working profiles are recreated for each run. This lets logged-in live and
replay specs run in parallel without opening the same Chrome profile twice.

## Adding behavior tests

Add reusable behavior in `tests/browser/scenarios/`.

A scenario receives the normalized browser surface:

```ts
async ({ chat, context }) => {
  // chat is either the mock chat page or the real YouTube chat frame
  // context is the browser context that owns the loaded extension
}
```

Then include that scenario in the relevant plan files:

```text
tests/browser/specs/yt-mock-logged-in.spec.ts
tests/browser/specs/yt-mock-logged-out.spec.ts
tests/browser/specs/yt-mock-replay.spec.ts
tests/browser/specs/yt-live-logged-in.spec.ts
tests/browser/specs/yt-live-logged-out.spec.ts
tests/browser/specs/yt-live-replay.spec.ts
```

Prefer running the same scenario on mock and live when the behavior exists on
both. If a deterministic fixture-only check is needed, such as appending a
controlled incoming message, split it into a clearly named mock-only scenario
instead of hiding a mock/live branch inside a shared scenario.

Browser sessions are worker-scoped. Adding another test to one spec file does
not intentionally reopen Chrome for every scenario.

The default worker count is based on the number of browser spec files. Scenarios
inside one spec file run serially against one chat surface; different spec files
can run in parallel with separate browser sessions. Use one worker when
debugging a single shared timeline:

```sh
YTCQ_TEST_WORKERS=1 npm run test:browser
```

## Adding performance tests

Add performance specs as flattened `yt-mock-perf-*.spec.ts` files under
`tests/browser/specs/`.

Use `tests/browser/support/mock-perf.ts` for common instrumentation:

- append mock chat bursts
- mock slow or failing translation responses
- record long tasks and frame gaps
- collect optional heap snapshots
- write JSON and Markdown summaries to `test-results/performance/`

Keep performance tests mock-only unless there is a specific reason to involve
real YouTube. Real YouTube performance numbers are harder to compare because
page load, chat velocity, and network behavior vary.

## Reports and artifacts

Open the combined browser report:

```sh
npx playwright show-report playwright-report/browser
```

Project-specific reports are written when running one project:

```sh
npx playwright show-report playwright-report/youtube-mock
npx playwright show-report playwright-report/youtube-live
```

Open the performance report:

```sh
npx playwright show-report playwright-report/performance
```

Local failure artifacts are under `test-results/browser/`. They may include
screenshots, videos, traces, and DOM dumps. Open a trace directly with:

```sh
npx playwright show-trace test-results/browser/<failed-test>/trace.zip
```

GitHub Actions uploads failed `youtube-mock` artifacts from
`test-results/browser/mock-artifacts/`. Mock chat content is synthetic. Live
YouTube screenshots, videos, traces, and DOM dumps can contain real chat text,
so live artifacts are disabled in CI by default. Rerun failing live tests
locally for full diagnostics, or explicitly set
`YTCQ_CAPTURE_LIVE_BROWSER_ARTIFACTS=1` for a trusted CI run.

## Rules

- Do not send YouTube chat messages from browser tests.
- Composer tests may write draft text, but must not press Enter or click Send.
- Keep scenario names explicit about the behavior they assert.
- Keep scenario files free of hidden mock/live assertion branches.
- Put shared mechanics in `support/`, not `scenarios/`.
- Do not commit `.chrome-test-profiles/`, `test-results/`, traces,
  screenshots, videos, or DOM dumps.
