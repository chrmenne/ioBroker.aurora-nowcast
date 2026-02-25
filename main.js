/* eslint-disable jsdoc/check-tag-names */
"use strict";

/*
 * Created with @iobroker/create-adapter v3.1.2
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

/**
 * The structure of the NOAA ovation data response
 *
 * @typedef {object} OvationData
 * @property {string} observationTime - ISO timestamp of the observation time
 * @property {string} forecastTime - ISO timestamp of the forecast time
 * @property {Array.<[number, number, number]>} coordinates - Array of [lon, lat, probability] triplets
 */

class AuroraBorealis extends utils.Adapter {
	/**
	 * @param {Partial<utils.AdapterOptions>} [options] - Adapter options
	 */
	constructor(options) {
		super({
			...options,
			name: "aurora-borealis",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("unload", this.onUnload.bind(this));
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
	 * Fetches aurora borealis ovation data from NOAA.
	 *
	 * @async
	 * @throws Will throw an error if the request fails or times out
	 * @returns {Promise<OvationData>} The ovation data containing observation time, forecast time, and coordinates
	 */
	async fetchOvation() {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 10000);
		let json;
		try {
			const res = await fetch(this.config.ovationUrl, {
				signal: controller.signal,
				headers: {
					"User-Agent": "ioBroker-aurora-borealis",
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
		return /** @type {OvationData} */ (json);
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
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initializing the adapter by creating the data points if not already present.
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

			let lat;
			let lon;

			// get system coordinates if configured, otherwise use adapter config
			if (this.config.useSystemLocation) {
				const sysConfig = await this.getForeignObjectAsync("system.config");
				if (sysConfig?.common?.latitude && sysConfig?.common?.longitude) {
					lat = sysConfig.common.latitude;
					lon = sysConfig.common.longitude;
				} else {
					this.log.error("System coordinates are configured to be used, but not set. Aborting.");
					return;
				}
			} else if (
				this.config.latitude != null &&
				this.config.longitude != null &&
				Number.isFinite(this.config.latitude) &&
				Number.isFinite(this.config.longitude)
			) {
				lat = this.config.latitude;
				lon = this.config.longitude;
			} else {
				this.log.error("Neither system nor specific coordinates are set. Aborting");
				return;
			}

			const ovationIndex = this.getNoaaIndex(lat, lon);
			this.log.debug(`Latitude: ${lat}, Longitude: ${lon}`);
			this.log.debug(`Index: ${ovationIndex}`);

			const ovationJson = await this.fetchOvation();
			const probability = this.getAuroraProbabilityFromOvationData(ovationJson, ovationIndex);
			this.log.debug(`Probability: ${probability}`);

			await this.setState("probability", { val: probability, ack: true });
			await this.setState("observation_time", {
				val: new Date(ovationJson["Observation Time"]).getTime(),
				ack: true,
			});
			await this.setState("forecast_time", {
				val: new Date(ovationJson["Forecast Time"]).getTime(),
				ack: true,
			});
		} catch (e) {
			this.log.error(e);
			this.terminate(1);
		}

		this.terminate(0);
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 *
	 * @param {() => void} callback - Callback function
	 */
	onUnload(callback) {
		try {
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
	module.exports = options => new AuroraBorealis(options);
} else {
	// otherwise start the instance directly
	new AuroraBorealis();
}
