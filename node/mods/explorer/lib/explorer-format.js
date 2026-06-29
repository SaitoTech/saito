const NOLAN_PER_SAITO = 100000000n;
const {
	formatTransactionTypeName,
	formatSlipTypeName,
} = require('./transaction-types');
const { renderJsonTree } = require('./ui/tx/json-tree');

function esc(app, value) {
	return app.browser.escapeHTML(String(value ?? ''));
}

function decodeTxMsg(tx) {
	if (tx?.msg && typeof tx.msg === 'object' && Object.keys(tx.msg).length > 0) {
		return tx.msg;
	}

	const buffer = tx?.buffer;
	if (!buffer) {
		return null;
	}

	try {
		let decoded = '';
		if (typeof buffer === 'string') {
			if (typeof atob === 'function') {
				decoded = atob(buffer);
			} else if (typeof Buffer !== 'undefined') {
				decoded = Buffer.from(buffer, 'base64').toString('utf-8');
			}
		}
		if (!decoded) {
			return null;
		}
		return JSON.parse(decoded);
	} catch (err) {
		return null;
	}
}

function formatTxMsgPreview(app, msg) {
	if (msg == null) {
		return null;
	}
	try {
		const text = typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2);
		return esc(app, text);
	} catch (err) {
		return esc(app, String(msg));
	}
}

function formatPublicKeyDisplay(app, publicKey) {
	const key = String(publicKey || '').trim();
	if (!key) {
		return '—';
	}
	const username = displayName(app, key);
	const truncated = truncateHash(key, 8, 8);
	if (username && username !== key && username !== '—') {
		return esc(app, `${username} (${truncated})`);
	}
	return esc(app, truncated);
}

function buildPublicKeyLink(app, publicKey, label = null) {
	const key = String(publicKey || '').trim();
	if (!key) {
		return '—';
	}

	const inner = label != null ? esc(app, label) : formatPublicKeyDisplay(app, key);
	const href = `/explorer/address/${encodeURIComponent(key)}`;

	return `<a href="${href}" class="explorer-link explorer-pubkey-link" data-public-key="${esc(app, key)}">${inner}</a>`;
}

function formatAbsoluteTime(timestamp) {
	const ts = Number(timestamp);
	if (!Number.isFinite(ts) || ts <= 0) {
		return '';
	}
	const ms = ts > 1e12 ? ts : ts * 1000;
	try {
		return new Date(ms).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
	} catch (err) {
		return '';
	}
}

function formatOptionalSaito(app, nolan) {
	if (nolan == null || nolan === '') {
		return '—';
	}
	return esc(app, formatSaito(nolan));
}

function formatOptionalBigInt(app, value) {
	if (value == null || value === '') {
		return '—';
	}
	try {
		return esc(app, String(value));
	} catch (err) {
		return '—';
	}
}

function enrichBlockFromWrapper(block, parsed) {
	if (!block || typeof block.toJson !== 'function' || !parsed) {
		return parsed;
	}

	const fieldMap = [
		['total_fees', 'totalFees'],
		['total_fees_cumulative', 'totalFeesCumulative'],
		['burnfee', 'burnFee'],
		['total_work', 'totalWork'],
		['total_payout_routing', 'totalPayoutRouting'],
		['total_payout_treasury', 'totalPayoutTreasury'],
		['total_payout_mining', 'totalPayoutMining'],
		['total_payout_graveyard', 'totalPayoutGraveyard'],
		['total_payout_atr', 'totalPayoutAtr'],
		['fee_per_byte', 'feePerByte'],
		['avg_fee_per_byte', 'avgFeePerByte'],
		['in_longest_chain', 'inLongestChain'],
		['has_golden_ticket', 'hasGoldenTicket'],
		['has_fee_transaction', 'hasFeeTransaction'],
		['difficulty', 'difficulty'],
	];

	for (let i = 0; i < fieldMap.length; i++) {
		const [key, getter] = fieldMap[i];
		try {
			if (block[getter] != null) {
				const val = block[getter];
				parsed[key] = typeof val === 'bigint' ? val.toString() : val;
			}
		} catch (err) {
			// ignore missing getters
		}
	}

	try {
		if (typeof block.serialize === 'function') {
			const bytes = block.serialize();
			parsed.block_size = bytes?.byteLength ?? bytes?.length ?? null;
		}
	} catch (err) {
		// ignore
	}

	return parsed;
}

