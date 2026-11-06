function decimalParts(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    return null;
  }
  const [whole, fraction = ''] = raw.split('.');
  return { whole, fraction };
}

/**
 * Unit amount times a whole quantity, in decimal strings.
 * Same digit arithmetic as the payment-address quantity scaling.
 * A quantity of 0 is 0. An unparseable amount is empty.
 */
function multiplyDecimalAmount(amount, quantity) {
  const parts = decimalParts(amount);
  const qty = Math.floor(Number(quantity));
  if (!parts || !Number.isFinite(qty) || qty < 0) {
    return '';
  }
  if (qty === 0) {
    return '0';
  }
  const digits = `${parts.whole}${parts.fraction}`.replace(/^0+/, '') || '0';
  const product = (BigInt(digits) * BigInt(qty)).toString().padStart(parts.fraction.length + 1, '0');
  if (!parts.fraction.length) {
    return product.replace(/^0+(?=\d)/, '');
  }
  const cut = product.length - parts.fraction.length;
  const head = product.slice(0, cut).replace(/^0+(?=\d)/, '') || '0';
  const tail = product.slice(cut).replace(/0+$/, '');
  return tail ? `${head}.${tail}` : head;
}

function addDecimalAmounts(left, right) {
  const a = decimalParts(left);
  const b = decimalParts(right);
  if (!a) {
    return b ? String(right).trim() : '';
  }
  if (!b) {
    return String(left).trim();
  }
  const scale = Math.max(a.fraction.length, b.fraction.length);
  const leftInt = BigInt(a.whole + a.fraction.padEnd(scale, '0'));
  const rightInt = BigInt(b.whole + b.fraction.padEnd(scale, '0'));
  const sum = (leftInt + rightInt).toString().padStart(scale + 1, '0');
  if (!scale) {
    return sum.replace(/^0+(?=\d)/, '');
  }
  const cut = sum.length - scale;
  const head = sum.slice(0, cut).replace(/^0+(?=\d)/, '') || '0';
  const tail = sum.slice(cut).replace(/0+$/, '');
  return tail ? `${head}.${tail}` : head;
}

function web3SaleTicker(ticker = '') {
  const symbol = String(ticker || '').trim().toUpperCase();
  if (!symbol || symbol === 'SAITO') {
    return '';
  }
  return symbol;
}

function decimalIsPositive(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    return false;
  }
  return /[1-9]/.test(raw);
}

/**
 * A canonical sale becomes eligible once `waitBlocks` Saito blocks have been
 * produced after its inclusion block. Anything else unprocessed stays pending.
 */
function classifyWeb3Proceeds(rows = [], latestBlockId, waitBlocks = 0) {
  const wait = Math.max(0, Math.floor(Number(waitBlocks) || 0));
  const latest = Number(latestBlockId);
  const pending = {};
  const eligible = {};

  for (const row of rows || []) {
    const ticker = web3SaleTicker(row?.web3_ticker);
    const earned = multiplyDecimalAmount(row?.web3_amount, row?.quantity_sold);
    if (!ticker || !decimalIsPositive(earned)) {
      continue;
    }
    const soldBlock = Number(row?.block_id_sold);
    const canonical = Number(row?.longest_chain_sold) === 1;
    const matured =
      canonical && Number.isFinite(latest) && soldBlock > 0 && latest >= soldBlock + wait;
    const bucket = matured ? eligible : pending;
    bucket[ticker] = addDecimalAmounts(bucket[ticker] || '0', earned);
  }

  return { pending, eligible };
}

module.exports = {
  multiplyDecimalAmount,
  addDecimalAmounts,
  web3SaleTicker,
  decimalIsPositive,
  classifyWeb3Proceeds
};
