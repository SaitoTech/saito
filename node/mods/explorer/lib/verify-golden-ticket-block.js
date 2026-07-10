const { TransactionType } = require('saito-js/lib/transaction');
const Saito = require('saito-js/saito').default;

async function getBlockHashAtHeight(app, blockId) {
	const blocks = await app.core.blockchain.getBlocks(Math.max(Number(blockId) + 2, 4), false);
	const match = (Array.isArray(blocks) ? blocks : []).find(
		(block) => Number(block?.id) === Number(blockId)
	);
	return match?.hash ? String(match.hash) : null;
}

async function snapshotMempoolFeeTransactionSignatures(app) {
	const txs = await Saito.getInstance().getMempoolTxs();
	const signatures = [];

	for (let i = 0; i < txs.length; i++) {
		const tx = txs[i];
		if (Number(tx?.type) === TransactionType.GoldenTicket) {
			continue;
		}

		try {
			if (BigInt(tx?.total_fees ?? 0) <= 0n) {
				continue;
			}
		} catch (err) {
			continue;
		}

		if (tx?.signature) {
			signatures.push(String(tx.signature));
		}
	}

	return signatures;
}

function isGoldenTicketTransaction(tx) {
	const type = tx?.type;
	return (
		type === TransactionType.GoldenTicket ||
		type === 'GoldenTicket' ||
		Number(type) === TransactionType.GoldenTicket
	);
}

function normalizeHashHex(value) {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/^0x/, '');
}

function goldenTicketTargetHex(tx) {
	if (!tx?.data || tx.data.length < 32) {
		return null;
	}

	const bytes = tx.data instanceof Uint8Array ? tx.data : new Uint8Array(tx.data);
	return Buffer.from(bytes.slice(0, 32)).toString('hex');
}

/**
 * Verify the block above startBlockId contains one GT for the previous block
 * and includes any fee transactions that were already waiting in the mempool.
 */
async function verifyProducedGoldenTicketBlock(
	app,
	startBlockId,
	previousBlockHash,
	expectedFeeSignatures = []
) {
	const startId = Number(startBlockId) || 0;
	const latestBlockId = Number(await app.blockchain.getLatestBlockId());
	if (latestBlockId <= startId) {
		console.warn('Explorer: GT block verification failed — chain height unchanged', {
			startBlockId: startId,
			latestBlockId,
		});
		return false;
	}

	const block = await app.core.blockchain.getBlock(BigInt(latestBlockId), true);
	const transactions = Array.isArray(block?.transactions) ? block.transactions : [];
	const goldenTickets = transactions.filter(isGoldenTicketTransaction);

	if (goldenTickets.length !== 1) {
		console.warn('Explorer: GT block verification failed — expected one golden ticket', {
			count: goldenTickets.length,
			blockId: latestBlockId,
		});
		return false;
	}

	const expectedTarget = normalizeHashHex(previousBlockHash);
	const actualTarget = normalizeHashHex(goldenTicketTargetHex(goldenTickets[0]));
	if (!expectedTarget || !actualTarget || actualTarget !== expectedTarget) {
		console.warn('Explorer: GT block verification failed — target mismatch', {
			expectedTarget,
			actualTarget,
			blockId: latestBlockId,
		});
		return false;
	}

	if (expectedFeeSignatures.length > 0) {
		const bundled = new Set(
			transactions.map((tx) => (tx?.signature ? String(tx.signature) : '')).filter(Boolean)
		);

		for (let i = 0; i < expectedFeeSignatures.length; i++) {
			if (!bundled.has(expectedFeeSignatures[i])) {
				console.warn(
					'Explorer: GT block verification failed — fee transaction not bundled',
					{
						signature: expectedFeeSignatures[i],
						blockId: latestBlockId,
					}
				);
				return false;
			}
		}
	}

	return true;
}

module.exports = {
	getBlockHashAtHeight,
	snapshotMempoolFeeTransactionSignatures,
	verifyProducedGoldenTicketBlock,
};
