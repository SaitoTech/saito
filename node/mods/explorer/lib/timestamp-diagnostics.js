const { logManualProduction } = require('./manual-production-log');

function timestampDigitCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return String(value).replace(/^-/, '').length;
  }
  if (n === 0) {
    return 1;
  }
  return Math.floor(Math.log10(Math.abs(n))) + 1;
}

function inferTimestampUnits(digitCount) {
  if (digitCount <= 10) {
    return 'seconds (likely)';
  }
  if (digitCount === 11 || digitCount === 12) {
    return 'milliseconds (uncertain; 11-12 digits)';
  }
  if (digitCount === 13) {
    return 'milliseconds (likely)';
  }
  if (digitCount === 14 || digitCount === 15) {
    return 'microseconds (uncertain; 14-15 digits)';
  }
  if (digitCount === 16) {
    return 'microseconds (likely)';
  }
  if (digitCount >= 19) {
    return 'nanoseconds (likely)';
  }
  return `unknown (${digitCount} digits)`;
}

function toIsoStringSafe(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) {
    return 'invalid (non-finite)';
  }
  try {
    return new Date(n).toISOString();
  } catch (err) {
    return `invalid (${err?.message || err})`;
  }
}

function isTimestampMisordered(previous, current) {
  const prev = Number(previous);
  const curr = Number(current);
  return !Number.isFinite(prev) || !Number.isFinite(curr) || prev >= curr;
}

/**
 * Log raw values Explorer compares before previous >= current decisions.
 * Does not modify or compensate for either timestamp.
 */
function logExplorerTimestampComparison(previous, current, options = {}) {
  const prev = Number(previous);
  const curr = Number(current);
  const diffMs = prev - curr;
  const previousDigits = timestampDigitCount(prev);
  const currentDigits = timestampDigitCount(curr);
  const previousUnits = inferTimestampUnits(previousDigits);
  const currentUnits = inferTimestampUnits(currentDigits);
  const misordered = isTimestampMisordered(prev, curr);

  logManualProduction('----------------------------------------');
  if (options.source) {
    logManualProduction(`Timestamp comparison source: ${options.source}`);
  }
  if (options.retryNumber != null) {
    logManualProduction(`retry #${options.retryNumber}`);
  }
  logManualProduction('Previous block timestamp');
  logManualProduction(String(prev));
  logManualProduction(toIsoStringSafe(prev));
  logManualProduction(`latest.timestamp digits = ${previousDigits}`);
  logManualProduction(`latest.timestamp units = ${previousUnits}`);
  logManualProduction('');
  logManualProduction('Date.now()');
  logManualProduction(String(curr));
  logManualProduction(toIsoStringSafe(curr));
  logManualProduction(`Date.now() digits = ${currentDigits}`);
  logManualProduction(`Date.now() units = ${currentUnits}`);
  logManualProduction('');
  logManualProduction('Difference (previous - current)');
  logManualProduction(`${diffMs >= 0 ? '+' : ''}${diffMs} ms`);
  logManualProduction(`${diffMs >= 0 ? '+' : ''}${(diffMs / 1000).toFixed(3)} seconds`);
  logManualProduction(`previous >= current: ${misordered}`);
  logManualProduction('----------------------------------------');

  return {
    previous: prev,
    current: curr,
    diffMs,
    previousDigits,
    currentDigits,
    previousUnits,
    currentUnits,
    misordered
  };
}

function logClockMismatchDetected(diagnostic, context = {}) {
  logManualProduction('==================================================');
  logManualProduction('Explorer Manual Production');
  logManualProduction('CLOCK MISMATCH DETECTED');
  logManualProduction(`latest.timestamp: ${diagnostic.previous}`);
  logManualProduction(`Date.now(): ${diagnostic.current}`);
  logManualProduction(
    `Difference: ${diagnostic.diffMs >= 0 ? '+' : ''}${diagnostic.diffMs} ms ` +
      `(${diagnostic.diffMs >= 0 ? '+' : ''}${(diagnostic.diffMs / 1000).toFixed(3)} s)`
  );
  logManualProduction(
    `Timestamp units: latest=${diagnostic.previousUnits}, Date.now()=${diagnostic.currentUnits}`
  );
  logManualProduction(`Current block height: ${context.blockHeight ?? 'unknown'}`);
  logManualProduction(`Current heartbeat: ${context.heartbeatMs ?? 'unknown'} ms`);
  logManualProduction(
    `Consecutive misordered iterations: ${context.consecutiveCount ?? 'unknown'}`
  );
  logManualProduction('==================================================');
}

/**
 * Fresh read each call — no caching of block timestamp or Date.now().
 */
async function fetchFreshTimestampPair(app) {
  const now = Date.now();
  const blocks = await app.core.blockchain.getBlocks(1, false);
  const latest = Array.isArray(blocks) && blocks.length ? blocks[0] : null;
  const previousBlockTs = latest ? Number(latest.timestamp) : 0;

  return {
    now,
    previousBlockTs,
    latestBlockId: latest ? Number(latest.id) : null
  };
}

module.exports = {
  timestampDigitCount,
  inferTimestampUnits,
  isTimestampMisordered,
  logExplorerTimestampComparison,
  logClockMismatchDetected,
  fetchFreshTimestampPair
};
