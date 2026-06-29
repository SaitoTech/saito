const { SUPPLY_TABLE_ROWS } = require('./supply-rows');

function formatSupplyCell(value) {
	if (value == null || value === '') {
		return '—';
	}

	try {
		return BigInt(value).toLocaleString();
	} catch (err) {
		return String(value);
	}
}

function rowClassName(row) {
	const classes = ['explorer-supply-row', `explorer-supply-row-${row.key}`];
	if (row.section === 'supply') {
		classes.push('explorer-supply-highlight');
	}
	if (row.section === 'supply-total') {
		classes.push('explorer-supply-highlight', 'explorer-supply-total-row');
	}
	if (row.section === 'payout') {
		classes.push('explorer-payout-highlight');
	}
	return classes.join(' ');
}

function formatSupplyTable(app, columns = []) {
	return SUPPLY_TABLE_ROWS.map((row) => ({
		key: row.key,
		label: row.label,
		className: rowClassName(row),
		values: columns.map((column) => formatSupplyCell(column?.[row.key])),
	}));
}

function formatLatestSupplySummary(columns = []) {
	const latest = columns[0];
	if (!latest) {
		return null;
	}

	return {
		totalSupply: formatSupplyCell(latest.total_supply),
		utxo: formatSupplyCell(latest.utxo),
		treasury: formatSupplyCell(latest.treasury),
		graveyard: formatSupplyCell(latest.graveyard),
		blockId: latest.block_id != null ? String(latest.block_id) : '—',
	};
}

module.exports = {
	formatSupplyCell,
	formatSupplyTable,
	formatLatestSupplySummary,
};