function truncateHash(hash, head = 10, tail = 8) {
	if (!hash || typeof hash !== 'string') {
		return '';
	}
	if (hash.length <= head + tail + 3) {
		return hash;
	}
	return `${hash.slice(0, head)}...${hash.slice(-tail)}`;
}

function formatSaito(nolan) {
	try {
		const amount = BigInt(nolan ?? 0);
		const whole = amount / NOLAN_PER_SAITO;
		const frac = amount % NOLAN_PER_SAITO;
		if (frac === 0n) {
			return `${whole} SAITO`;
		}
		let fracStr = frac.toString().padStart(8, '0').replace(/0+$/, '');
		return `${whole}.${fracStr} SAITO`;
	} catch (err) {
		return '0 SAITO';
	}
}

function formatTimeAgo(app, timestamp) {
	const ts = Number(timestamp);
	if (!Number.isFinite(ts) || ts <= 0) {
		return '';
	}
	const seconds = ts > 1e12 ? Math.floor(ts / 1000) : ts;
	return app.browser.formatTimeDifference(seconds);
}

function displayName(app, publicKey) {
	if (!publicKey) {
		return '—';
	}
	return app.keychain.returnUsername(String(publicKey));
}

function slipAmount(slip) {
	if (slip == null) {
		return 0n;
	}
	try {
		return BigInt(slip.amount ?? 0);
	} catch (err) {
		return 0n;
	}
}

function txTotalToAmount(tx) {
	const toSlips = tx?.to || [];
	let total = 0n;
	for (let i = 0; i < toSlips.length; i++) {
		total += slipAmount(toSlips[i]);
	}
	return total;
}

function txPrimaryFrom(tx) {
	const fromSlips = tx?.from || [];
	if (!fromSlips.length) {
		return '';
	}
	return fromSlips[0]?.publicKey || '';
}

function txPrimaryTo(tx) {
	const toSlips = tx?.to || [];
	if (!toSlips.length) {
		return '';
	}
	return toSlips[0]?.publicKey || '';
}

function formatBlocksForTeaser(app, blocks = []) {
	return blocks.filter(Boolean).map((block) => {
		const txCount = Array.isArray(block.transactions) ? block.transactions.length : null;
		return {
			number: esc(app, block.id ?? ''),
			hash: esc(app, block.hash || ''),
			hashRaw: block.hash || '',
			time: esc(app, formatTimeAgo(app, block.timestamp)),
			miner: buildPublicKeyLink(app, block.creator),
			txns: txCount === null ? '…' : esc(app, String(txCount)),
			duration: '—',
			reward: block.total_fees != null ? esc(app, formatSaito(block.total_fees)) : '—',
		};
	});
}

function extractTransactionsFromBlocks(blocks = []) {
	const txs = [];
	for (let i = 0; i < blocks.length; i++) {
		const block = blocks[i];
		if (!block?.transactions?.length) {
			continue;
		}
		for (let j = 0; j < block.transactions.length; j++) {
			const tx = block.transactions[j];
			txs.push({
				...tx,
				block_hash: block.hash,
				block_timestamp: block.timestamp,
				block_id: block.id,
			});
		}
	}
	txs.sort((a, b) => {
		const ta = Number(a.timestamp ?? a.block_timestamp ?? 0);
		const tb = Number(b.timestamp ?? b.block_timestamp ?? 0);
		return tb - ta;
	});
	return txs;
}

function formatTransactionsForTeaser(app, transactions = [], limit = 10) {
	return transactions.slice(0, limit).map((tx) => ({
		hash: esc(app, truncateHash(tx.signature || tx.hash || '')),
		signature: esc(app, tx.signature || tx.hash || ''),
		blockHash: esc(app, tx.block_hash || ''),
		blockId: esc(app, tx.block_id != null ? String(tx.block_id) : ''),
		time: esc(app, formatTimeAgo(app, tx.timestamp ?? tx.block_timestamp)),
		from: buildPublicKeyLink(app, txPrimaryFrom(tx)),
		to: buildPublicKeyLink(app, txPrimaryTo(tx)),
		amount: esc(app, formatSaito(txTotalToAmount(tx))),
	}));
}

