# Publish Readiness Review (ioBroker.aurora-borealis)

## Executive summary

Status: **Almost ready, but not fully publish-ready yet**.

The adapter passes linting, unit tests, package validation, and TypeScript checks. Two robustness bugs were fixed during this review (timestamp parsing validation and handling of 0/0 system coordinates).

There are still release-process gaps before publishing to npm/ioBroker stable:

1. Changelog in `README.md` is still "WORK IN PROGRESS" and should be replaced by a real release entry.
2. Integration test setup currently fails in this environment and should be executed in CI or a local ioBroker-capable setup before release confidence is considered complete.
3. GitHub release workflow has npm deploy commented out, so release automation is not yet enabled.

## What was validated

- Adapter runtime logic in `main.js` (coordinate handling, NOAA fetch, payload parsing, state updates).
- Unit tests in `main.test.js`.
- ioBroker package metadata consistency (`package.json`, `io-package.json`).
- Linting and type checks.

## Improvements made in this review

- Accept valid system coordinates even if latitude or longitude is `0`.
- Added NOAA timestamp parsing validation with explicit errors for missing/malformed timestamps.
- Added unit tests for timestamp parsing behavior.
- Added defensive coordinate validation before NOAA index calculation.

## Remaining publish blockers / recommendations

### Must-do before first public release

1. Replace `README.md` changelog placeholder with an actual `0.0.1` entry.
2. Validate integration tests in CI/local environment where ioBroker test harness can initialize cleanly.
3. Decide on release path:
   - enable trusted publishing in workflow, or
   - document manual release process clearly.

### Nice-to-have

- Add unit test coverage around `onReady()` behavior (state writes, coordinate source precedence).
- Consider translating validator error texts in `admin/jsonConfig.json`.
- Optionally reduce npm warning noise from environment-level `http-proxy` config in CI.

## Commands used

- `npm run lint`
- `npm test`
- `npm run check`
- `npm run test:integration` (fails in this environment due missing generated ioBroker config file)
