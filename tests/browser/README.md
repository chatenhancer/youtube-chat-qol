# Browser tests

This folder contains Playwright smoke tests for the built extension. They cover
the parts unit tests cannot see: content-script attachment, YouTube chat iframe
wiring, injected menu/card UI, popup status, and composer behavior.

These tests are deliberately split into reusable behavior scenarios and small
plan-case spec files. The specs decide where each scenario runs; the scenario
files contain the actual checks.

## Layout

```text
tests/browser/
  helpers/                 browser launch, storage, popup, DOM, and YouTube helpers
  scenarios/               reusable feature-level checks
  specs/
    scenario-fixtures.ts   maps each browser surface to { chat, context }
    youtube-mock/          deterministic local YouTube-like chat
    youtube-live/          real YouTube livestream smoke tests
```

The four browser surfaces are:

- `logged-in mock`
- `logged-out mock`
- `logged-in live`
- `logged-out live`

Mock specs are broad, deterministic, and CI-safe. Live specs are narrower and
exist to prove the extension still works against YouTube's current DOM and real
provider-backed flows such as Google Translate.

## Commands

```sh
npm run test:browser:mock
```

Runs the mock suite. This is headless by default and is the browser suite used
by CI through `npm run verify`.

```sh
YTCQ_TEST_HEADLESS=0 npm run test:browser:mock
```

Runs the mock suite with a visible browser for debugging.

```sh
npm run test:browser:live
```

Runs real YouTube livestream smoke tests. These stay headed because headless
real-YouTube extension checks are not reliable enough.

```sh
npm run test:browser
```

Runs mock first, then live.

```sh
npm run test:browser:live -- -g logged-in
```

Runs only logged-in live tests.

## Logged-in live setup

Prepare the dedicated local Chrome profile with:

```sh
npm run test:youtube-login
```

The helper opens Chrome with `.chrome-test-profile/`. In that window:

1. Sign in to YouTube.
2. Open `chrome://extensions`.
3. Enable Developer Mode.
4. Load `dist/extension-chrome` if Chat Enhancer is not already installed.
5. Make sure the extension is enabled.

The helper closes Chrome once it detects both a signed-in YouTube session and
the installed unpacked extension. Do not use a personal everyday Chrome profile
for this.

## Adding coverage

Add behavior in `tests/browser/scenarios/`. A scenario is a normal Playwright
callback that receives:

```ts
async ({ chat, context }) => {
  // chat is either the mock chat page or the real YouTube chat frame
  // context is the browser context that owns the loaded extension
}
```

Then add the scenario to the relevant plan-case specs:

```text
tests/browser/specs/youtube-mock/logged-in.spec.ts
tests/browser/specs/youtube-mock/logged-out.spec.ts
tests/browser/specs/youtube-live/logged-in.spec.ts
tests/browser/specs/youtube-live/logged-out.spec.ts
```

Prefer running the same scenario on mock and live when the behavior exists on
both. Keep mock-only assertions for deterministic details that would be flaky on
real YouTube, such as fixture-controlled incoming messages.

Browser sessions are worker-scoped, so adding more scenarios to one spec does
not intentionally reopen Chrome for every test.

## Reports and failures

Open the latest combined browser report with:

```sh
npx playwright show-report playwright-report/browser
```

Project-specific reports are also written when running a single project:

```sh
npx playwright show-report playwright-report/youtube-mock
npx playwright show-report playwright-report/youtube-live
```

Failure artifacts are under `test-results/browser/`. They may include
screenshots, videos, traces, and DOM dumps. Open a trace directly with:

```sh
npx playwright show-trace test-results/browser/<failed-test>/trace.zip
```

## Rules

- Browser tests must not send YouTube chat messages.
- Composer tests may write draft text, but must not press Enter or click Send.
- Do not commit `.chrome-test-profile/`, `test-results/`, traces, screenshots,
  videos, or DOM dumps.
