"use strict";

const { expect } = require("chai");
const { EventEmitter } = require("node:events");
const Module = require("node:module");
const noaaResponseExample = require("./test/resources/noaa_response_example.json");
const kp1mExample = require("./test/resources/kp_1m_example.json");
const kpForecastExample = require("./test/resources/kp_forecast_example.json");
const solarWindMagExample = require("./test/resources/solar_wind_mag_example.json");
const solarWindPlasmaExample = require("./test/resources/solar_wind_plasma_example.json");

class FakeAdapter extends EventEmitter {
	constructor(options = {}) {
		super();
		this.name = options.name;
		this.config = options.config || {};
		this.setTimeout = setTimeout;
		this.clearTimeout = clearTimeout;
		this.setInterval = setInterval;
		this.clearInterval = clearInterval;
		this.log = {
			debug: () => {},
			info: () => {},
			error: () => {},
		};
	}
}

// @ts-ignore
const originalLoad = Module._load;
// @ts-ignore
Module._load = function mockedLoad(request, parent, isMain) {
	if (request === "@iobroker/adapter-core") {
		return { Adapter: FakeAdapter };
	}
	return originalLoad.call(this, request, parent, isMain);
};

const createAdapter = require("./main");
// @ts-ignore
Module._load = originalLoad;

