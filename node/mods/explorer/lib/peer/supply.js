const { SUPPLY_BLOCK_COUNT } = require('../supply-rows');
const { success, failure, requestParams } = require('./response');

function blockHeaderMeta(block) {
	try {
		const json = JSON.parse(block.toJson());
		return {
			block_id: json.id,
			block_hash: json.hash,
		};
	} catch (err) {
		return {
			block_id: block?.id,
			block_hash: block?.hash,
		};
	}
}

async function handleRequestSupply(app, mod, txmsg) {
	const params = requestParams(txmsg);
	const requestedCount = Number(params.count ?? SUPPLY_BLOCK_COUNT);
	const count = Number.isFinite(requestedCount)
		? Math.min(Math.max(Math.floor(requestedCount), 1), 20)
		: SUPPLY_BLOCK_COUNT;

	if (!mod?.database) {
		return failure('explorer database unavailable');
	}

	let chainBlocks = [];
	try {
		chainBlocks = await app.core.blockchain.getBlocks(count, false);
	} catch (err) {
		console.error('Explorer: failed to read longest-chain blocks for supply', err);
		return failure('failed to read longest-chain blocks');
	}

	if (!Array.isArray(chainBlocks) || !chainBlocks.length) {
		return success({ count, columns: [] });
	}

	const ordered = chainBlocks.map((block) => blockHeaderMeta(block)).filter((entry) => entry.block_hash);
	const hashes = ordered.map((entry) => entry.block_hash);
	const dbRows = await mod.database.getStatisticsByBlockHashes(hashes);
	const rowMap = new Map(dbRows.map((row) => [row.block_hash, row]));

	const columns = ordered.map((meta) => {
		const stats = rowMap.get(meta.block_hash) || {};
		return {
			block_id: stats.block_id ?? meta.block_id,
			block_hash: meta.block_hash,
			...stats,
		};
	});

	return success({ count, columns });
}

module.exports = {
	handleRequestSupply,
};
