const {
	allowsManualTestingOnServer,
	EXPLORER_PRODUCE_BLOCK_REQUEST,
	EXPLORER_PRODUCE_BLOCK_WITH_GT_REQUEST,
} = require('./manual-block-production');
const { success, failure } = require('./peer/response');
const { logManualProduction, logManualProductionError } = require('./manual-production-log');

/**
 * Explorer manual-simulation test mode.
 * Server-owned state: set once per process lifetime; no exit until Explorer restarts.
 */

function disableTimerProductionOnServer(app) {
	if (app?.BROWSER != 0 || !app?.wallet?.disableProducingBlocksByTimer) {
		return Promise.resolve();
	}

	logManualProduction('Disabling automatic timer production (test mode)');
	logManualProduction('wallet.disableProducingBlocksByTimer() started');

	return Promise.resolve(app.wallet.disableProducingBlocksByTimer())
		.then(() => {
			logManualProduction('wallet.disableProducingBlocksByTimer() completed');
		})
		.catch((err) => {
			logManualProductionError('disableTimerProductionOnServer', err);
			console.warn('Explorer: disableProducingBlocksByTimer failed', err);
		});
}

/**
 * Server-only: enter test mode when not already active.
 */
function enterExplorerTestMode(app, mod) {
	if (app?.BROWSER == 1 || !mod || mod.test_mode === true) {
		return;
	}

	mod.test_mode = true;
	logManualProduction('Entering test mode');
	disableTimerProductionOnServer(app);
}

function manualTestingDeniedMessage(app, mod) {
	if (!allowsManualTestingOnServer(app, mod)) {
		return 'Manual block production is disabled on this server.';
	}
	return 'Cannot enter Explorer test mode.';
}

/**
 * Server: permit manual simulation and enter test mode when needed.
 */
function ensureExplorerTestModeForManualAction(app, mod) {
	const spamEnabled = Boolean(app?.modules?.returnModule('spam'));
	const nodeEnv = String(process.env.NODE_ENV || '(unset)');

	logManualProduction(
		`ensureExplorerTestModeForManualAction: test_mode=${Boolean(mod?.test_mode)}, ` +
			`enable_manual_testing=${Boolean(mod?.enable_manual_testing)}, ` +
			`spam=${spamEnabled}, NODE_ENV=${nodeEnv}`
	);

	if (!allowsManualTestingOnServer(app, mod)) {
		logManualProduction('Manual testing not permitted on this server');
		return { ok: false, error: manualTestingDeniedMessage(app, mod) };
	}

	if (!mod.test_mode) {
		logManualProduction('Not in test mode yet — entering test mode');
		enterExplorerTestMode(app, mod);
	} else {
		logManualProduction('Already in test mode');
	}

	return { ok: true };
}

/**
 * Prepare a manual block production request: test mode + starting block height.
 */
async function beginManualBlockProduction(app, mod) {
	if (app?.BROWSER == 1 || !mod) {
		return { ok: false, error: 'Manual block production is server-only.' };
	}

	try {
		const gate = ensureExplorerTestModeForManualAction(app, mod);
		if (!gate.ok) {
			return gate;
		}

		const startBlockId = Number(await app.blockchain.getLatestBlockId()) || 0;
		logManualProduction(`beginManualBlockProduction: starting block id=${startBlockId}`);
		return { ok: true, startBlockId };
	} catch (err) {
		logManualProductionError('beginManualBlockProduction', err);
		throw err;
	}
}

function requestVariantLabel(requestType) {
	if (requestType === EXPLORER_PRODUCE_BLOCK_WITH_GT_REQUEST) {
		return 'GT';
	}
	if (requestType === EXPLORER_PRODUCE_BLOCK_REQUEST) {
		return 'non-GT';
	}
	return requestType || 'unknown';
}

/**
 * Server produce request: test mode, wallet produce helper, callback when done.
 */
async function runManualBlockProductionRequest(
	app,
	mod,
	produceExplorerBlock,
	mycallback,
	requestType = ''
) {
	const variant = requestVariantLabel(requestType);

	logManualProduction(`runManualBlockProductionRequest entered (variant=${variant})`);

	try {
		const begin = await beginManualBlockProduction(app, mod);
		if (!begin.ok) {
			logManualProduction(`FAILURE callback: ${begin.error}`);
			if (mycallback) {
				mycallback(failure(begin.error));
			}
			return;
		}

		logManualProduction(
			`runManualBlockProductionRequest: startBlockId=${begin.startBlockId}, variant=${variant}`
		);

		const produced = await produceExplorerBlock(app, begin.startBlockId);

		if (produced) {
			logManualProduction(`SUCCESS callback: block produced (start=${begin.startBlockId})`);
			if (mycallback) {
				mycallback(success({ blockProduced: true }));
			}
			return;
		}

		const latestBlockId = Number(await app.blockchain.getLatestBlockId());
		if (latestBlockId > begin.startBlockId) {
			const reason = 'Produced block failed Explorer verification.';
			logManualProduction(`FAILURE callback: ${reason} (current=${latestBlockId}, start=${begin.startBlockId})`);
			if (mycallback) {
				mycallback(failure(reason));
			}
			return;
		}

		const reason = 'Block production timed out.';
		logManualProduction(
			`FAILURE callback: ${reason} (current=${latestBlockId}, start=${begin.startBlockId})`
		);
		if (mycallback) {
			mycallback(failure(reason));
		}
	} catch (err) {
		logManualProductionError('runManualBlockProductionRequest', err);
		console.error('Explorer: manual block production failed on server', err);
		logManualProduction(`FAILURE callback: ${err?.message || 'Block production failed.'}`);
		if (mycallback) {
			mycallback(failure(err?.message || 'Block production failed.'));
		}
	}
}

module.exports = {
	enterExplorerTestMode,
	ensureExplorerTestModeForManualAction,
	beginManualBlockProduction,
	runManualBlockProductionRequest,
	manualTestingDeniedMessage,
};