describe("main.js helper methods", () => {
	it("calculates NOAA index for positive longitude", () => {
		const adapter = createAdapter({});
		expect(adapter.getNoaaIndex(52.7, 10.2)).to.equal(1953);
	});

	it("converts negative longitude before index calculation", () => {
		const adapter = createAdapter({});
		expect(adapter.getNoaaIndex(52.2, -10.4)).to.equal(63492);
	});

	it("rounds decimal inputs before indexing", () => {
		const adapter = createAdapter({});
		expect(adapter.getNoaaIndex(48.5, 12.49)).to.equal(adapter.getNoaaIndex(49, 12));
		expect(adapter.getNoaaIndex(48.49, 12.5)).to.equal(adapter.getNoaaIndex(48, 13));
	});

	it("handles longitude boundary at -180 and 180 consistently", () => {
		const adapter = createAdapter({});
		expect(adapter.getNoaaIndex(0, -180)).to.equal(adapter.getNoaaIndex(0, 180));
		expect(adapter.getNoaaIndex(-90, -180)).to.equal(32580);
		expect(adapter.getNoaaIndex(90, 180)).to.equal(32760);
	});

	it("uses stored NOAA response and validates lon/lat/probability triplet at computed index", () => {
		const adapter = createAdapter({});
		const index = adapter.getNoaaIndex(-89.4, 0.2);
		const triplet = noaaResponseExample.coordinates[index];

		expect(index).to.equal(1);
		expect(triplet).to.deep.equal([0, -89, 99]);
		// @ts-ignore
		expect(adapter.getAuroraProbabilityFromOvationData(noaaResponseExample, index)).to.equal(99);
	});

	it("reads aurora probability from NOAA coordinate cell", () => {
		const adapter = createAdapter({});
		const payload = { coordinates: [[0, 0, 1], [1, 1, 42]] };

		// @ts-ignore
		expect(adapter.getAuroraProbabilityFromOvationData(payload, 1)).to.equal(42);
	});

	it("throws for malformed NOAA payload", () => {
		const adapter = createAdapter({});

		// @ts-ignore
		expect(() => adapter.getAuroraProbabilityFromOvationData({}, 0)).to.throw("Invalid NOAA payload");
		expect(() =>
			// @ts-ignore
			adapter.getAuroraProbabilityFromOvationData({ coordinates: [[0, 0]] }, 0),
		).to.throw("NOAA grid lookup failed");
	});

	it("parses NOAA observation and forecast times", () => {
		const adapter = createAdapter({});
		const payload = {
			"Observation Time": "2026-02-25T09:12:00Z",
			"Forecast Time": "2026-02-25T10:00:00Z",
		};

		// @ts-ignore
		expect(adapter.parseNoaaTimestamp(payload["Observation Time"])).to.equal(1772010720000);
		// @ts-ignore
		expect(adapter.parseNoaaTimestamp(payload["Forecast Time"])).to.equal(1772013600000);
	});

	it("throws for missing or malformed NOAA timestamps", () => {
		const adapter = createAdapter({});

		expect(() =>
			// @ts-ignore
			adapter.parseNoaaTimestamp(undefined),
		).to.throw("Invalid NOAA payload: missing timestamp");

		expect(() =>
			// @ts-ignore
			adapter.parseNoaaTimestamp(""),
		).to.throw("Invalid NOAA payload: missing timestamp");

		expect(() =>
			// @ts-ignore
			adapter.parseNoaaTimestamp("invalid"),
		).to.throw("Invalid NOAA payload: malformed timestamp");
	});

	it("fetches ovation JSON with user agent header", async () => {
		// @ts-ignore
		const adapter = createAdapter({ config: { ovationUrl: "https://example.invalid/noaa" } });
		const expected = { coordinates: [[0, 0, 77]] };
		let requestedOptions;

		const originalFetch = global.fetch;
		// @ts-ignore
		global.fetch = async (url, options) => {
			expect(url).to.equal("https://example.invalid/noaa");
			requestedOptions = options;
			return {
				ok: true,
				json: async () => expected,
			};
		};

		try {
			const data = await adapter.fetchOvation();
			expect(data).to.deep.equal(expected);
			// @ts-ignore
			expect(requestedOptions.headers["User-Agent"]).to.equal("ioBroker-aurora-nowcast");
			// @ts-ignore
			expect(requestedOptions.signal).to.exist;
		} finally {
			global.fetch = originalFetch;
		}
	});

	it("throws meaningful error for non-OK NOAA responses", async () => {
		// @ts-ignore
		const adapter = createAdapter({ config: { ovationUrl: "https://example.invalid/noaa" } });
		const originalFetch = global.fetch;
		// @ts-ignore
		global.fetch = async () => ({ ok: false, status: 503 });

		try {
			let error;
			try {
				await adapter.fetchOvation();
			} catch (e) {
				error = e;
			}
			expect(error).to.be.instanceOf(Error);
			expect(error.message).to.equal("NOAA HTTP 503");
		} finally {
			global.fetch = originalFetch;
		}
	});

	// --- Kp index ---

	it("extracts latest valid Kp value from real 1-minute fixture", () => {
		const adapter = createAdapter({});
		const result = adapter.getKpValueFromData(kp1mExample);
		expect(result.value).to.equal(0);
		expect(result.time).to.equal("2026-06-04T21:44:00");
	});

	it("skips null estimated_kp entries and returns last valid one", () => {
		const adapter = createAdapter({});
		const data = [
			{ time_tag: "2026-06-04T09:00:00", kp_index: 2, estimated_kp: 2.0, kp: "2o" },
			{ time_tag: "2026-06-04T10:00:00", kp_index: 0, estimated_kp: null, kp: "0P" },
		];
		const result = adapter.getKpValueFromData(data);
		expect(result.value).to.equal(2.0);
		expect(result.time).to.equal("2026-06-04T09:00:00");
	});

	it("throws for empty Kp payload", () => {
		const adapter = createAdapter({});
		expect(() => adapter.getKpValueFromData([])).to.throw("Invalid Kp payload");
	});

	it("throws when all estimated_kp entries are null", () => {
		const adapter = createAdapter({});
		const data = [{ time_tag: "2026-06-04T09:00:00", kp_index: 0, estimated_kp: null, kp: "0P" }];
		expect(() => adapter.getKpValueFromData(data)).to.throw("No valid Kp data found");
	});

	it("throws for non-array Kp payload", () => {
		const adapter = createAdapter({});
		// @ts-ignore
		expect(() => adapter.getKpValueFromData(null)).to.throw("Invalid Kp payload");
	});

	it("builds forecast list and finds max from real forecast fixture", () => {
		const adapter = createAdapter({});
		const result = adapter.getKpForecastFromData(kpForecastExample);
		expect(result.max).to.equal(6.67);
		expect(result.maxTime).to.equal("2026-06-05T03:00:00");
		expect(result.forecast).to.have.length(81);
		expect(result.forecast[0]).to.deep.equal({ time: "2026-05-28T00:00:00", kp: 2 });
	});

	it("throws for empty forecast payload", () => {
		const adapter = createAdapter({});
		expect(() => adapter.getKpForecastFromData([])).to.throw("Invalid Kp forecast payload");
	});

	it("throws for non-array forecast payload", () => {
		const adapter = createAdapter({});
		// @ts-ignore
		expect(() => adapter.getKpForecastFromData(null)).to.throw("Invalid Kp forecast payload");
	});

	// --- Kp G-scale ---

	it("computes G-scale 0 for Kp below 5", () => {
		const adapter = createAdapter({});
		expect(adapter.computeGScaleFromKp(0)).to.equal(0);
		expect(adapter.computeGScaleFromKp(4.99)).to.equal(0);
		expect(adapter.computeGScaleFromKp(4)).to.equal(0);
	});

	it("computes correct G-scale for storm conditions", () => {
		const adapter = createAdapter({});
		expect(adapter.computeGScaleFromKp(5)).to.equal(1);
		expect(adapter.computeGScaleFromKp(5.67)).to.equal(1);
		expect(adapter.computeGScaleFromKp(6)).to.equal(2);
		expect(adapter.computeGScaleFromKp(6.67)).to.equal(2);
		expect(adapter.computeGScaleFromKp(7)).to.equal(3);
		expect(adapter.computeGScaleFromKp(8)).to.equal(4);
		expect(adapter.computeGScaleFromKp(9)).to.equal(5);
	});

	// --- Solar wind ---

	it("extracts Bz and Bt from real mag fixture (newest-first array)", () => {
		const adapter = createAdapter({});
		const result = adapter.getSolarWindMagFromData(solarWindMagExample);
		expect(result.bz).to.equal(4.58);
		expect(result.bt).to.equal(4.78);
		expect(result.time).to.equal("2026-06-04T22:13:00");
	});

	it("skips null bz_gsm entries and returns first valid one", () => {
		const adapter = createAdapter({});
		const data = [
			{ time_tag: "2026-06-04T10:01:00", bt: 5.0, bz_gsm: null },
			{ time_tag: "2026-06-04T10:00:00", bt: 4.5, bz_gsm: -3.2 },
		];
		const result = adapter.getSolarWindMagFromData(data);
		expect(result.bz).to.equal(-3.2);
		expect(result.bt).to.equal(4.5);
		expect(result.time).to.equal("2026-06-04T10:00:00");
	});

	it("throws for empty mag payload", () => {
		const adapter = createAdapter({});
		expect(() => adapter.getSolarWindMagFromData([])).to.throw("Invalid solar wind mag payload");
	});

	it("throws when all bz_gsm entries are null", () => {
		const adapter = createAdapter({});
		const data = [{ time_tag: "2026-06-04T10:00:00", bt: 5.0, bz_gsm: null }];
		expect(() => adapter.getSolarWindMagFromData(data)).to.throw("No valid solar wind mag data found");
	});

	it("throws for non-array mag payload", () => {
		const adapter = createAdapter({});
		// @ts-ignore
		expect(() => adapter.getSolarWindMagFromData(null)).to.throw("Invalid solar wind mag payload");
	});

	it("extracts speed and density from real plasma fixture (newest-first array)", () => {
		const adapter = createAdapter({});
		const result = adapter.getSolarWindPlasmaFromData(solarWindPlasmaExample);
		expect(result.speed).to.equal(430.6);
		expect(result.density).to.equal(4.16);
		expect(result.time).to.equal("2026-06-04T22:14:00");
	});

	it("skips null proton_speed entries and returns first valid one", () => {
		const adapter = createAdapter({});
		const data = [
			{ time_tag: "2026-06-04T10:01:00", proton_speed: null, proton_density: null },
			{ time_tag: "2026-06-04T10:00:00", proton_speed: 450.5, proton_density: 5.3 },
		];
		const result = adapter.getSolarWindPlasmaFromData(data);
		expect(result.speed).to.equal(450.5);
		expect(result.density).to.equal(5.3);
		expect(result.time).to.equal("2026-06-04T10:00:00");
	});

	it("returns null density when proton_density is null", () => {
		const adapter = createAdapter({});
		const data = [{ time_tag: "2026-06-04T10:00:00", proton_speed: 400.0, proton_density: null }];
		expect(adapter.getSolarWindPlasmaFromData(data).density).to.equal(null);
	});

	it("throws for empty plasma payload", () => {
		const adapter = createAdapter({});
		expect(() => adapter.getSolarWindPlasmaFromData([])).to.throw("Invalid solar wind plasma payload");
	});

	it("throws when all proton_speed entries are null", () => {
		const adapter = createAdapter({});
		const data = [{ time_tag: "2026-06-04T10:00:00", proton_speed: null, proton_density: null }];
		expect(() => adapter.getSolarWindPlasmaFromData(data)).to.throw("No valid solar wind plasma data found");
	});

	it("throws for non-array plasma payload", () => {
		const adapter = createAdapter({});
		// @ts-ignore
		expect(() => adapter.getSolarWindPlasmaFromData(null)).to.throw("Invalid solar wind plasma payload");
	});

	// --- onReady integration ---

	it("uses system coordinates and updates datapoints after successful NOAA request", async () => {
		const adapter = createAdapter({
			config: {
				useSystemLocation: true,
				ovationUrl: "https://example.invalid/noaa",
				interval: 10,
			},
		});
		const stateCalls = [];
		const objectCalls = [];
		const terminateCalls = [];
		const intervalDelays = [];

		adapter.setObjectNotExistsAsync = async (id, obj) => {
			objectCalls.push({ id, obj });
		};
		adapter.getForeignObjectAsync = async (id) => {
			expect(id).to.equal("system.config");
			return { common: { latitude: -89.4, longitude: 0.2 } };
		};
		adapter.fetchOvation = async () => noaaResponseExample;
		adapter.fetchKpIndex = async () => { throw new Error("not mocked"); };
		adapter.fetchKpForecast = async () => { throw new Error("not mocked"); };
		adapter.fetchSolarWindMag = async () => { throw new Error("not mocked"); };
		adapter.fetchSolarWindPlasma = async () => { throw new Error("not mocked"); };
		adapter.setState = async (id, state) => {
			stateCalls.push({ id, state });
		};
		adapter.terminate = (code) => {
			terminateCalls.push(code);
		};
		adapter.setInterval = (_fn, ms) => {
			intervalDelays.push(ms);
			return null;
		};

		await adapter.onReady();

		expect(objectCalls.map(call => call.id)).to.deep.equal([
			"probability",
			"observation_time",
			"forecast_time",
			"solar_wind.bz",
			"solar_wind.bt",
			"solar_wind.speed",
			"solar_wind.density",
			"solar_wind.mag_time",
			"solar_wind.plasma_time",
			"kp.value",
			"kp.time",
			"kp.g_scale",
			"kp.forecast_max",
			"kp.forecast_max_time",
			"kp.forecast",
		]);
		expect(stateCalls).to.deep.equal([
			{ id: "probability", state: { val: 99, ack: true } },
			{ id: "observation_time", state: { val: 1772010720000, ack: true } },
			{ id: "forecast_time", state: { val: 1772013600000, ack: true } },
		]);
		expect(terminateCalls).to.deep.equal([]);
		expect(intervalDelays).to.deep.equal([600000, 60000]); // 10 min standard + 1 min realtime (default)
	});

	it("uses adapter-configured coordinates and updates datapoints after successful NOAA request", async () => {
		const adapter = createAdapter({
			config: {
				useSystemLocation: false,
				latitude: -89.4,
				longitude: 0.2,
				ovationUrl: "https://example.invalid/noaa",
				interval: 5,
			},
		});
		const stateCalls = [];
		const objectCalls = [];
		const terminateCalls = [];
		const intervalDelays = [];

		adapter.setObjectNotExistsAsync = async (id, obj) => {
			objectCalls.push({ id, obj });
		};
		adapter.getForeignObjectAsync = async () => {
			throw new Error("system.config should not be read when adapter coordinates are configured");
		};
		adapter.fetchOvation = async () => noaaResponseExample;
		adapter.fetchKpIndex = async () => { throw new Error("not mocked"); };
		adapter.fetchKpForecast = async () => { throw new Error("not mocked"); };
		adapter.fetchSolarWindMag = async () => { throw new Error("not mocked"); };
		adapter.fetchSolarWindPlasma = async () => { throw new Error("not mocked"); };
		adapter.setState = async (id, state) => {
			stateCalls.push({ id, state });
		};
		adapter.terminate = (code) => {
			terminateCalls.push(code);
		};
		adapter.setInterval = (_fn, ms) => {
			intervalDelays.push(ms);
			return null;
		};

		await adapter.onReady();

		expect(objectCalls.map(call => call.id)).to.deep.equal([
			"probability",
			"observation_time",
			"forecast_time",
			"solar_wind.bz",
			"solar_wind.bt",
			"solar_wind.speed",
			"solar_wind.density",
			"solar_wind.mag_time",
			"solar_wind.plasma_time",
			"kp.value",
			"kp.time",
			"kp.g_scale",
			"kp.forecast_max",
			"kp.forecast_max_time",
			"kp.forecast",
		]);
		expect(stateCalls).to.deep.equal([
			{ id: "probability", state: { val: 99, ack: true } },
			{ id: "observation_time", state: { val: 1772010720000, ack: true } },
			{ id: "forecast_time", state: { val: 1772013600000, ack: true } },
		]);
		expect(terminateCalls).to.deep.equal([]);
		expect(intervalDelays).to.deep.equal([300000, 60000]); // 5 min standard + 1 min realtime (default)
	});

	it("uses configured realtimeInterval for realtime polling", async () => {
		const adapter = createAdapter({
			config: {
				useSystemLocation: false,
				latitude: -89.4,
				longitude: 0.2,
				ovationUrl: "https://example.invalid/noaa",
				interval: 15,
				realtimeInterval: 2,
			},
		});
		const intervalDelays = [];

		adapter.setObjectNotExistsAsync = async () => {};
		adapter.getForeignObjectAsync = async () => {
			throw new Error("should not be called");
		};
		adapter.fetchOvation = async () => noaaResponseExample;
		adapter.fetchKpIndex = async () => { throw new Error("not mocked"); };
		adapter.fetchKpForecast = async () => { throw new Error("not mocked"); };
		adapter.fetchSolarWindMag = async () => { throw new Error("not mocked"); };
		adapter.fetchSolarWindPlasma = async () => { throw new Error("not mocked"); };
		adapter.setState = async () => {};
		adapter.terminate = () => {};
		adapter.setInterval = (_fn, ms) => {
			intervalDelays.push(ms);
			return null;
		};

		await adapter.onReady();

		expect(intervalDelays).to.deep.equal([900000, 120000]); // 15 min standard + 2 min realtime
	});

	it("terminates with code 1 and skips NOAA fetch when system coordinates are not set", async () => {
		const adapter = createAdapter({
			config: {
				useSystemLocation: true,
				ovationUrl: "https://example.invalid/noaa",
			},
		});
		const terminateCalls = [];
		let fetchCalled = false;

		adapter.setObjectNotExistsAsync = async () => {};
		adapter.getForeignObjectAsync = async () => ({ common: {} });
		adapter.fetchOvation = async () => {
			fetchCalled = true;
			return noaaResponseExample;
		};
		adapter.setState = async () => {};
		adapter.terminate = (code) => {
			terminateCalls.push(code);
		};
		adapter.setInterval = () => null;

		await adapter.onReady();

		expect(terminateCalls).to.deep.equal([1]);
		expect(fetchCalled).to.equal(false);
	});

	it("terminates with code 1 and skips NOAA fetch when no coordinates are configured", async () => {
		const adapter = createAdapter({
			config: {
				useSystemLocation: false,
				ovationUrl: "https://example.invalid/noaa",
			},
		});
		const terminateCalls = [];
		let fetchCalled = false;

		adapter.setObjectNotExistsAsync = async () => {};
		adapter.getForeignObjectAsync = async () => {
			throw new Error("system.config should not be read when useSystemLocation is false");
		};
		adapter.fetchOvation = async () => {
			fetchCalled = true;
			return noaaResponseExample;
		};
		adapter.setState = async () => {};
		adapter.terminate = (code) => {
			terminateCalls.push(code);
		};
		adapter.setInterval = () => null;

		await adapter.onReady();

		expect(terminateCalls).to.deep.equal([1]);
		expect(fetchCalled).to.equal(false);
	});
});
