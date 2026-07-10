const { getHeartbeatMs } = require('./burn-fee-timing');
const { mineAndSubmitOneGoldenTicket } = require('./golden-ticket-mining');
const { waitForManualBlockProduction } = require('./manual-block-produce-wait');
const {
	getBlockHashAtHeight,
	snapshotMempoolFeeTransactionSignatures,
	verifyProducedGoldenTicketBlock,
} = require('./verify-golden-ticket-block');
const { logManualProduction, logManualProductionError } = require('./manual-production-log');

/**
 * Mine one GT, wait for burn-fee timing, call wallet.produceBlockWithGt(), and
 * verify the resulting block contains that GT plus any waiting fee transactions.
 */
async function produceExplorerBlockWithGt(app, startBlockId) {
	const startId = Number(startBlockId) || 0;
	const heartbeatMs = getHeartbeatMs(app);
	const miningDeadline = Date.now() + Math.max(heartbeatMs * 8, 600_000);

	logManualProduction(`produceExplorerBlockWithGt() entered (startBlockId=${startId})`);

	try {
		const previousBlockHash = await getBlockHashAtHeight(app, startId);
		const feeTxSignaturesBefore = await snapshotMempoolFeeTransactionSignatures(app);

		logManualProduction(
			`GT production prep: previousBlockHash=${previousBlockHash || '(unknown)'}, ` +
				`feeTxsWaiting=${feeTxSignaturesBefore.length}`
		);

		logManualProduction('Mining started');
		let gtTx;
		try {
			gtTx = await mineAndSubmitOneGoldenTicket(app, miningDeadline);
		} catch (err) {
			logManualProductionError('mineAndSubmitOneGoldenTicket', err);
			throw err;
		}
		logManualProduction(
			`Mining completed; GT submitted (signature=${gtTx?.signature ? String(gtTx.signature).slice(0, 16) + '...' : '(none)'})`
		);

		logManualProduction('Entering production loop (wallet.produceBlockWithGt)');

		const produced = await waitForManualBlockProduction(
			app,
			startId,
			async () => {
				logManualProduction('Calling wallet.produceBlockWithGt()');
				let result = false;
				try {
					result = await app.wallet.produceBlockWithGt();
				} catch (err) {
					logManualProductionError('wallet.produceBlockWithGt', err);
					throw err;
				}
				logManualProduction(`wallet.produceBlockWithGt() returned: ${result}`);
				return result;
			},
			{
				heartbeatMs,
			}
		);

		if (!produced) {
			logManualProduction('GT production loop finished without new block');
			return false;
		}

		logManualProduction('Verifying produced GT block');
		const verified = await verifyProducedGoldenTicketBlock(
			app,
			startId,
			previousBlockHash,
			feeTxSignaturesBefore
		);
		logManualProduction(`GT block verification: ${verified ? 'passed' : 'failed'}`);
		return verified;
	} catch (err) {
		logManualProductionError('produceExplorerBlockWithGt', err);
		throw err;
	}
}

module.exports = {
	produceExplorerBlockWithGt,
};
