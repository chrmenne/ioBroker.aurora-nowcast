const path = require("path");
const { tests } = require("@iobroker/testing");

tests.integration(path.join(__dirname, ".."), {
	// exit code 1 is expected when no coordinates are configured (default config has no coords)
	allowedExitCodes: [1, 11],
	defineAdditionalTests({ suite, it }) {
		suite("adapter starts with configured coordinates", (getHarness) => {
			before(async () => {
				await getHarness().changeAdapterConfig("aurora-nowcast", {
					native: {
						useSystemLocation: false,
						latitude: 52.5,
						longitude: 13.4,
					},
				});
			});

			it("The adapter starts and stays alive", function () {
				this.timeout(60000);
				return new Promise((resolve, reject) => {
					const harness = getHarness();
					harness
						.on("stateChange", async (id, state) => {
							if (
								id === "system.adapter.aurora-nowcast.0.alive" &&
								state &&
								state.val === true
							) {
								await new Promise((r) => setTimeout(r, 5000));
								resolve("The adapter started successfully.");
							}
						})
						.on("failed", (code) => {
							reject(
								new Error(
									`The adapter startup was interrupted unexpectedly with code ${code}`,
								),
							);
						});
					void harness.startAdapter();
				});
			});
		});
	},
});