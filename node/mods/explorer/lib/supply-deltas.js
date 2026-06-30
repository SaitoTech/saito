/**
 * Header-visible accounting buckets compared block-to-block.
 * UTXO is intentionally excluded — it is not derivable from headers alone.
 */
const ACCOUNTING_DELTA_FIELDS = [
	{ key: 'treasury', label: 'Δ Treasury' },
	{ key: 'graveyard', label: 'Δ Graveyard' },
	{ key: 'previous_block_unpaid', label: 'Δ Previous Block Unpaid' },
	{ key: 'total_fees', label: 'Δ Outstanding Fees' },
];

/** Reconciliation row — sum of ACCOUNTING_DELTA_FIELDS at render time. */
const DELTA_TOTAL_FIELD = { key: 'total', label: 'Δ TOTAL' };

/**
 * Ordered rows for the dedicated delta section.
 * Extend ACCOUNTING_DELTA_FIELDS to add more bucket deltas; total follows automatically.
 */
const DELTA_SECTION_ROWS = [...ACCOUNTING_DELTA_FIELDS, DELTA_TOTAL_FIELD];

const EMPTY_BLOCK_HASH =
	'0000000000000000000000000000000000000000000000000000000000000000';

function toBigInt(value) {
	if (value === undefined || value === null || value === '') {
		return 0n;
	}
	try {
		return BigInt(value);
	} catch (err) {
		return 0n;
	}
}

/**
 * Resolve the previous longest-chain block row via previous_block_hash.
 * Checks the displayed window first, then the Explorer blocks database.
 */
async function resolvePreviousBlockRow(currentRow, hashIndex, mod, toStatsRow) {
	const parentHash = String(currentRow?.previous_block_hash || '').trim();
	if (!parentHash || parentHash === EMPTY_BLOCK_HASH) {
		return null;
	}

	if (hashIndex?.has(parentHash)) {
		return hashIndex.get(parentHash);
	}

	if (!mod?.database?.getStatisticsByBlockHash || typeof toStatsRow !== 'function') {
		return null;
	}

	try {
		const dbRow = await mod.database.getStatisticsByBlockHash(parentHash);
		return dbRow ? toStatsRow(dbRow) : null;
	} catch (err) {
		console.error('Explorer: failed to resolve previous block for supply delta', err);
		return null;
	}
}

/**
 * Compute the delta for a single accounting field between two blocks.
 */
function computeFieldDelta(currentRow, previousRow, fieldKey) {
	if (!currentRow || !previousRow) {
		return null;
	}
	return toBigInt(currentRow[fieldKey]) - toBigInt(previousRow[fieldKey]);
}

/**
 * Sum bucket deltas. Returns null when any bucket delta is unavailable.
 */
function computeTotalDelta(bucketDeltas = {}) {
	let total = 0n;

	for (let i = 0; i < ACCOUNTING_DELTA_FIELDS.length; i++) {
		const field = ACCOUNTING_DELTA_FIELDS[i];
		const delta = bucketDeltas[field.key];

		if (delta === null || delta === undefined) {
			return null;
		}

		total += delta;
	}

	return total;
}

/**
 * Compute header deltas for every displayed block (low block id → high).
 * Each delta uses the previous longest-chain block via previous_block_hash.
 */
async function computeAccountingDeltas(statsRows = [], options = {}) {
	const { mod, toStatsRow } = options;
	const hashIndex = new Map(
		statsRows.filter((row) => row?.block_hash).map((row) => [row.block_hash, row])
	);

	const results = [];

	for (let i = 0; i < statsRows.length; i++) {
		const row = statsRows[i];
		const previous = await resolvePreviousBlockRow(row, hashIndex, mod, toStatsRow);
		const deltas = {};

		for (let j = 0; j < ACCOUNTING_DELTA_FIELDS.length; j++) {
			const field = ACCOUNTING_DELTA_FIELDS[j];
			deltas[field.key] = computeFieldDelta(row, previous, field.key);
		}

		deltas[DELTA_TOTAL_FIELD.key] = computeTotalDelta(deltas);

		results.push({
			block_id: row?.block_id,
			block_hash: row?.block_hash,
			deltas,
		});
	}

	return results;
}

function formatDeltaTone(nolanDelta) {
	if (nolanDelta === null || nolanDelta === undefined) {
		return 'muted';
	}
	if (nolanDelta === 0n) {
		return 'zero';
	}
	if (nolanDelta > 0n) {
		return 'positive';
	}
	return 'negative';
}

module.exports = {
	ACCOUNTING_DELTA_FIELDS,
	DELTA_TOTAL_FIELD,
	DELTA_SECTION_ROWS,
	toBigInt,
	resolvePreviousBlockRow,
	computeFieldDelta,
	computeTotalDelta,
	computeAccountingDeltas,
	formatDeltaTone,
};
