const { truncateHash, formatSaito, displayName, isAnonymousUsername } = require('./explorer-format');

const RECIPIENT_LABELS = {
	0: 'self',
	1: 'external',
	2: 'script',
};

function formatAddressDelta(delta) {
	if (delta == null || delta === '') {
		return '—';
	}

	try {
		const value = BigInt(delta);
		const formatted = value.toLocaleString();
		if (value > 0n) {
			return `+${formatted}`;
		}
		return formatted;
	} catch (err) {
		return String(delta);
	}
}

function formatAddressDeltaSaito(delta) {
	if (delta == null || delta === '') {
		return '—';
	}

	try {
		const value = BigInt(delta);
		const formatted = formatSaito(value);
		if (value > 0n) {
			return `+${formatted}`;
		}
		return formatted;
	} catch (err) {
		return String(delta);
	}
}

function formatRecipientLabel(recipient) {
	const key = Number(recipient);
	return RECIPIENT_LABELS[key] || String(recipient ?? '—');
}

function formatAddressActivityRows(app, rows = []) {
	return rows.map((row) => ({
		blockId: row.block_id != null ? String(row.block_id) : '—',
		blockHash: row.block_hash || '',
		txHash: row.tx_hash || '',
		txHashDisplay: truncateHash(row.tx_hash || '', 8, 8),
		delta: formatAddressDelta(row.delta),
		deltaSaito: formatAddressDeltaSaito(row.delta),
		recipient: formatRecipientLabel(row.recipient),
		isLongestChain: Number(row.is_longest_chain) === 1,
	}));
}

function formatAddressSummary(app, publicKey, rows = []) {
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
		netDelta: formatAddressDelta(netDelta),
		netDeltaSaito: formatAddressDeltaSaito(netDelta),
	};
}

module.exports = {
	formatAddressActivityRows,
	formatAddressSummary,
	formatAddressDelta,
	formatAddressDeltaSaito,
	formatRecipientLabel,
};
