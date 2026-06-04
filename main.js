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
 * @property {string} time_tag
 * @property {number} kp_index
 * @property {number|null} estimated_kp
 * @property {string} kp
 */

/**
 * @typedef {object} KpForecastResult
 * @property {number} max
 * @property {string} maxTime
 * @property {Array.<{time: string, kp: number}>} forecast
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
	 * @param {string} url
	 * @returns {Promise<unknown>}
	 */
	async _fetchJson(url) {
		const controller = new AbortController();
		const timeout = this.setTimeout(() => controller.abort(), 10000);
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
			if (e.name === "AbortError") {
				throw new Error("NOAA request timeout");
			}
			throw e;
		} finally {
			clearTimeout(timeout);
		}
		return json;
	}

	/**
	 * @returns {Promise<OvationData>}
	 */
	async fetchOvation() {
		return /** @type {OvationData} */ (await this._fetchJson(this.config.ovationUrl));
	}

	/**
	 * @returns {Promise<KpEntry[]>}
	 */
	async fetchKpIndex() {
		return /** @type {KpEntry[]} */ (await this._fetchJson(this.config.kpIndexUrl));
	}

	/**
	 * @returns {Promise<Array.<Array.<string>>>}
	 */
	async fetchKpForecast() {
		return /** @type {Array.<Array.<string>>} */ (await this._fetchJson(this.config.kpForecastUrl));
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
	 * @param {KpEntry[]} data
	 * @returns {{ value: number, time: string }}
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
	 * @param {Array.<{time_tag: string, kp: number, observed: string, noaa_scale: string|null}>} data
	 * @returns {KpForecastResult}
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
		await Promise.allSettled([
			this._updateOvation(),
			this._updateKpForecast(),
		]);
	}

	async updateRealtimeData() {
		await Promise.allSettled([
			this._updateKpIndex(),
		]);
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

	async _updateKpIndex() {
		try {
			const data = await this.fetchKpIndex();
			const { value, time } = this.getKpValueFromData(data);
			await this.setState("kp.value", { val: value, ack: true });
			await this.setState("kp.time", { val: this.parseNoaaTimestamp(time), ack: true });
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
