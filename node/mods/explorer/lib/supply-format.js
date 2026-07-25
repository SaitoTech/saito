const { splitSupplyTableRows } = require('./supply-rows');
const {
  NET_FLOW_SECTION_TITLE,
  NET_FLOW_SECTION_ROWS,
  computeNetFlows,
  formatNetFlowTone
} = require('./supply-deltas');
const {
  EXPLORER_INTEGER_ONLY_KEYS,
  formatExplorerInteger,
  formatNolanAsExplorerCurrency
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

function formatNetFlowCell(nolanValue, options = {}) {
  const isTotal = Boolean(options.isTotal);
  const tone = formatNetFlowTone(nolanValue, { isTotal });

  if (nolanValue === null || nolanValue === undefined) {
    return { text: '—', tone };
  }

  if (nolanValue === 0n) {
    return { text: '0', tone };
  }

  const sign = nolanValue > 0n ? '+' : '−';
  const magnitude = nolanValue < 0n ? -nolanValue : nolanValue;

  return {
    text: `${sign}${formatNolanAsExplorerCurrency(magnitude)}`,
    tone
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

function netFlowRowClassName(fieldKey, isTotal = false) {
  const classes = [
    'explorer-supply-row',
    'explorer-supply-net-flow-row',
    `explorer-supply-net-flow-row-${fieldKey}`
  ];

  if (isTotal) {
    classes.push('explorer-supply-net-flow-total-row');
  }

  return classes.join(' ');
}

function buildAccountingRow(row, statsRows) {
  return {
    key: row.key,
    label: row.label,
    className: accountingRowClassName(row),
    isNetFlow: false,
    values: statsRows.map((column) =>
      formatSupplyCell(column?.[row.key], row.key, { displayUnknown: row.displayUnknown })
    )
  };
}

function buildSectionDivider(key) {
  return {
    key,
    isSectionDivider: true
  };
}

function buildSectionTitle(label) {
  return {
    key: 'net_flow_section_title',
    isSectionTitle: true,
    label
  };
}

function buildNetFlowSectionRows(blockFlows = []) {
  const rows = [
    buildSectionDivider('net_flow_section_start'),
    buildSectionTitle(NET_FLOW_SECTION_TITLE)
  ];

  for (let i = 0; i < NET_FLOW_SECTION_ROWS.length; i++) {
    const field = NET_FLOW_SECTION_ROWS[i];
    const isTotal = field.key === 'total';

    rows.push({
      key: `net_flow_${field.key}`,
      label: field.label,
      className: netFlowRowClassName(field.key, isTotal),
      isNetFlow: true,
      isTotal,
      section: 'net-flow',
      values: blockFlows.map((entry) => formatNetFlowCell(entry.flows?.[field.key], { isTotal }))
    });
  }

  rows.push(buildSectionDivider('net_flow_section_end'));

  return rows;
}

function buildValueRows(tableRows, statsRows) {
  return tableRows.map((row) => buildAccountingRow(row, statsRows));
}

/**
 * Assemble the full supply table: reserve buckets, net-flow section, then trailing rows.
 */
async function formatSupplyTable(statsRows = [], options = {}) {
  const blockFlows = await computeNetFlows(statsRows, options);
  const { reserveRows, trailingRows } = splitSupplyTableRows();

  return [
    ...buildValueRows(reserveRows, statsRows),
    ...buildNetFlowSectionRows(blockFlows),
    ...buildValueRows(trailingRows, statsRows)
  ];
}

module.exports = {
  UTXO_UNKNOWN_DISPLAY,
  formatSupplyCell,
  formatSupplyTable,
  formatNetFlowCell,
  buildNetFlowSectionRows
};
