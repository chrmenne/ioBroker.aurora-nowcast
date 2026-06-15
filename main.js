/* eslint-disable jsdoc/check-tag-names */
"use strict";

/*
 * Created with @iobroker/create-adapter v3.1.2
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

/**
 * @typedef {object} OvationData
 * @property {string} observationTime - ISO timestamp of the observation time
 * @property {string} forecastTime - ISO timestamp of the forecast time
 * @property {Array.<[number, number, number]>} coordinates - Array of [lon, lat, probability] triplets
 */

/**
 * @typedef {object} KpEntry
 * @property {string} time_tag - ISO timestamp of the measurement
 * @property {number} kp_index - Integer Kp value (0–9)
 * @property {number|null} estimated_kp - Decimal estimated Kp value, may be null
 * @property {string} kp - Alphanumeric Kp notation (e.g. "3+", "0Z")
 */

/**
 * @typedef {object} MagEntry
 * @property {string} time_tag - ISO timestamp of the measurement
 * @property {number} bt - Total magnetic field strength in nT
 * @property {number|null} bz_gsm - Bz component in GSM coordinates (nT), negative = southward = aurora-favorable
 */

/**
 * @typedef {object} PlasmaEntry
 * @property {string} time_tag - ISO timestamp of the measurement
 * @property {number|null} proton_speed - Solar wind proton speed in km/s
 * @property {number|null} proton_density - Proton density in p/cm³
 */

/**
 * @typedef {object} KpForecastResult
 * @property {number} max - Maximum Kp value in the forecast period
 * @property {string} maxTime - ISO timestamp of the forecast maximum
 * @property {Array.<{time: string, kp: number}>} forecast - Full forecast as array of time/kp pairs
 */

