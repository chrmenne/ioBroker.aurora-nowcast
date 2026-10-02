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

## Praxisanleitung: Polarlichter beobachten

Polarlichter beobachten funktioniert in zwei Schritten: **vorausplanen** mit der Kp-Vorhersage und **in Echtzeit reagieren** mit Sonnenwind- und OVATION-Daten.

### Schritt 1 — Planen: Ist ein Sturm zu erwarten?

Mit `kp.forecast_max` lässt sich prüfen, ob in den nächsten 72 Stunden ein geomagnetischer Sturm erwartet wird. Grobe Sichtbarkeitsschwellen nach geografischem Breitengrad:

| `kp.forecast_max` | Sturmstufe | Sichtbar bis ca.                                       |
|-------------------|------------|-------------------------------------------------------|
| < 5               | Keiner     | Nur in hohen Breiten                                  |
| 5 (G1)            | Schwach    | ~60°N — Nordschottland, Südskandinavien               |
| 6 (G2)            | Mäßig      | ~55°N — Norddeutschland, Polen                        |
| 7 (G3)            | Stark      | ~50°N — London, Frankfurt, Warschau                   |
| 8 (G4)            | Heftig     | ~45°N — Schweiz, Österreich, Norditalien              |
| 9 (G5)            | Extrem     | ~40°N — Zentralfrankreich, Nordspanien                |

`kp.forecast_max_time` gibt an, *wann* das Maximum erwartet wird — nützlich für eine Benachrichtigung wie „G2-Sturm heute Nacht vorhergesagt".

`kp.g_scale` spiegelt die aktuelle Sturmstufe in Echtzeit wider (0 = ruhig, 1–5 = G1–G5).

> **Hinweis:** Dies sind Näherungswerte für geografische Breitengrade in Europa. Die tatsächliche Sichtbarkeit hängt stark von `solar_wind.bz` (siehe unten), Bewölkung und Lichtverschmutzung ab.

### Schritt 2 — Reagieren: Ist gerade Polarlicht aktiv?

Selbst bei hohem Kp werden Polarlichter erst sichtbar, wenn das interplanetare Magnetfeld (IMF) **südwärts** dreht — erkennbar an einem stark negativen `solar_wind.bz`. Das ist der zuverlässigste kurzfristige Auslöser.

| `solar_wind.bz` | Bedeutung                                                           |
|-----------------|---------------------------------------------------------------------|
| > 0 nT          | Nordwärts — Magnetosphäre weitgehend geschlossen, kaum Polarlichter |
| 0 bis −5 nT     | Schwach südwärts — marginale Bedingungen                            |
| −5 bis −10 nT   | Südwärts — Polarlichtaktivität beginnt aufzubauen                   |
| ≤ −10 nT        | Stark südwärts — deutliche Polarlichtaktivität wahrscheinlich       |
| ≤ −20 nT        | Extrem — intensive Polarlichter weit in mittlere Breiten            |

**Vorwarnzeit:** Bz wird am L1-Messpunkt zwischen Erde und Sonne gemessen. Der Sonnenwind benötigt **15–60 Minuten** von L1 bis zur Erde — das ist das Warnfenster.

`solar_wind.bt` ist die gesamte Feldstärke. Wenn `|bz|` nahe an `bt` herankommt, ist das Feld nahezu vollständig südwärts ausgerichtet. Beispiel: bz = −18 nT bei bt = 20 nT ist ein stärkeres Signal als bz = −10 nT bei bt = 30 nT.

`solar_wind.speed` verstärkt den Effekt: Schneller Sonnenwind (> 400 km/s) zusammen mit negativem Bz überträgt mehr Energie auf die Magnetosphäre. Bei sehr hohen Geschwindigkeiten (> 600 km/s) kann auch ein moderater Bz Polarlichter auslösen.

`solar_wind.density` spielt eine unterstützende Rolle: Hohe Dichte (> 10 p/cm³) erhöht den dynamischen Druck auf die Magnetosphäre und kann die Aktivität verstärken.

### Ortsgebundene Bestätigung: Was fügt `probability` hinzu?

Kp ist ein globaler Index — er beschreibt die allgemeine geomagnetische Aktivität, nicht was gerade über dem eigenen Standort passiert. `probability` ist anders: Der Wert wird speziell für die konfigurierten Koordinaten mit dem **NOAA OVATION-Modell** berechnet. Dieses Modell verwendet die Echtzeit-Sonnenwindmessungen direkt als Eingabe und modelliert die tatsächliche Ausdehnung und Intensität des Polarlichtbogens. Es reagiert daher schneller und präziser auf Bz-Änderungen als der abgeleitete Kp-Wert.

Für Mitteleuropa (ca. 50–55°N) sind folgende Bereiche während aktiver Bedingungen realistisch:

| `probability` | Bedeutung                                                            |
|---------------|----------------------------------------------------------------------|
| < 5 %         | Keine nennenswerte Aktivität am Standort                            |
| 5–15 %        | Erhöht — beobachtenswert, besonders außerhalb von Städten           |
| 15–30 %       | Aktiv — Polarlichter bei klarem Himmel wahrscheinlich sichtbar      |
| > 30 %        | Starke Aktivität direkt über dem Standort                           |

`probability` ist die ortsgebundene Bestätigung ergänzend zu Kp und Bz. Ein steigender Wert zusammen mit einem stark negativen Bz ist das deutlichste Zeichen, nach draußen zu gehen.

### Beispiel-Automatisierung

Eine praktische dreistufige Benachrichtigungsstrategie:

1. **Beobachtungsmodus** — `kp.forecast_max` ≥ 5: „Sturm in den nächsten 72 Stunden vorhergesagt — heute Abend auf Bedingungen achten"
2. **Alarm** — `kp.value` ≥ 5 UND `solar_wind.bz` ≤ −10: „Sturm aktiv und Bz stark südwärts — Polarlichter in 15–60 Minuten wahrscheinlich"
3. **Standortbestätigung** — `probability` ≥ 15: „Polarlichter am Standort gerade wahrscheinlich sichtbar"

Die Kombination aller drei Ebenen vermeidet Fehlalarme: Kp bestätigt einen echten Sturm, Bz bestätigt eine offene Magnetosphäre, und probability bestätigt Aktivität genau am eigenen Standort.

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

Copyright (c) 2026 Christian Menne <publicdevelopment@christianmenne.de>

See LICENSE file for full license text.
