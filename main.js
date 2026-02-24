"use strict";

/*
 * Created with @iobroker/create-adapter v3.1.2
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

// Load your modules here, e.g.:
// const fs = require("fs");

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
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}

	fetchNoaaData() {
		this.log.info("Fetching");
	}

	getNoaaIndex(lon, lat) {
		let rLat = Math.round(lat);
		let rLon = Math.round(lon);
		if (rLon < 0) {
			rLon += 360;
		}
		return rLon * 181 + (90 + rLat);
	}

	async fetchOvation() {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 10000);
		let json;
		try {
			const res = await fetch("https://services.swpc.noaa.gov/json/ovation_aurora_latest.json", {
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
		return json;
	}

	getAuroraProbabilityFromOvationData(json, index) {
		if (!json?.coordinates || !Array.isArray(json.coordinates)) {
			throw new Error("Invalid NOAA payload");
		}
		const cell = json.coordinates[index];
		if (!cell || cell.length < 3) {
			throw new Error("NOAA grid lookup failed");
		}
		return cell[2]; // probability %
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here
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
			await this.setObjectNotExistsAsync("timestamp", {
				type: "state",
				common: {
					name: "Last report timestamp",
					type: "number",
					role: "date",
					read: true,
					write: false,
				},
				native: {},
			});

			let lon;
			let lat;

			if (this.config.useSystemLocation) {
				const sysConfig = await this.getForeignObjectAsync("system.config");
				if (sysConfig?.common?.latitude && sysConfig?.common?.longitude) {
					lon = sysConfig?.common?.longitude;
					lat = sysConfig?.common?.latitude;
				} else {
					this.log.error("System coordinates are configured to be used, but not set.");
					this.stop(1);
				}
			} else if (this.config.latitude && this.config.longitude) {
				lon = this.config.longitude;
				lat = this.config.latitude;
			} else {
				this.log.error("Neither system nor specific coordinates are set.");
				this.stop(1);
			}

			const ovationIndex = this.getNoaaIndex(lon, lat);
			this.log.debug(`Lon: ${lon}, Lat: ${lat}`);
			this.log.debug(`Index: ${ovationIndex}`);

			const ovationJson = await this.fetchOvation();
			const probability = this.getAuroraProbabilityFromOvationData(ovationJson, ovationIndex);
			this.log.debug(`Probability: ${probability}`);

			await this.setState("probability", { val: 0, ack: true });
			await this.setState("timestamp", { val: Date.now(), ack: true });
		} catch (e) {
			this.log.error(e);
			this.stop(1);
			return;
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
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearTimeout(timeout2);
			// ...
			// clearInterval(interval1);

			callback();
		} catch (error) {
			this.log.error(`Error during unloading: ${error.message}`);
			callback();
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 *
	 * @param {string} id - State ID
	 * @param {ioBroker.State | null | undefined} state - State object
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);

			if (state.ack === false) {
				// This is a command from the user (e.g., from the UI or other adapter)
				// and should be processed by the adapter
				this.log.info(`User command received for ${id}: ${state.val}`);

				// TODO: Add your control logic here
			}
		} else {
			// The object was deleted or the state value has expired
			this.log.info(`state ${id} deleted`);
		}
	}
	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === "object" && obj.message) {
	// 		if (obj.command === "send") {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info("send command");

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
	// 		}
	// 	}
	// }
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
