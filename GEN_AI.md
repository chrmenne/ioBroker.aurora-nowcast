# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

ioBroker.aurora-nowcast is a published ioBroker adapter (`iobroker.aurora-nowcast` on npm) that fetches public NOAA Space Weather Prediction Center (SWPC) data and exposes aurora (northern/southern lights) nowcast and forecast information as ioBroker states for a configured location. Single-file adapter: `main.js` (~640 lines), plain JS with JSDoc types (`allowJs`/`checkJs`, no TypeScript compilation step).

## Build & Development Commands

```bash
npm install        # install dependencies
npm run dev-server  # local ioBroker dev-server instance for interactive testing
npm run translate   # translate-adapter — regenerates admin UI i18n from admin/i18n/en
```

No build step — `main.js` runs directly; `npm run check` only type-checks, it doesn't compile/emit anything.

### Testing

```bash
npm test                  # test:js + test:package
npm run test:js           # mocha unit tests (*.test.js)
npm run test:integration  # mocha test/integration — spins up a real js-controller + adapter instance
npm run test:package      # validates package.json/io-package.json against ioBroker publish requirements

# single test file
npx mocha main.test.js --config test/mocharc.custom.json
```

### Linting & Type Checking

```bash
npm run lint    # eslint . (@iobroker/eslint-config)
npm run check   # tsc --noEmit -p tsconfig.check.json — JSDoc-based type check, no emit
```

## Architecture

Single adapter class `AuroraNowcast extends utils.Adapter` in `main.js`. No other source files besides `lib/adapter-config.d.ts` (config typing).

| Method | Role |
|---|---|
| `_fetchJson(url, attempt)` | Shared HTTP fetch with retry + truncated-JSON repair (`_repairTruncatedJsonArray`) — NOAA feeds occasionally truncate mid-response |
| `fetchOvation` / `fetchKpIndex` / `fetchSolarWindMag` / `fetchSolarWindPlasma` / `fetchKpForecast` | Raw NOAA SWPC feed fetchers, one per endpoint |
| `getAuroraProbabilityFromOvationData` / `getSolarWindMagFromData` / `getSolarWindPlasmaFromData` / `getKpValueFromData` / `getKpForecastFromData` | Pure parsing functions over raw feed JSON — these are what unit tests target directly, without needing a live adapter |
| `computeGScaleFromKp` | Kp → NOAA G-scale (G1–G5) mapping, exposed as `kp.g_scale` |
| `getNoaaIndex(lat, lon)` | lat/lon → NOAA OVATION grid index |
| `_updateOvation` / `_updateSolarWind` / `_updateKpIndex` / `_updateKpForecast` | Orchestrate fetch → parse → `setState` for each feed |
| `onReady` / `onUnload` | Lifecycle. Sets up two intervals (see below); `onUnload` must clear both |

### Two polling intervals

- `interval` (standard, default 5 min): OVATION, Kp-forecast
- `realtimeInterval` (default 1 min): Kp-index, solar wind

### States (implemented)

- `kp.value`, `kp.time`, `kp.g_scale` — current Kp + derived G-scale (realtime)
- `kp.forecast_max`, `kp.forecast_max_time`, `kp.forecast` — 72h forecast (standard interval)
- `solar_wind.bz`, `solar_wind.bt`, `solar_wind.mag_time` — magnetic field (realtime)
- `solar_wind.speed`, `solar_wind.density`, `solar_wind.plasma_time` — plasma (realtime)
- OVATION: `probability`, `observation_time`, `forecast_time` (standard interval)

### Deliberately not implemented

- **Separate G/S/R storm scales** — G-scale is a 1:1 mapping from Kp (Kp 5=G1 … 9=G5), already covered by `kp.g_scale`. S/R scales aren't relevant to aurora.
- **X-ray flux / solar flares** — only signals a CME *might* arrive in 1–3 days; not a short-term aurora indicator.

These are considered closed decisions, not open TODOs — don't re-propose them without checking with the user first.

## Conventions

- **TDD always**: write the test first, then implement.
- **Fixture-first for NOAA endpoints**: before writing a test against any NOAA SWPC feed, fetch one real response and save it under `test/resources/*_example.json` first — never hand-write a fixture from memory of the API shape. NOAA responses have real quirks (mid-response truncation, null fields, alphanumeric Kp notation like `"3+"`/`"0Z"`) that a hand-written fixture will miss. Existing fixtures: `kp_1m_example.json`, `kp_forecast_example.json`, `solar_wind_mag_example.json`, `solar_wind_plasma_example.json`, `noaa_response_example.json` (OVATION).
- **Lint clean before done**: run `npm run lint` and `npm run check`, fix everything, before considering a task finished.
- Plain JS + JSDoc (`@typedef`, `@param`, `@returns`) for typing — follow this style for new code rather than introducing `.ts` files.

## Deployment

Runs inside the `iobroker-dev` Docker container. The container's `node_modules/iobroker.aurora-nowcast` is a bind mount to this repo (not a symlink, not a copy) — a code change plus an instance restart is enough, no separate upload/build/reinstall step:

```bash
docker exec iobroker-dev iobroker restart aurora-nowcast.0
docker exec iobroker-dev iobroker logs aurora-nowcast.0
```

If old behavior/errors persist after a restart, that's a strong signal the bug is in the code itself, not a stale deploy.
