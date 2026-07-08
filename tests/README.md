# Tests

The project uses three test layers:

```text
src/**/*.test.ts           Vitest tests colocated with source files
tests/browser/scenarios/   reusable Playwright browser behavior checks
tests/browser/specs/       flattened Playwright spec matrix
```

## Layers

- `npm run test` runs Vitest for parsing, formatting, matching, storage,
  commands, placeholders, and DOM-light feature behavior.
- `npm run test:browser` runs Playwright against the built extension for
  content-script wiring, injected UI, composer behavior, popup status, and
  YouTube DOM compatibility.
- `npm run test:browser:perf` runs intentional mock YouTube performance checks.

## Commands

- `npm run test`: run Vitest.
- `npm run test:coverage`: run Vitest coverage, refresh badges, and print the
  coverage notice.
- `npm run test:browser:mock`: run deterministic mock YouTube browser specs.
- `npm run test:browser:live`: run real YouTube browser specs. Logged-in specs
  require the dedicated profile described in `tests/browser/README.md`.
- `npm run test:browser`: run all mock and live browser behavior specs.
- `npm run test:browser:perf`: run mock browser performance specs.
- `npm run test:all`: run Vitest, browser behavior specs, and mock performance
  specs once.
- `npm run verify`: run the CI-style gate. Signed-in live and performance specs
  remain local/manual.

Browser-specific setup, reports, and artifact notes live in
`tests/browser/README.md`.
