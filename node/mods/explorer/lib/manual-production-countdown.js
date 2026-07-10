const { analyzeBundleReadiness } = require('./burn-fee-timing');
const { EXPLORER_PRODUCE_BLOCK_WITH_GT_REQUEST } = require('./manual-block-production');

const GT_MINING_ESTIMATE_SEC = 30;

function clearManualProductionTimer(mod) {
	if (mod?.produceUiTimerId != null) {
		clearInterval(mod.produceUiTimerId);
		mod.produceUiTimerId = null;
	}
}

function formatGtMiningStatus(elapsedSec) {
	if (elapsedSec < GT_MINING_ESTIMATE_SEC) {
		return 'Mining Golden Ticket...';
	}
	return null;
}

async function estimateBundleWaitSeconds(app) {
	const readiness = await analyzeBundleReadiness(app);
	return Math.max(1, Math.ceil(Number(readiness.waitMs || 0) / 1000));
}

/**
 * Local browser-only status updates while a produce request is in flight.
 */
async function startManualProductionCountdown(app, mod, request) {
	clearManualProductionTimer(mod);

	const withGt = request === EXPLORER_PRODUCE_BLOCK_WITH_GT_REQUEST;
	const startedAt = Date.now();
	let gtFound = false;
	let remainingSec = withGt ? null : await estimateBundleWaitSeconds(app);

	const update = async () => {
		if (!mod.produceUiRequest) {
			return;
		}

		if (withGt) {
			const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);

			if (!gtFound) {
				const miningMessage = formatGtMiningStatus(elapsedSec);
				if (miningMessage) {
					mod.setSimulationToolbarMessage(miningMessage);
					return;
				}

				gtFound = true;
				remainingSec = await estimateBundleWaitSeconds(app);
				mod.setSimulationToolbarMessage('Golden Ticket found. Waiting for next block...');
			}

			if (remainingSec > 0) {
				mod.setSimulationToolbarMessage(`Waiting ${remainingSec}s...`);
				remainingSec -= 1;
				return;
			}

			mod.setSimulationToolbarMessage('Producing block...');
			return;
		}

		if (remainingSec > 0) {
			mod.setSimulationToolbarMessage(`Waiting ${remainingSec}s...`);
			remainingSec -= 1;
			return;
		}

		mod.setSimulationToolbarMessage('Producing block...');
	};

	update();
	mod.produceUiTimerId = setInterval(() => {
		update().catch((err) => {
			console.warn('Explorer: manual production countdown update failed', err);
		});
	}, 1000);
}

function stopManualProductionCountdown(mod) {
	clearManualProductionTimer(mod);
}

module.exports = {
	startManualProductionCountdown,
	stopManualProductionCountdown,
};
