# Browser smoke tests

This folder contains Playwright smoke tests for the built browser extension.
They are intended to catch wiring failures that unit tests cannot see, such as
content script injection, popup status, YouTube chat iframe behavior, and the
composer-only controls that require a signed-in account.

These tests are not a replacement for unit tests. They are slower, depend on
browser behavior, and the real YouTube tests can be affected by YouTube UI,
Google account checks, consent screens, and livestream availability.

## Folder layout

```text
tests/browser/
  scenarios/       feature-level checks shared by mock and live specs
  specs/
    youtube-mock/  deterministic mock YouTube chat specs
    youtube-live/  real YouTube livestream specs
  helpers/         shared Chrome, extension, YouTube, and assertion helpers
```

The scenario files are the source of truth for portable feature checks. Mock
and live specs import the same logged-out and signed-in scenario groups, so it
is obvious when a feature passes in the fixture but fails against real YouTube.
Each portable scenario is registered as its own Playwright test with matching
names in `youtube-mock` and `youtube-live`.

Browser launches are still worker-scoped. Splitting the specs by feature does
not intentionally reopen Chrome for every check when the suite runs normally
with one worker.

Mock-only specs should stay rare. Menu checks are part of the shared scenario
groups because the extension injects those actions into real YouTube chat
menus too.

## Test types

### Full browser smoke suite

```sh
npm run test:browser
```

This runs the mock YouTube specs first, then the real YouTube livestream specs.
It assumes the signed-in profile is already prepared if the logged-in live spec
is expected to run.

### Mock YouTube smoke

```sh
npm run test:browser:mock
```

This builds the Chrome extension and opens a deterministic local fixture that
looks like a small YouTube live chat page. It does not use a real YouTube page,
does not require login, and is the safest browser smoke test to run often.

It runs both mock auth states:

- logged out: read-only extension surfaces
- signed in: read-only surfaces plus composer-only draft controls

It checks that the extension can attach and render the core injected surfaces:

- Inbox button and card
- incoming message translation rendering with a mocked Translate response
- incoming message translation through the real Google Translate endpoint
- composer translate button
- mention and quote draft insertion
- recent-message profile card
- extension popup active status

Menu injection is part of the shared scenario groups:

- YouTube settings menu items
- message menu Quote and Mention actions

### Real YouTube live smoke

```sh
npm run test:browser:live
```

This builds the Chrome extension and opens the configured YouTube livestream.
The default stream is defined in `tests/browser/helpers/paths.ts`.
Set `YTCQ_LIVE_URL` to test a different livestream:

```sh
YTCQ_LIVE_URL=https://www.youtube.com/watch?v=VIDEO_ID npm run test:browser:live
```

The logged-out case uses a throwaway Playwright profile. It runs the same
logged-out scenario group as the mock fixture: attachment, settings menu,
mocked and real incoming message translation, Inbox, profile card, and popup
active status.

The logged-in case uses a dedicated local Chrome profile because Google sign-in
can reject automated browser profiles. It runs the same signed-in scenario
group as the mock fixture, including composer translation controls and safe
message-menu/draft insertion checks. It never sends a chat message.

## Signed-in setup

Prepare the signed-in profile with:

```sh
npm run test:youtube-login
```

This opens normal Google Chrome with a repo-local profile at:

```text
.chrome-test-profile/
```

In that Chrome window:

1. Sign in to YouTube web.
2. Open `chrome://extensions`.
3. Enable Developer Mode.
4. If Chat Enhancer is not already listed, choose `Load unpacked` and select:

   ```text
   dist/extension-chrome
   ```

5. Make sure Chat Enhancer is enabled.

The helper closes Chrome automatically once it detects both a signed-in YouTube
web session and the installed unpacked extension.

Then run only the signed-in smoke with:

```sh
npm run test:browser:live -- -g logged-in
```

## Headless mock runs

The mock browser smoke test can run headless by setting `YTCQ_HEADLESS=1`:

```sh
YTCQ_HEADLESS=1 npm run test:browser:mock
```

The mock test automatically uses Playwright's Chromium channel in headless mode
so the unpacked extension loads correctly.

This is the browser smoke test that runs in CI. It avoids real YouTube, Google
sign-in, and the persistent signed-in Chrome profile.

CI runs this through `npm run verify` after the Chrome extension output has
already been built, so the underlying Playwright command is not expected to
rebuild the extension a second time.

Real YouTube smoke tests stay headed. In current Chrome and YouTube behavior,
headless real-YouTube runs are not reliable enough for normal extension iframe
injection and signed-in composer checks. `YTCQ_HEADLESS=1` is for
`youtube-mock`; signed-in live tests intentionally skip when that flag is set.

`npm run test:youtube-login` also intentionally stays visible because it is an
interactive setup utility for Google sign-in and extension installation.

## Why the signed-in test works this way

Recent Chrome versions can ignore or restrict command-line unpacked extension
loading in normal Chrome. For a signed-in smoke test, the extension should be
installed once in the dedicated profile through `chrome://extensions`, then the
test reuses that profile.

The test command still rebuilds `dist/extension-chrome` before running, so the
installed unpacked extension points at the current build output.

## Safety and privacy

Do not use a personal everyday Chrome profile for these tests. The signed-in
smoke profile is intentionally isolated under `.chrome-test-profile/`.

Never commit or share:

- `.chrome-test-profile/`
- `test-results/`
- Playwright traces, screenshots, or videos from signed-in failures unless they
  have been reviewed for private account or YouTube page data

Both `.chrome-test-profile/` and `test-results/` are ignored by `.gitignore`.

The smoke tests should not send YouTube chat messages. If a test needs to touch
the chat composer, it should only inspect or manipulate local text input state
unless the test explicitly documents otherwise.

## Useful commands

```sh
npm run test:browser
npm run test:browser:mock
npm run test:browser:live
npm run test:youtube-login
npm run test:browser:live -- -g logged-in
```

After a full browser-test run, open the combined HTML report with:

```sh
npx playwright show-report playwright-report/browser
```

Project-specific npm commands write their own reports:

```sh
npx playwright show-report playwright-report/youtube-mock
npx playwright show-report playwright-report/youtube-live
```

The report shows each test, its `test.step(...)` timeline, and links to failure
artifacts. Failure screenshots, videos, traces, and full DOM dumps for every
open page/frame are written under `test-results/browser/`; traces can also be
opened directly with
`npx playwright show-trace test-results/browser/<failed-test>/trace.zip`.

If the signed-in test fails because the profile is already open, close the
Chrome window using `.chrome-test-profile/` and rerun the command.