class AuroraNowcast extends utils.Adapter {
	/**
	 * @param {Partial<utils.AdapterOptions>} [options] - Adapter options
	 */
	constructor(options) {
		super({
			...options,
			name: "aurora-nowcast",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("unload", this.onUnload.bind(this));
		this.updateInterval = null;
		this.realtimeUpdateInterval = null;
		this.ovationIndex = null;
	}

	/**
	 * Calculates the NOAA grid index for the given latitude and longitude.
	 *
	 * @param {number} latitude - the latitude in degrees, negative for south and positive for north
	 * @param {number} longitude - the longitude in degrees, negative for west and positive for east
	 * @returns {number} The NOAA grid index for the given coordinates
	 */
	getNoaaIndex(latitude, longitude) {
		let rLat = Math.round(latitude);
		let rLon = Math.round(longitude);
		if (rLon < 0) {
			rLon += 360;
		}
		return rLon * 181 + (90 + rLat);
	}

	/**
	 * Parses a NOAA timestamp into unix timestamp (ms).
	 *
	 * @param {string} datestring - NOAA timestamp string, expected to be in ISO format (e.g. "2024-06-01T12:00:00Z")
	 * @returns {number} Unix timestamp in milliseconds
	 */
	parseNoaaTimestamp(datestring) {
		if (typeof datestring !== "string" || datestring.trim() === "") {
			throw new Error("Invalid NOAA payload: missing timestamp");
		}
		const timestamp = new Date(datestring).getTime();
		if (isNaN(timestamp)) {
			throw new Error("Invalid NOAA payload: malformed timestamp");
		}
		return timestamp;
	}

	/**
	 * @param {string} url - The URL to fetch JSON data from
	 * @param {number} [attempt] - Current attempt number (1-based), used for retry logic
	 * @returns {Promise<unknown>} Parsed JSON response body
	 */
	async _fetchJson(url, attempt = 1) {
		const maxAttempts = 3;
		const controller = new AbortController();
		const timeout = this.setTimeout(() => controller.abort(), 30000);
		let json;
		try {
			const res = await fetch(url, {
				signal: controller.signal,
				headers: {
					"User-Agent": "ioBroker-aurora-nowcast",
				},
			});
			if (!res.ok) {
				throw new Error(`NOAA HTTP ${res.status}`);
			}
			json = await res.json();
		} catch (e) {
			const isTimeout = e.name === "AbortError";
			const isParseError = e instanceof SyntaxError;
			if ((isTimeout || isParseError) && attempt < maxAttempts) {
				this.clearTimeout(timeout);
				const delay = attempt * 5000;
				await new Promise(resolve => this.setTimeout(resolve, delay));
				return this._fetchJson(url, attempt + 1);
			}
			if (isTimeout) {
				throw new Error("NOAA request timeout");
			}
			throw e;
		} finally {
			this.clearTimeout(timeout);
		}
		return json;
	}

	/**
	 * @returns {Promise<OvationData>} Aurora ovation data from NOAA
	 */
	async fetchOvation() {
		return /** @type {OvationData} */ (await this._fetchJson(this.config.ovationUrl));
	}

	/**
	 * @returns {Promise<KpEntry[]>} Array of 1-minute Kp index entries
	 */
	async fetchKpIndex() {
		return /** @type {KpEntry[]} */ (await this._fetchJson(this.config.kpIndexUrl));
	}

	/**
	 * @returns {Promise<MagEntry[]>} Array of 1-minute solar wind magnetometer entries (newest first)
	 */
	async fetchSolarWindMag() {
		return /** @type {MagEntry[]} */ (await this._fetchJson(this.config.solarWindMagUrl));
	}

	/**
	 * @returns {Promise<PlasmaEntry[]>} Array of 1-minute solar wind plasma entries (newest first)
	 */
	async fetchSolarWindPlasma() {
		return /** @type {PlasmaEntry[]} */ (await this._fetchJson(this.config.solarWindPlasmaUrl));
	}

	/**
	 * @returns {Promise<Array.<{time_tag: string, kp: number, observed: string, noaa_scale: string|null}>>} 72-hour Kp forecast entries
	 */
	async fetchKpForecast() {
		return /** @type {Array.<{time_tag: string, kp: number, observed: string, noaa_scale: string|null}>} */ (
			await this._fetchJson(this.config.kpForecastUrl)
		);
	}

	/**
	 * Extracts aurora probability from ovation data for a given grid index.
	 *
	 * @param {OvationData} data - The ovation data
	 * @param {number} index - The NOAA grid index
	 * @returns {number} The probability percentage
	 * @throws Will throw an error if the payload is invalid or lookup fails
	 */
	getAuroraProbabilityFromOvationData(data, index) {
		if (!data?.coordinates || !Array.isArray(data.coordinates)) {
			throw new Error("Invalid NOAA payload");
		}
		const cell = data.coordinates[index];
		if (!cell || cell.length < 3) {
			throw new Error("NOAA grid lookup failed");
		}
		return cell[2]; // probability %
	}

	/**
	 * @param {MagEntry[]} data - Solar wind magnetometer entries from NOAA (newest first)
	 * @returns {{ bz: number, bt: number, time: string }} Latest valid Bz, total field and timestamp
	 */
	getSolarWindMagFromData(data) {
		if (!Array.isArray(data) || data.length === 0) {
			throw new Error("Invalid solar wind mag payload");
		}
		for (const entry of data) {
			if (entry && typeof entry.bz_gsm === "number" && !isNaN(entry.bz_gsm)) {
				return { bz: entry.bz_gsm, bt: entry.bt, time: entry.time_tag };
			}
		}
		throw new Error("No valid solar wind mag data found");
	}

	/**
	 * @param {PlasmaEntry[]} data - Solar wind plasma entries from NOAA (newest first)
	 * @returns {{ speed: number, density: number|null, time: string }} Latest valid speed, density and timestamp
	 */
	getSolarWindPlasmaFromData(data) {
		if (!Array.isArray(data) || data.length === 0) {
			throw new Error("Invalid solar wind plasma payload");
		}
		for (const entry of data) {
			if (entry && typeof entry.proton_speed === "number" && !isNaN(entry.proton_speed)) {
				return {
					speed: entry.proton_speed,
					density: typeof entry.proton_density === "number" ? entry.proton_density : null,
					time: entry.time_tag,
				};
			}
		}
		throw new Error("No valid solar wind plasma data found");
	}

	/**
	 * @param {number} kp - Kp index value (0–9)
	 * @returns {number} NOAA G-scale (0 = no storm, 1–5 = G1–G5)
	 */
	computeGScaleFromKp(kp) {
		return Math.max(0, Math.floor(kp) - 4);
	}

	/**
	 * @param {KpEntry[]} data - Array of 1-minute Kp entries from NOAA
	 * @returns {{ value: number, time: string }} The latest valid Kp value and its timestamp
	 */
	getKpValueFromData(data) {
		if (!Array.isArray(data) || data.length === 0) {
			throw new Error("Invalid Kp payload");
		}
		for (let i = data.length - 1; i >= 0; i--) {
			const entry = data[i];
			if (entry && typeof entry.estimated_kp === "number" && !isNaN(entry.estimated_kp)) {
				return { value: entry.estimated_kp, time: entry.time_tag };
			}
		}
		throw new Error("No valid Kp data found");
	}

	/**
	 * @param {Array.<{time_tag: string, kp: number, observed: string, noaa_scale: string|null}>} data - 72-hour Kp forecast entries from NOAA
	 * @returns {KpForecastResult} Maximum Kp value, its timestamp, and the full forecast array
	 */
	getKpForecastFromData(data) {
		if (!Array.isArray(data) || data.length === 0) {
			throw new Error("Invalid Kp forecast payload");
		}
		const forecast = data.map(entry => ({ time: entry.time_tag, kp: entry.kp }));
		const maxEntry = forecast.reduce((a, b) => (b.kp > a.kp ? b : a));
		return { max: maxEntry.kp, maxTime: maxEntry.time, forecast };
	}

	/**
	 * Fetches current ovation data and updates all states.
	 *
	 * @async
	 * @returns {Promise<void>}
	 */
	async updateData() {
		await Promise.allSettled([this._updateOvation(), this._updateKpForecast()]);
	}

	async updateRealtimeData() {
		await Promise.allSettled([this._updateKpIndex(), this._updateSolarWind()]);
	}

	async _updateOvation() {
		try {
			const data = await this.fetchOvation();
			const probability = this.getAuroraProbabilityFromOvationData(data, this.ovationIndex);
			this.log.debug(`Probability: ${probability}`);
			await this.setState("probability", { val: probability, ack: true });
			await this.setState("observation_time", {
				val: this.parseNoaaTimestamp(data["Observation Time"]),
				ack: true,
			});
			await this.setState("forecast_time", {
				val: this.parseNoaaTimestamp(data["Forecast Time"]),
				ack: true,
			});
		} catch (e) {
			this.log.error(`Ovation update failed: ${e.message || e}`);
		}
	}

	async _updateSolarWind() {
		try {
			const [magData, plasmaData] = await Promise.all([this.fetchSolarWindMag(), this.fetchSolarWindPlasma()]);
			const { bz, bt, time: magTime } = this.getSolarWindMagFromData(magData);
			await this.setState("solar_wind.bz", { val: bz, ack: true });
			await this.setState("solar_wind.bt", { val: bt, ack: true });
			await this.setState("solar_wind.mag_time", { val: this.parseNoaaTimestamp(magTime), ack: true });
			const { speed, density, time: plasmaTime } = this.getSolarWindPlasmaFromData(plasmaData);
			await this.setState("solar_wind.speed", { val: speed, ack: true });
			await this.setState("solar_wind.density", { val: density, ack: true });
			await this.setState("solar_wind.plasma_time", { val: this.parseNoaaTimestamp(plasmaTime), ack: true });
		} catch (e) {
			this.log.error(`Solar wind update failed: ${e.message || e}`);
		}
	}

	async _updateKpIndex() {
		try {
			const data = await this.fetchKpIndex();
			const { value, time } = this.getKpValueFromData(data);
			await this.setState("kp.value", { val: value, ack: true });
			await this.setState("kp.time", { val: this.parseNoaaTimestamp(time), ack: true });
			await this.setState("kp.g_scale", { val: this.computeGScaleFromKp(value), ack: true });
		} catch (e) {
			this.log.error(`Kp index update failed: ${e.message || e}`);
		}
	}

	async _updateKpForecast() {
		try {
			const data = await this.fetchKpForecast();
			const { max, maxTime, forecast } = this.getKpForecastFromData(data);
			await this.setState("kp.forecast_max", { val: max, ack: true });
			await this.setState("kp.forecast_max_time", { val: this.parseNoaaTimestamp(maxTime), ack: true });
			await this.setState("kp.forecast", { val: JSON.stringify(forecast), ack: true });
		} catch (e) {
			this.log.error(`Kp forecast update failed: ${e.message || e}`);
		}
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		try {
			await this.setObjectNotExistsAsync("probability", {
				type: "state",
				common: {
					name: "Aurora probability",
					type: "number",
					role: "value",
					unit: "%",
					min: 0,
					max: 100,
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync("observation_time", {
				type: "state",
				common: {
					name: "Observation time",
					type: "number",
					role: "date",
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync("forecast_time", {
				type: "state",
				common: {
					name: "Forecast time",
					type: "number",
					role: "date",
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync("solar_wind.bz", {
				type: "state",
				common: {
					name: "Solar wind Bz (GSM)",
					type: "number",
					role: "value",
					unit: "nT",
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync("solar_wind.bt", {
				type: "state",
				common: {
					name: "Solar wind total field (Bt)",
					type: "number",
					role: "value",
					unit: "nT",
					min: 0,
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync("solar_wind.speed", {
				type: "state",
				common: {
					name: "Solar wind proton speed",
					type: "number",
					role: "value",
					unit: "km/s",
					min: 0,
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync("solar_wind.density", {
				type: "state",
				common: {
					name: "Solar wind proton density",
					type: "number",
					role: "value",
					unit: "p/cm³",
					min: 0,
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync("solar_wind.mag_time", {
				type: "state",
				common: {
					name: "Solar wind magnetometer measurement time",
					type: "number",
					role: "date",
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync("solar_wind.plasma_time", {
				type: "state",
				common: {
					name: "Solar wind plasma measurement time",
					type: "number",
					role: "date",
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync("kp.value", {
				type: "state",
				common: {
					name: "Kp index",
					type: "number",
					role: "value",
					min: 0,
					max: 9,
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync("kp.time", {
				type: "state",
				common: {
					name: "Kp measurement time",
					type: "number",
					role: "date",
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync("kp.g_scale", {
				type: "state",
				common: {
					name: "Geomagnetic storm scale (G0–G5)",
					type: "number",
					role: "value",
					min: 0,
					max: 5,
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync("kp.forecast_max", {
				type: "state",
				common: {
					name: "Kp forecast maximum (72h)",
					type: "number",
					role: "value",
					min: 0,
					max: 9,
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync("kp.forecast_max_time", {
				type: "state",
				common: {
					name: "Kp forecast maximum time",
					type: "number",
					role: "date",
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setObjectNotExistsAsync("kp.forecast", {
				type: "state",
				common: {
					name: "Kp forecast 72h (JSON)",
					type: "string",
					role: "json",
					read: true,
					write: false,
				},
				native: {},
			});

			let lat = NaN;
			let lon = NaN;

			// get system coordinates if configured, otherwise use adapter config
			if (this.config.useSystemLocation) {
				const sysConfig = await this.getForeignObjectAsync("system.config");
				if (!isNaN(sysConfig?.common?.latitude) && !isNaN(sysConfig?.common?.longitude)) {
					lat = Number(sysConfig?.common?.latitude);
					lon = Number(sysConfig?.common?.longitude);
				} else {
					this.log.error("System coordinates are configured to be used, but not set. Aborting.");
					this.terminate(1);
					return;
				}
			} else if (!isNaN(this.config.latitude) && !isNaN(this.config.longitude)) {
				lat = this.config.latitude;
				lon = this.config.longitude;
			} else {
				this.log.error("Neither system nor specific coordinates are set. Aborting");
				this.terminate(1);
				return;
			}

			this.ovationIndex = this.getNoaaIndex(lat, lon);
			this.log.debug(`Latitude: ${lat}, Longitude: ${lon}`);
			this.log.debug(`Index: ${this.ovationIndex}`);

			await Promise.allSettled([this.updateData(), this.updateRealtimeData()]);

			const intervalMs = (this.config.interval || 5) * 60 * 1000;
			const realtimeIntervalMs = (this.config.realtimeInterval || 1) * 60 * 1000;
			this.updateInterval = this.setInterval(() => this.updateData(), intervalMs);
			this.realtimeUpdateInterval = this.setInterval(() => this.updateRealtimeData(), realtimeIntervalMs);
		} catch (e) {
			this.log.error(e);
			this.terminate(1);
		}
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 *
	 * @param {() => void} callback - Callback function
	 */
	onUnload(callback) {
		try {
			if (this.updateInterval) {
				this.clearInterval(this.updateInterval);
			}
			if (this.realtimeUpdateInterval) {
				this.clearInterval(this.realtimeUpdateInterval);
			}
			callback();
		} catch (error) {
			this.log.error(`Error during unloading: ${error.message}`);
			callback();
		}
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options] - Adapter options
	 */
	module.exports = options => new AuroraNowcast(options);
} else {
	// otherwise start the instance directly
	new AuroraNowcast();
}
