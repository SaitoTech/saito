const { splitSupplyTableRows } = require('./supply-rows');
const { DELTA_SECTION_ROWS, computeAccountingDeltas, formatDeltaTone } = require('./supply-deltas');
const {
	EXPLORER_INTEGER_ONLY_KEYS,
	formatExplorerInteger,
	formatNolanAsExplorerCurrency,
} = require('./explorer-format');

const UTXO_UNKNOWN_DISPLAY = '?';

function formatSupplyCell(value, key = '', options = {}) {
	if (options.displayUnknown || key === 'utxo') {
		return UTXO_UNKNOWN_DISPLAY;
	}

	if (EXPLORER_INTEGER_ONLY_KEYS.has(key)) {
		return formatExplorerInteger(value);
	}

	return formatNolanAsExplorerCurrency(value);
}

function formatDeltaCell(nolanDelta) {
	const tone = formatDeltaTone(nolanDelta);

	if (nolanDelta === null || nolanDelta === undefined) {
		return { text: '—', tone };
	}

	if (nolanDelta === 0n) {
		return { text: '0', tone };
	}

	const sign = nolanDelta > 0n ? '+' : '−';
	const magnitude = nolanDelta < 0n ? -nolanDelta : nolanDelta;

	return {
		text: `${sign}${formatNolanAsExplorerCurrency(magnitude)}`,
		tone,
	};
}

function accountingRowClassName(row) {
	const classes = ['explorer-supply-row', `explorer-supply-row-${row.key}`];

	if (row.section === 'supply') {
		classes.push('explorer-supply-highlight');
	}
	if (row.section === 'supply-total') {
		classes.push('explorer-supply-invariant-row', 'explorer-supply-total-row');
	}
	if (row.section === 'payout') {
		classes.push('explorer-payout-highlight');
	}
	return classes.join(' ');
}

function deltaRowClassName(fieldKey) {
	return [
		'explorer-supply-row',
		'explorer-supply-delta-row',
		'explorer-supply-delta-section-row',
		`explorer-supply-delta-row-${fieldKey}`,
	].join(' ');
}

function buildAccountingRow(row, statsRows) {
	return {
		key: row.key,
		label: row.label,
		className: accountingRowClassName(row),
		isDelta: false,
		values: statsRows.map((column) =>
			formatSupplyCell(column?.[row.key], row.key, { displayUnknown: row.displayUnknown })
		),
	};
}

function buildSectionDivider(key) {
	return {
		key,
		isSectionDivider: true,
	};
}

function buildDeltaSectionRows(blockDeltas = []) {
	const rows = [buildSectionDivider('delta_section_start')];

	for (let i = 0; i < DELTA_SECTION_ROWS.length; i++) {
		const field = DELTA_SECTION_ROWS[i];
		rows.push({
			key: `delta_${field.key}`,
			label: field.label,
			className: deltaRowClassName(field.key),
			isDelta: true,
			section: 'delta',
			values: blockDeltas.map((entry) => formatDeltaCell(entry.deltas[field.key])),
		});
	}

	rows.push(buildSectionDivider('delta_section_end'));

	return rows;
}

function buildValueRows(tableRows, statsRows) {
	return tableRows.map((row) => buildAccountingRow(row, statsRows));
}

/**
 * Assemble the full supply table: reserve buckets, grouped delta section, then trailing rows.
 */
async function formatSupplyTable(statsRows = [], options = {}) {
	const blockDeltas = await computeAccountingDeltas(statsRows, options);
	const { reserveRows, trailingRows } = splitSupplyTableRows();

	return [
		...buildValueRows(reserveRows, statsRows),
		...buildDeltaSectionRows(blockDeltas),
		...buildValueRows(trailingRows, statsRows),
	];
}

module.exports = {
	UTXO_UNKNOWN_DISPLAY,
	formatSupplyCell,
	formatSupplyTable,
	formatDeltaCell,
	buildDeltaSectionRows,
};
