const { getHeartbeatMs } = require('./burn-fee-timing');
const { waitForManualBlockProduction } = require('./manual-block-produce-wait');
const { logManualProduction, logManualProductionError } = require('./manual-production-log');

/**
 * Wait for burn-fee timing, then call wallet.produceBlockWithoutGt() until one
 * new block has been added or the deadline passes.
 */
async function produceExplorerBlockWithoutGt(app, mod, startBlockId) {
	logManualProduction(`produceExplorerBlockWithoutGt() entered (startBlockId=${startBlockId})`);

	const feeTransactions = Array.isArray(mod?.pendingManualProduceTransactions)
		? [...mod.pendingManualProduceTransactions]
		: [];

	try {
		const heartbeatMs = getHeartbeatMs(app);

		const produced = await waitForManualBlockProduction(
			app,
			startBlockId,
			async () => {
				logManualProduction('Calling wallet.produceBlockWithoutGt()');
				let result = false;
				try {
					result = await app.wallet.produceBlockWithoutGt(
						feeTransactions.length ? feeTransactions : undefined
					);
				} catch (err) {
					logManualProductionError('wallet.produceBlockWithoutGt', err);
					throw err;
				}
				logManualProduction(`wallet.produceBlockWithoutGt() returned: ${result}`);
				return result;
			},
			{
				heartbeatMs,
			}
		);

		if (produced && feeTransactions.length) {
			mod.pendingManualProduceTransactions = [];
		}

		return produced;
	} catch (err) {
		logManualProductionError('produceExplorerBlockWithoutGt', err);
		throw err;
	}
}

module.exports = {
	produceExplorerBlockWithoutGt,
};
