const SUPPLY_BLOCK_COUNT = 8;

const SUPPLY_TABLE_ROWS = [
	{ key: 'total_supply', label: 'TOTAL SUPPLY', section: 'supply-total' },
	{ key: 'treasury', label: 'treasury', section: 'supply' },
	{ key: 'graveyard', label: 'graveyard', section: 'supply' },
	{ key: 'previous_block_unpaid', label: 'Old Fees', section: 'supply' },
	{ key: 'total_fees', label: 'New Fees', section: 'supply' },
	{ key: 'utxo', label: 'utxo', section: 'supply', displayUnknown: true },
	{ key: 'total_payout_routing', label: 'total_payout_routing', section: 'payout' },
	{ key: 'total_payout_mining', label: 'total_payout_mining', section: 'payout' },
	{ key: 'total_payout_treasury', label: 'total_payout_treasury', section: 'payout' },
	{ key: 'total_payout_graveyard', label: 'total_payout_graveyard', section: 'payout' },
	{ key: 'total_payout_atr', label: 'total_payout_atr', section: 'payout' },
	{ key: 'total_fees_new', label: 'total_fees_new', section: 'metric' },
	{ key: 'total_fees_atr', label: 'total_fees_atr', section: 'metric' },
	{ key: 'total_fees_cumulative', label: 'total_fees_cumulative', section: 'metric' },
	{ key: 'fee_per_byte', label: 'fee_per_byte', section: 'metric' },
	{ key: 'burn_fee', label: 'burn_fee', section: 'metric' },
	{ key: 'difficulty', label: 'difficulty', section: 'metric' },
];

/** Insert the delta section immediately after this reserve-bucket row. */
const SUPPLY_DELTA_SECTION_AFTER_KEY = 'utxo';

function splitSupplyTableRows() {
	const splitIndex = SUPPLY_TABLE_ROWS.findIndex((row) => row.key === SUPPLY_DELTA_SECTION_AFTER_KEY);
	if (splitIndex < 0) {
		return { reserveRows: SUPPLY_TABLE_ROWS, trailingRows: [] };
	}

	return {
		reserveRows: SUPPLY_TABLE_ROWS.slice(0, splitIndex + 1),
		trailingRows: SUPPLY_TABLE_ROWS.slice(splitIndex + 1),
	};
}

module.exports = {
	SUPPLY_BLOCK_COUNT,
	SUPPLY_TABLE_ROWS,
	SUPPLY_DELTA_SECTION_AFTER_KEY,
	splitSupplyTableRows,
};
