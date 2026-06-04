# ioBroker.aurora-nowcast

![Logo](admin/aurora-nowcast.png)

[![NPM-Version](https://img.shields.io/npm/v/iobroker.aurora-nowcast.svg)](https://www.npmjs.com/package/iobroker.aurora-nowcast)
[![Downloads](https://img.shields.io/npm/dm/iobroker.aurora-nowcast.svg)](https://www.npmjs.com/package/iobroker.aurora-nowcast)
![Anzahl der Installationen](https://iobroker.live/badges/aurora-nowcast-installed.svg)
![Aktuelle Version im Stable Repository](https://iobroker.live/badges/aurora-nowcast-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.aurora-nowcast.png?downloads=true)](https://nodei.co/npm/iobroker.aurora-nowcast/)

**Tests:** ![Test und Release](https://github.com/chrmenne/ioBroker.aurora-nowcast/actions/workflows/test-and-release.yml/badge.svg)

---

## Aurora Nowcast-Adapter für ioBroker

Liefert **aktuelle (Nowcast) Daten** zur kurzfristigen Polarlicht-Aktivität an einem vorgegebenen Ort, basierend auf den öffentlich verfügbaren Daten des NOAA Space Weather Prediction Center (SWPC).

> **Hinweis:**  
> Die OVATION-Polarlichtwerte sind *aktuelle Messwerte (Nowcast)* basierend auf Echtzeit-Sonnenwinddaten — keine Langfristvorhersage.  
> Der Kp-Index-Feed liefert zusätzlich eine **72-Stunden-Vorhersage** zur Planung.

---

## Funktionen

- Liefert Echtzeitdaten zur Polarlichtaktivität (NOAA-OVATION-Modell) für die Nord- und Südhalbkugel
- Berechnet die lokale Wahrscheinlichkeit, Polarlichter am konfigurierten Standort zu sehen
- Liefert den aktuellen Kp-Index (1-Minuten-Feed) und eine 72-Stunden-Kp-Vorhersage
- Liefert Echtzeit-Sonnenwinddaten (Bz, Gesamtfeld, Geschwindigkeit, Dichte) als Frühwarnindikatoren für Polarlichter
- Stellt ioBroker-States für Automatisierung, Visualisierung und Benachrichtigungen bereit
- Optional nutzbar mit Systemstandort oder manueller Eingabe von Breiten-/Längengrad
- Geeignet für Dashboards, Benachrichtigungen und Smart-Home-Szenarien

---

## ❤️ Support

Falls **ioBroker.aurora-nowcast** für Sie nützlich ist und Sie mich unterstützen möchten, dann spendieren Sie mir doch bitte einen Kaffee. ☕🙂

[![Donate](https://img.shields.io/badge/Donate-PayPal-blue.svg)](https://www.paypal.com/donate/?hosted_button_id=G6FRTZ5EAADFJ)

Vielen Dank für Ihre Unterstützung!

---

## Konfiguration

Du kannst entweder:

- den in ioBroker konfigurierten Systemstandort verwenden, oder
- abweichende Koordinaten (Breiten-/Längengrad in Dezimalgrad) angeben.

Die Angabe der Koordinaten ist erforderlich, wenn der Systemstandort deaktiviert ist.

Beispiele:

| Ort             | Breitengrad | Längengrad |
|-----------------|-------------|------------|
| Berlin          | 52.5        | 13.4       |
| Buenos Aires    | -34.6       | -58.4      |
| Reykjavik       | 64.1        | -21.9      |

Die Gradangaben für Nord und Ost sind positiv, für Süd und West dagegen negativ.

### Aktualisierungsintervalle

| Einstellung         | Standard | Bereich | Beschreibung                                                                            |
|---------------------|----------|---------|-----------------------------------------------------------------------------------------|
| Standard-Intervall  | 5        | 1–60    | Wie oft OVATION-Aurora-Daten, Kp-Vorhersage und Geostorm-Skalen abgerufen werden (Min.) |
| Echtzeit-Intervall  | 1        | 1–60    | Wie oft Echtzeit-Feeds abgerufen werden: aktueller Kp-Index, Sonnenwind, Röntgen (Min.) |

---

## Zustände

### Hintergrund: Weltraumwetter-Indizes

**Kp-Index** — Der planetarische K-Index misst die globale geomagnetische Aktivität auf einer Skala von 0–9 (0 = ruhig, 9 = extremer Sturm). Werte ≥ 5 bedeuten geomagnetischen Sturm (G1 und höher), bei dem Polarlichter in mittleren Breiten wie Mitteleuropa sichtbar werden. Der Adapter liefert sowohl den aktuellen 1-Minuten-Messwert als auch eine 72-Stunden-Vorhersage.

### OVATION — Polarlicht-Wahrscheinlichkeit

| Zustand             | Typ     | Beschreibung                                                                       |
|---------------------|---------|------------------------------------------------------------------------------------|
| `probability`       | number  | Geschätzte Wahrscheinlichkeit für sichtbare Polarlichter am konfigurierten Ort (%) |
| `observation_time`  | number  | Zeitpunkt der verwendeten Sonnenwind-Beobachtung (UTC, ms)                         |
| `forecast_time`     | number  | Zeitpunkt, für den die geomagnetische Reaktion der Erde berechnet wurde (UTC, ms)  |

### Kp-Index

| Zustand                | Typ     | Beschreibung                                               |
|------------------------|---------|------------------------------------------------------------|
| `kp.value`             | number  | Aktueller Kp-Index (0–9, Dezimalwert, 1-Minuten-Feed)      |
| `kp.time`              | number  | Messzeitpunkt des aktuellen Kp-Wertes (UTC, ms)            |
| `kp.g_scale`           | number  | Abgeleitete NOAA G-Stufe (0 = kein Sturm, 1–5 = G1–G5)     |
| `kp.forecast_max`      | number  | Maximaler Kp-Wert in der 72-Stunden-Vorhersage             |
| `kp.forecast_max_time` | number  | Zeitpunkt des Vorhersage-Maximums (UTC, ms)                |
| `kp.forecast`          | string  | Vollständige 72h-Kp-Vorhersage als JSON `[{time, kp}]`     |

### Sonnenwind

**Bz (GSM)** — Die z-Komponente des interplanetaren Magnetfeldes in GSM-Koordinaten. Ein stark negativer Bz-Wert (südwärts gerichtet) öffnet die Erdmagnetosphäre für einströmende Sonnenwindenergie und ist der zuverlässigste kurzfristige Vorläufer sichtbarer Polarlichter — typischerweise 15–60 Minuten im Voraus. **Bt** ist die Gesamtfeldstärke; Bz in Relation zu Bt zeigt, wie stark südwärts das Feld orientiert ist.

| Zustand                  | Typ    | Einheit | Beschreibung                                                  |
|--------------------------|--------|---------|---------------------------------------------------------------|
| `solar_wind.bz`          | number | nT      | Bz-Komponente in GSM-Koordinaten (negativ = südwärts)         |
| `solar_wind.bt`          | number | nT      | Gesamtstärke des interplanetaren Magnetfeldes                 |
| `solar_wind.speed`       | number | km/s    | Proton-Geschwindigkeit des Sonnenwinds                        |
| `solar_wind.density`     | number | p/cm³   | Proton-Dichte des Sonnenwinds                                 |
| `solar_wind.mag_time`    | number | ms      | Zeitstempel der Magnetfeld-Messung (UTC)                      |
| `solar_wind.plasma_time` | number | ms      | Zeitstempel der Plasma-Messung (UTC)                          |

Diese Zustände können verwendet werden für:

- Benachrichtigungen (z. B. Push-Nachrichten bei Kp ≥ 5 oder Bz ≤ −10 nT)
- Dashboard-Visualisierungen
- Automatisierungsregeln (z. B. Kamera aktivieren, wenn die Polarlichtwahrscheinlichkeit hoch ist)

---

## Datenquelle

Dieser Adapter nutzt öffentlich verfügbare Daten von:

- NOAA Space Weather Prediction Center (SWPC)  
  <https://www.swpc.noaa.gov/>

Insbesondere werden das OVATION-Aurora-Nowcast-Modell und zugehörige geomagnetische Echtzeitindizes verwendet, um die Polarlichtaktivität für den konfigurierten Standort zu schätzen.

---

## Haftungsausschluss

NOAA und SWPC sind nicht mit diesem Projekt verbunden.

Die von diesem Adapter verwendeten Daten werden von NOAA zur öffentlichen Nutzung bereitgestellt.  
Es wird keine Gewähr für die Richtigkeit, Vollständigkeit oder Aktualität der bereitgestellten Informationen übernommen.

Die Sichtbarkeit von Polarlichtern hängt von mehreren externen Faktoren ab (z. B. Bewölkung, Lichtverschmutzung, IMF-Ausrichtung), die außerhalb des Einflussbereichs dieses Adapters liegen.

---

## Changelog

Siehe [README.md](README.md#changelog) für den vollständigen Changelog (Englisch).

---

## License

GNU General Public License v3.0

Copyright (c) 2026 Christian Menne

See LICENSE file for full license text.
