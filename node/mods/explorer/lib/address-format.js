const {
  truncateHash,
  formatSaito,
  displayName,
  isAnonymousUsername
} = require('./explorer-format');

const RECIPIENT_LABELS = {
  0: 'self',
  1: 'external',
  2: 'script'
};

function formatDeltaSaito(delta) {
  if (delta == null || delta === '') {
    return '—';
  }

  try {
    const value = BigInt(delta);
    const formatted = formatSaito(value > 0n ? value : -value);
    if (value > 0n) {
      return `+${formatted}`;
    }
    if (value < 0n) {
      return `−${formatted}`;
    }
    return formatted;
  } catch (err) {
    return String(delta);
  }
}

function formatBalanceSaito(nolan) {
  if (nolan == null) {
    return '—';
  }
  try {
    return formatSaito(BigInt(nolan));
  } catch (err) {
    return '—';
  }
}

function formatRecipientLabel(recipient) {
  const key = Number(recipient);
  return RECIPIENT_LABELS[key] || String(recipient ?? '—');
}

function deltaSignClass(delta) {
  try {
    const v = BigInt(delta ?? 0);
    if (v > 0n) return 'explorer-address-delta-positive';
    if (v < 0n) return 'explorer-address-delta-negative';
  } catch (err) {
    // ignore
  }
  return '';
}

function formatAddressActivityRows(app, rows = [], currentBalanceNolan = null) {
  const chronological = rows.slice().reverse();

  let runningBalance = null;
  if (currentBalanceNolan != null) {
    try {
      let total = BigInt(currentBalanceNolan);
      for (let i = rows.length - 1; i >= 0; i--) {
        total -= BigInt(rows[i]?.delta ?? 0);
      }
      runningBalance = total;
    } catch (err) {
      runningBalance = null;
    }
  }

  const formatted = [];
  for (let i = 0; i < chronological.length; i++) {
    const row = chronological[i];
    const delta = row.delta;

    if (runningBalance != null) {
      try {
        runningBalance += BigInt(delta ?? 0);
      } catch (err) {
        // keep previous balance
      }
    }

    formatted.push({
      blockId: row.block_id != null ? String(row.block_id) : '—',
      blockHash: row.block_hash || '',
      txHash: row.tx_hash || '',
      txHashDisplay: truncateHash(row.tx_hash || '', 8, 8),
      deltaSaito: formatDeltaSaito(delta),
      deltaClass: deltaSignClass(delta),
      recipient: formatRecipientLabel(row.recipient),
      balance: runningBalance != null ? formatBalanceSaito(runningBalance) : null,
      isLongestChain: Number(row.is_longest_chain) === 1
    });
  }

  formatted.reverse();
  return formatted;
}

function formatAddressSummary(app, publicKey, rows = [], currentBalanceNolan = null) {
  let netDelta = 0n;
  for (let i = 0; i < rows.length; i++) {
    try {
      netDelta += BigInt(rows[i]?.delta ?? 0);
    } catch (err) {
      // skip malformed rows
    }
  }

  const key = String(publicKey || '').trim();
  const username = app.keychain.returnUsername(key);
  const hasUsername = !isAnonymousUsername(username, key);

  return {
    publicKeyLabel: hasUsername ? username : displayName(app, key),
    publicKeyFull: key,
    hasUsername,
    entryCount: rows.length,
    currentBalance: currentBalanceNolan != null ? formatBalanceSaito(currentBalanceNolan) : null,
    netDeltaSaito: formatDeltaSaito(netDelta)
  };
}

module.exports = {
  formatAddressActivityRows,
  formatAddressSummary,
  formatDeltaSaito,
  formatBalanceSaito,
  formatRecipientLabel,
  deltaSignClass
};
