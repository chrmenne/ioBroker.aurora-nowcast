# ioBroker.aurora-nowcast

![Logo](admin/aurora-nowcast.png)

[![NPM version](https://img.shields.io/npm/v/iobroker.aurora-nowcast.svg)](https://www.npmjs.com/package/iobroker.aurora-nowcast)
[![Downloads](https://img.shields.io/npm/dm/iobroker.aurora-nowcast.svg)](https://www.npmjs.com/package/iobroker.aurora-nowcast)
![Number of Installations](https://iobroker.live/badges/aurora-nowcast-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/aurora-nowcast-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.aurora-nowcast.png?downloads=true)](https://nodei.co/npm/iobroker.aurora-nowcast/)

**Tests:** ![Test and Release](https://github.com/chrmenne/ioBroker.aurora-nowcast/actions/workflows/test-and-release.yml/badge.svg)

---

## Aurora Nowcast adapter for ioBroker

Provides **current (nowcast) data** on aurora activity (northern and southern lights) for a given location, based on publicly available data from the NOAA Space Weather Prediction Center (SWPC).

> **Note:**  
> The OVATION aurora data represents *current conditions (nowcast)* based on real-time solar wind measurements — not a long-range forecast.  
> The Kp index feed additionally provides a **72-hour forecast** for planning purposes.

---

## Features

- Retrieves real-time aurora activity data (NOAA OVATION model) for both northern and southern hemisphere
- Calculates local aurora visibility likelihood for a configured location
- Provides current Kp index (1-minute feed) and a 72-hour Kp forecast
- Provides real-time solar wind data (Bz, total field, speed, density) as aurora early-warning indicators
- Provides ioBroker states for automation, visualization and alerts
- Optional usage of system location or manual latitude/longitude input
- Suitable for dashboards, notifications and smart home scenarios

---

## ❤️ Support

If you find **ioBroker.aurora-nowcast** useful and would like to support further development, you might want to buy me a coffee. ☕🙂

[![Donate](https://img.shields.io/badge/Donate-PayPal-blue.svg)](https://www.paypal.com/donate/?hosted_button_id=G6FRTZ5EAADFJ)

Thank you for your support!

---

## Configuration

You can either:

- Use the system location configured in ioBroker, or
- Provide manual coordinates (latitude / longitude in decimal degrees)

Manual coordinates are required if system location is disabled.

Examples:

| Location        | Latitude | Longitude |
|-----------------|----------|-----------|
| Berlin          | 52.5     | 13.4      |
| Buenos Aires    | -34.6    | -58.4     |
| Reykjavik       | 64.1     | -21.9     |

North/East values are positive, South/West values are negative.

### Update Intervals

| Setting           | Default | Range | Description                                                                        |
|-------------------|---------|-------|------------------------------------------------------------------------------------|
| Standard interval | 5       | 1–60  | How often OVATION aurora data, Kp forecast and storm scales are fetched (minutes)  |
| Realtime interval | 1       | 1–60  | How often realtime feeds are fetched: current Kp index, solar wind (minutes)       |

---

## States

### Background: Space Weather Indices

**Kp index** — The planetary K index measures global geomagnetic activity on a scale of 0–9 (0 = quiet, 9 = extreme storm). Values ≥ 5 indicate geomagnetic storm conditions (G1 and above), under which aurora becomes visible at mid-latitudes such as Central Europe. The adapter provides both the current 1-minute Kp reading and a 72-hour forecast.

### OVATION — Aurora probability

| State               | Type    | Description                                                                        |
|---------------------|---------|------------------------------------------------------------------------------------|
| `probability`       | number  | Estimated aurora visibility probability at the configured location (%)             |
| `observation_time`  | number  | Time of the upstream solar wind observation used as model input (UTC, ms)          |
| `forecast_time`     | number  | Time for which the nowcasted geomagnetic response at Earth is calculated (UTC, ms) |

### Kp index

| State                  | Type    | Description                                            |
|------------------------|---------|--------------------------------------------------------|
| `kp.value`             | number  | Current Kp index (0–9, decimal, 1-minute feed)         |
| `kp.time`              | number  | Measurement time of the current Kp value (UTC, ms)     |
| `kp.g_scale`           | number  | Derived NOAA G-scale (0 = none, 1–5 = G1–G5)           |
| `kp.forecast_max`      | number  | Maximum Kp value in the 72-hour forecast               |
| `kp.forecast_max_time` | number  | Time at which the forecast maximum occurs (UTC, ms)    |
| `kp.forecast`          | string  | Full 72-hour Kp forecast as JSON array `[{time, kp}]`  |

### Solar wind

**Bz (GSM)** — The z-component of the interplanetary magnetic field in GSM coordinates. A strongly negative Bz (southward orientation) opens the Earth's magnetosphere to incoming solar wind energy and is the most reliable short-term aurora precursor — typically 15–60 minutes ahead of visible activity. **Bt** is the total field magnitude; Bz relative to Bt indicates how strongly southward the field is oriented.

| State                   | Type   | Unit   | Description                                              |
|-------------------------|--------|--------|----------------------------------------------------------|
| `solar_wind.bz`         | number | nT     | Bz component in GSM coordinates (negative = southward)   |
| `solar_wind.bt`         | number | nT     | Total interplanetary magnetic field strength             |
| `solar_wind.speed`      | number | km/s   | Solar wind proton speed                                  |
| `solar_wind.density`    | number | p/cm³  | Solar wind proton density                                |
| `solar_wind.mag_time`   | number | ms     | Magnetometer measurement time (UTC)                      |
| `solar_wind.plasma_time`| number | ms     | Plasma measurement time (UTC)                            |

These states can be used for:

- Notifications (e.g. push messages when Kp ≥ 5 or Bz ≤ −10 nT)
- Dashboard visualizations
- Automation rules (e.g. activate camera when aurora probability is high)

---

## Data Source

This adapter uses publicly available data provided by the:

- NOAA Space Weather Prediction Center (SWPC)  
  <https://www.swpc.noaa.gov/>

In particular, the OVATION aurora nowcast model and related real-time geomagnetic indices are used to estimate auroral activity for the configured location.

---

## Disclaimer

NOAA and SWPC are not affiliated with this project.

The data used by this adapter is provided by NOAA for public use.  
No guarantee is made regarding the accuracy, completeness or timeliness of the provided information.

Aurora visibility depends on multiple external factors (e.g. cloud cover, light pollution, IMF orientation) which are beyond the scope of this adapter.

---

## Changelog

### **WORK IN PROGRESS**

- added solar wind data: Bz, total field (Bt), proton speed and density as aurora early-warning indicators
- added Kp index: current value (1-minute feed) and 72-hour forecast with maximum detection
- added separate realtime polling interval for time-critical feeds (Kp, solar wind)
- switched from single-run to continuous interval-based polling (daemon mode)
- configurable update interval (1–60 minutes, default: 5)
- fixed issue (<https://github.com/chrmenne/ioBroker.aurora-nowcast/issues/32>)
- fixed issue (<https://github.com/chrmenne/ioBroker.aurora-nowcast/issues/33>)
- fixed issue (<https://github.com/chrmenne/ioBroker.aurora-nowcast/issues/35>)

### 2.2.2 (2026-04-17)

- re-added git-type URL because of npm linter

### 2.2.1 (2026-04-17)

- more checks
- fixed Readme link to a more stable direct link instead of an anchor
- fixed issue (<https://github.com/chrmenne/ioBroker.aurora-nowcast/issues/24>)
- fixed issue (<https://github.com/chrmenne/ioBroker.aurora-nowcast/issues/27>)

### 2.2.0 (2026-03-30)

- fixed review findings (<https://github.com/chrmenne/ioBroker.aurora-nowcast/issues/21>)

### 2.1.4 (2026-03-11)

- disabled Sentry in GitHub workflow

### 2.1.3 (2026-03-11)

- fixed iobroker-Bot warnings: <https://github.com/chrmenne/ioBroker.aurora-nowcast/issues/18>
- slightly retouched the icon

### 2.1.2 (2026-03-09)

- fixed overlooked linter error regarding whitespace

### 2.1.1 (2026-03-09)

- fixed a bug concerning the coordinates validation

### 2.1.0 (2026-03-02)

- added internationalization (i18n)
- further smaller adjustments to meet ioBroker standards

[Older changelogs can be found there](CHANGELOG_OLD.md)

---

## License

GNU General Public License v3.0

Copyright (c) 2026 Christian Menne

See LICENSE file for full license text.
