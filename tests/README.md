# Tests

Unit tests are colocated with the source files they cover:

```text
src/**/*.test.ts
```

This keeps small parser, storage, formatting, matching, and feature tests close
to the implementation they protect.

This folder contains shared test support and cross-feature browser tests:

- `tests/setup.ts`: Vitest setup used by colocated unit tests
- `tests/browser/`: Playwright browser smoke tests for the built extension

Run the main unit-test suite with:

```sh
npm run test
```

Generate unit-test coverage with:

```sh
npm run test:coverage
```

This prints a text summary and writes the HTML report to
`coverage/unit/index.html`. The report intentionally measures unit-testable
logic only. Browser-mounted entrypoints and UI surfaces are covered by the
Playwright scenario suite instead, so use those reports and traces for behavior
that needs a real extension frame.

Run the browser smoke tests with:

```sh
npm run test:browser
npm run test:browser:mock
npm run test:browser:live
```

CI runs the mock browser smoke test through `npm run verify`. Real YouTube live
smoke tests stay local-only because they depend on YouTube, Google auth state,
and a prepared `.chrome-test-profiles/pristine/`.

See `tests/browser/README.md` for the browser smoke-test profile and privacy
notes.