function slipDisplay(app, slip) {
	const slipType = slip?.type ?? slip?.slip_type;
	const rawKey = slip?.publicKey || slip?.public_key || '';
	return {
		publicKey: buildPublicKeyLink(app, rawKey),
		publicKeyRaw: esc(app, rawKey),
		amount: esc(app, formatSaito(slipAmount(slip))),
		slipType: esc(app, formatSlipTypeName(slipType)),
	};
}

function formatTransactionForBlockPage(app, tx, index = 0) {
	const signature = tx?.signature || tx?.hash || '';
	const txType = tx?.type ?? tx?.transaction_type;
	const txMsg = decodeTxMsg(tx);
	const fromSlips = Array.isArray(tx?.from) ? tx.from : [];
	const toSlips = Array.isArray(tx?.to) ? tx.to : [];
	const timeRelative = formatTimeAgo(app, tx?.timestamp);
	const timeAbsolute = formatAbsoluteTime(tx?.timestamp);
	const inputCount = fromSlips.length;
	const outputCount = toSlips.length;

	return {
		index,
		hash: esc(app, truncateHash(signature, 8, 8)),
		hashFull: esc(app, signature),
		signatureRaw: esc(app, signature),
		signatureFull: esc(app, signature),
		txId: esc(app, String(index + 1)),
		time: esc(app, timeRelative),
		timeAbsolute: esc(app, timeAbsolute),
		timeFull: esc(app, timeAbsolute ? `${timeRelative} · ${timeAbsolute}` : timeRelative),
		inputs: esc(app, inputCount ? `${inputCount} input${inputCount === 1 ? '' : 's'}` : '0 inputs'),
		outputs: esc(app, outputCount ? `${outputCount} output${outputCount === 1 ? '' : 's'}` : '0 outputs'),
		ioSummary: esc(
			app,
			`${inputCount} input${inputCount === 1 ? '' : 's'} · ${outputCount} output${outputCount === 1 ? '' : 's'}`
		),
		fee: esc(app, formatSaito(tx?.total_fees ?? 0)),
		type: esc(app, formatTransactionTypeName(txType)),
		typeRaw: esc(app, String(txType ?? '')),
		fees: esc(app, formatSaito(tx?.total_fees ?? 0)),
		fromSlips: fromSlips.map((slip) => slipDisplay(app, slip)),
		toSlips: toSlips.map((slip) => slipDisplay(app, slip)),
		hasTxMsg: txMsg != null,
		txMsgHtml: txMsg != null ? renderJsonTree(app, txMsg) : null,
	};
}

