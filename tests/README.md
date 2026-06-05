# Tests

The project uses three test layers:

```text
src/**/*.test.ts           Vitest tests colocated with source files
tests/browser/scenarios/   reusable Playwright browser behavior checks
tests/browser/specs/       flattened Playwright spec matrix
```

## Test layers

**Unit tests**

`npm run test` runs Vitest against colocated `src/**/*.test.ts` files. These
cover parser, formatter, matching, storage, command, placeholder, and small
DOM/module behavior close to the implementation.

**Browser behavior tests**

`npm run test:browser` runs Playwright against the built extension. These cover
content-script attachment, YouTube chat frame wiring, injected menus, cards,
popup status, composer behavior, and real YouTube DOM compatibility.

**Browser performance tests**

`npm run test:browser:perf` runs deterministic mock YouTube stress checks for
fast chat, translation backlog, keyword matching, panels, and composer
translation debounce. These are separate from `verify` so performance budgets
can be checked intentionally.

## Commands

```sh
npm run test
```

Run Vitest tests.

```sh
npm run test:coverage
```

Run Vitest with coverage, write `coverage/unit/index.html`, refresh README
coverage badges, and print a notice when coverage is below the target.

```sh
npm run test:browser:mock
```

Run deterministic mock YouTube browser behavior tests.

```sh
npm run test:browser:live
```

Run real YouTube browser behavior tests. Logged-in tests require the dedicated
test profile described in `tests/browser/README.md`.

```sh
npm run test:browser
```

Run all mock and live browser behavior specs.

```sh
npm run test:browser:perf
```

Run mock browser performance specs.

```sh
npm run verify
```

Run the CI-style correctness gate: typecheck, lint, Vitest, build, docs build,
mock browser behavior specs, and logged-out live behavior specs. Signed-in live
and performance browser specs stay local/manual.

See `tests/browser/README.md` for browser profile setup, browser report paths,
failure artifacts, and how to add browser scenarios.
