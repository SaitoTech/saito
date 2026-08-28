const { formatNolanAsExplorerCurrency } = require('../../mods/explorer/lib/explorer-format');
const { formatSupplyCell } = require('../../mods/explorer/lib/supply-format');
const { SUPPLY_TABLE_ROWS } = require('../../mods/explorer/lib/supply-rows');
const SupplyTemplate = require('../../mods/explorer/lib/ui/supply.template');

describe('Explorer exact total-supply display', () => {
  test('does not include the accounting total row', () => {
    expect(SUPPLY_TABLE_ROWS.some((row) => row.label === 'ACCOUNTING TOTAL')).toBe(false);
  });

  test('formats whole SAITO totals without abbreviation', () => {
    const nolan = '21000000000000000';
    const largeNolan = '123456789012345600000000';

    expect(formatNolanAsExplorerCurrency(nolan)).toBe('210 million');
    expect(formatNolanAsExplorerCurrency(nolan, { abbreviate: false })).toBe('210,000,000');
    expect(formatSupplyCell(nolan, 'total_supply', { exactInteger: true })).toBe('210,000,000');
    expect(formatSupplyCell(largeNolan, 'calculated_total_supply', { exactInteger: true })).toBe(
      '1,234,567,890,123,456'
    );
  });

  test('renders compact and exact values with an accessible toggle', () => {
    const view = {
      hasData: true,
      columns: [{ blockId: '1', blockHash: 'abc', hasGoldenTicket: false }],
      rows: [
        {
          key: 'calculated_total_supply',
          label: 'CALCULATED TOTAL SUPPLY',
          className: 'explorer-supply-row explorer-supply-total-row',
          values: ['210 million'],
          exactValues: ['210,000,000']
        }
      ]
    };

    const compactHtml = SupplyTemplate(view);
    expect(compactHtml).toContain('data-supply-exact-toggle');
    expect(compactHtml).toContain('aria-pressed="false"');
    expect(compactHtml).toContain('data-supply-compact-value>210 million</span>');
    expect(compactHtml).toContain('data-supply-exact-value hidden>210,000,000</span>');

    const exactHtml = SupplyTemplate({ ...view, showExactSupplyIntegers: true });
    expect(exactHtml).toContain('aria-pressed="true"');
    expect(exactHtml).toContain('data-supply-compact-value hidden>210 million</span>');
    expect(exactHtml).toContain('data-supply-exact-value>210,000,000</span>');
  });
});