function formatBlockType(block) {
	let blockType = block?.type;
	if (typeof blockType === 'string') {
		try {
			blockType = JSON.parse(blockType);
		} catch (err) {
			// keep string
		}
	}
	if (blockType == null || blockType === '') {
		return '—';
	}
	return String(blockType).replace(/"/g, '');
}

function formatBlockSummaryRows(app, block, txCount = 0) {
	const rows = [];
	const add = (label, value, opts = {}) => {
		rows.push({
			label: esc(app, label),
			value: value == null || value === '' ? '—' : value,
			...opts,
		});
	};

	const relativeTime = formatTimeAgo(app, block.timestamp);
	const absoluteTime = formatAbsoluteTime(block.timestamp);
	const timestampDisplay =
		relativeTime && absoluteTime
			? esc(app, `${relativeTime} (${absoluteTime})`)
			: esc(app, relativeTime || absoluteTime || '—');

	add('Block height', esc(app, String(block.id ?? '—')), { numeric: true });
	add('Previous hash', esc(app, truncateHash(block.previous_block_hash || '', 12, 10)), {
		mono: true,
		hashLink: true,
		full: esc(app, block.previous_block_hash || ''),
	});
	add(
		'Status',
		esc(app, block.in_longest_chain === false ? 'Unconfirmed' : 'Finalized')
	);
	add('Timestamp', timestampDisplay);
	add('Miner', buildPublicKeyLink(app, block.creator), { html: true });
	add('Transactions', esc(app, String(txCount)), { numeric: true });
	add('Block type', esc(app, formatBlockType(block)));
	add('Burn fee', formatOptionalSaito(app, block.burnfee));
	add('Total fees', formatOptionalSaito(app, block.total_fees));
	add('Cumulative fees', formatOptionalSaito(app, block.total_fees_cumulative));
	add('Routing work', formatOptionalSaito(app, block.total_work));
	add('Routing payout', formatOptionalSaito(app, block.total_payout_routing));
	add('Treasury payout', formatOptionalSaito(app, block.total_payout_treasury));
	add('Mining payout', formatOptionalSaito(app, block.total_payout_mining));
	add('Graveyard payout', formatOptionalSaito(app, block.total_payout_graveyard));
	add('ATR payout', formatOptionalSaito(app, block.total_payout_atr));
	add('Treasury balance', formatOptionalSaito(app, block.treasury));
	add('Graveyard balance', formatOptionalSaito(app, block.graveyard));
	add('Fee per byte', formatOptionalSaito(app, block.fee_per_byte));
	add('Avg fee per byte', formatOptionalSaito(app, block.avg_fee_per_byte));
	add('Block size', block.block_size != null ? esc(app, `${block.block_size} bytes`) : '—', {
		numeric: true,
	});
	add('Golden ticket', esc(app, block.has_golden_ticket ? 'Yes' : 'No'));
	add('Fee transaction', esc(app, block.has_fee_transaction ? 'Yes' : 'No'));
	add('Difficulty', formatOptionalBigInt(app, block.difficulty));

	return rows;
}

function formatTransactionsForBlockPage(app, transactions = []) {
	return transactions.filter(Boolean).map((tx, index) => formatTransactionForBlockPage(app, tx, index));
}

function normalizeBlockRecord(block) {
	if (!block) {
		return null;
	}
	if (typeof block.toJson === 'function') {
		try {
			const parsed = JSON.parse(block.toJson());
			if (Array.isArray(block.transactions) && block.transactions.length) {
				parsed.transactions = block.transactions.map((tx) => {
					if (typeof tx?.toJson === 'function') {
						const txjson = tx.toJson();
						if (typeof tx?.returnMessage === 'function') {
							txjson.msg = tx.returnMessage();
						}
						return txjson;
					}
					return tx;
				});
			}
			return enrichBlockFromWrapper(block, parsed);
		} catch (err) {
			return block;
		}
	}
	return block;
}

function normalizeBlockTransactions(block) {
	if (!block || !Array.isArray(block.transactions)) {
		return block;
	}

	block.transactions = block.transactions.filter(Boolean);
	return block;
}

function formatBlockForPage(app, rawBlock, txFormatter = formatTransactionsForBlockPage) {
	const block = normalizeBlockTransactions(normalizeBlockRecord(rawBlock));
	if (!block) {
		return null;
	}

	const transactions = Array.isArray(block.transactions) ? block.transactions : [];

	return {
		number: esc(app, String(block.id ?? '')),
		hashDisplay: esc(app, block.hash || ''),
		summaryRows: formatBlockSummaryRows(app, block, transactions.length),
		transactions: txFormatter(app, transactions),
	};
}

function mergeBlockByHash(blocks, enrichedBlock) {
	if (!enrichedBlock?.hash) {
		return blocks;
	}
	const next = blocks.slice();
	for (let i = 0; i < next.length; i++) {
		if (next[i]?.hash === enrichedBlock.hash) {
			next[i] = { ...next[i], ...enrichedBlock };
			return next;
		}
	}
	return next;
}

module.exports = {
	truncateHash,
	formatSaito,
	formatTimeAgo,
	displayName,
	buildPublicKeyLink,
	formatPublicKeyDisplay,
	formatBlocksForTeaser,
	formatTransactionsForTeaser,
	formatBlockForPage,
	formatTransactionsForBlockPage,
	formatTransactionForBlockPage,
	extractTransactionsFromBlocks,
	mergeBlockByHash,
};
