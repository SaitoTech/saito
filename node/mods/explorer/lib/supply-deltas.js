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

/** Sum of per-block routing, mining, and ATR payout changes (block-to-block). */
const DELTA_PAYOUTS_FIELD = { key: 'payouts', label: 'Δ Payouts' };

const PAYOUT_DELTA_SOURCES = [
	'total_payout_routing',
	'total_payout_mining',
	'total_payout_atr',
];

/** Reconciliation row — sum of bucket deltas and payout delta at render time. */
const DELTA_TOTAL_FIELD = { key: 'total', label: 'Δ TOTAL' };

/**
 * Ordered rows for the dedicated delta section.
 * Extend ACCOUNTING_DELTA_FIELDS to add more bucket deltas; payouts and total follow.
 */
const DELTA_SECTION_ROWS = [...ACCOUNTING_DELTA_FIELDS, DELTA_PAYOUTS_FIELD, DELTA_TOTAL_FIELD];

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
 * Compute the combined delta for routing, mining, and ATR payouts between two blocks.
 */
function computePayoutsDelta(currentRow, previousRow) {
	if (!currentRow || !previousRow) {
		return null;
	}

	let total = 0n;
	for (let i = 0; i < PAYOUT_DELTA_SOURCES.length; i++) {
		const key = PAYOUT_DELTA_SOURCES[i];
		total += toBigInt(currentRow[key]) - toBigInt(previousRow[key]);
	}

	return total;
}

/**
 * Sum bucket deltas and payout delta. Returns null when any component is unavailable.
 */
function computeTotalDelta(bucketDeltas = {}) {
	let total = 0n;
	const keys = [
		...ACCOUNTING_DELTA_FIELDS.map((field) => field.key),
		DELTA_PAYOUTS_FIELD.key,
	];

	for (let i = 0; i < keys.length; i++) {
		const key = keys[i];
		const delta = bucketDeltas[key];

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

		deltas[DELTA_PAYOUTS_FIELD.key] = computePayoutsDelta(row, previous);
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
	DELTA_PAYOUTS_FIELD,
	DELTA_TOTAL_FIELD,
	DELTA_SECTION_ROWS,
	PAYOUT_DELTA_SOURCES,
	toBigInt,
	resolvePreviousBlockRow,
	computeFieldDelta,
	computePayoutsDelta,
	computeTotalDelta,
	computeAccountingDeltas,
	formatDeltaTone,
};
