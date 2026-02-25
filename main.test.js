"use strict";

const { expect } = require("chai");
const { EventEmitter } = require("node:events");
const Module = require("node:module");
const noaaResponseExample = require("./test/resources/noaa_response_example.json");

class FakeAdapter extends EventEmitter {
	constructor(options = {}) {
		super();
		this.name = options.name;
		this.config = options.config || {};
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
		expect(adapter.getNoaaIndex(10.2, 52.7)).to.equal(1953);
	});

	it("converts negative longitude before index calculation", () => {
		const adapter = createAdapter({});
		expect(adapter.getNoaaIndex(-10.4, 52.2)).to.equal(63492);
	});

	it("rounds decimal inputs before indexing", () => {
		const adapter = createAdapter({});
		expect(adapter.getNoaaIndex(12.49, 48.5)).to.equal(adapter.getNoaaIndex(12, 49));
		expect(adapter.getNoaaIndex(12.5, 48.49)).to.equal(adapter.getNoaaIndex(13, 48));
	});

	it("handles longitude boundary at -180 and 180 consistently", () => {
		const adapter = createAdapter({});
		expect(adapter.getNoaaIndex(-180, 0)).to.equal(adapter.getNoaaIndex(180, 0));
		expect(adapter.getNoaaIndex(-180, -90)).to.equal(32580);
		expect(adapter.getNoaaIndex(180, 90)).to.equal(32760);
	});

	it("uses stored NOAA response and validates lon/lat/probability triplet at computed index", () => {
		const adapter = createAdapter({});
		const index = adapter.getNoaaIndex(0.2, -89.4);
		const triplet = noaaResponseExample.coordinates[index];

		expect(index).to.equal(1);
		expect(triplet).to.deep.equal([0, -89, 0]);
		// @ts-ignore
		expect(adapter.getAuroraProbabilityFromOvationData(noaaResponseExample, index)).to.equal(0);
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
			expect(requestedOptions.headers["User-Agent"]).to.equal("ioBroker-aurora-borealis");
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
});
