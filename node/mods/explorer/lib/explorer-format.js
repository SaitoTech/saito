const NOLAN_PER_SAITO = 100000000n;
const {
	formatTransactionTypeName,
	formatSlipTypeName,
} = require('./transaction-types');
const { renderJsonTree } = require('./ui/tx/json-tree');
const { hasP2shUnlockTargets } = require('./tx-actions');

// TransactionType::SPV — the placeholder type a full node substitutes for
// transactions that are not relevant to a lite client when it generates a lite
// block. Their presence means we are looking at a reduced (SPV) copy of a block
// rather than the full block.
const SPV_TRANSACTION_TYPE = 5;

function isSpvTransaction(tx) {
	const type = tx?.type ?? tx?.transaction_type;
	if (type == null || type === '') {
		return false;
	}
	return Number(type) === SPV_TRANSACTION_TYPE || String(type) === 'SPV';
}

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

function isAnonymousUsername(name, publicKey) {
	if (!name || name === '—') {
		return true;
	}
	if (name === publicKey) {
		return true;
	}
	return String(name).startsWith('Anon-');
}

function displayName(app, publicKey, options = {}) {
	const key = String(publicKey || '').trim();
	if (!key) {
		return '—';
	}

	const username = app.keychain.returnUsername(key);
	if (!isAnonymousUsername(username, key)) {
		return username;
	}

	if (options.full) {
		return key;
	}

	return truncatePublicKey(key, 16);
}

function formatPublicKeyDisplay(app, publicKey, options = {}) {
	const key = String(publicKey || '').trim();
	if (!key) {
		return '—';
	}

	const username = app.keychain.returnUsername(key);
	if (!isAnonymousUsername(username, key)) {
		const truncated = truncatePublicKey(key, 16);
		return esc(app, `${username} (${truncated})`);
	}

	if (options.full) {
		return esc(app, key);
	}

	return esc(app, truncatePublicKey(key, 16));
}

function buildPublicKeyLink(app, publicKey, label = null, options = {}) {
	const key = String(publicKey || '').trim();
	if (!key) {
		return '—';
	}

	const inner = label != null ? esc(app, label) : formatPublicKeyDisplay(app, key, options);
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

function bytesToHex(bytes) {
	const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let hex = '';
	for (let i = 0; i < arr.length; i++) {
		hex += arr[i].toString(16).padStart(2, '0');
	}
	return hex;
}

function enrichBlockCryptoFromSerialize(block, parsed) {
	if (!parsed) {
		return parsed;
	}

	if (parsed.merkle_root && parsed.signature) {
		return parsed;
	}

	try {
		if (typeof block?.serialize !== 'function') {
			return parsed;
		}
		const bytes = block.serialize();
		const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
		if (u8.length < 181) {
			return parsed;
		}
		if (!parsed.merkle_root) {
			parsed.merkle_root = bytesToHex(u8.subarray(85, 117));
		}
		if (!parsed.signature) {
			parsed.signature = bytesToHex(u8.subarray(117, 181));
		}
	} catch (err) {
		// ignore missing crypto fields
	}

	return parsed;
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

	return enrichBlockCryptoFromSerialize(block, parsed);
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

// Public keys are never truncated in the middle: keep the leading characters and
// append an ellipsis from the right only, so the start of the key stays readable.
function truncatePublicKey(key, head = 16) {
	const value = String(key || '').trim();
	if (!value) {
		return '';
	}
	if (value.length <= head + 3) {
		return value;
	}
	return `${value.slice(0, head)}...`;
}

const SAITO_MILLION = 1_000_000n;
const SAITO_BILLION = 1_000_000_000n;

/** Protocol parameters and other non-monetary counters — never abbreviated. */
const EXPLORER_INTEGER_ONLY_KEYS = new Set(['burn_fee', 'difficulty']);

function formatExplorerInteger(value) {
	if (value == null || value === '') {
		return '—';
	}

	try {
		return BigInt(value).toLocaleString('en-US');
	} catch (err) {
		return String(value);
	}
}

function formatAbbreviatedQuotient(scaled) {
	const whole = scaled / 100n;
	const frac = scaled % 100n;

	if (frac === 0n) {
		return whole.toLocaleString('en-US');
	}

	if (frac % 10n === 0n) {
		return `${whole.toLocaleString('en-US')}.${(frac / 10n).toString()}`;
	}

	return `${whole.toLocaleString('en-US')}.${frac.toString().padStart(2, '0')}`;
}

function canAbbreviateWithTwoDecimals(value, unit) {
	return unit > 0n && (value * 100n) % unit === 0n;
}

/**
 * Format a whole-number SAITO amount for display.
 * Abbreviates to million/billion only when the quotient needs at most two decimal places.
 */
function formatMonetaryWhole(whole) {
	if (whole < SAITO_MILLION) {
		return whole.toLocaleString('en-US');
	}

	if (whole >= SAITO_BILLION) {
		if (canAbbreviateWithTwoDecimals(whole, SAITO_BILLION)) {
			const scaled = (whole * 100n) / SAITO_BILLION;
			return `${formatAbbreviatedQuotient(scaled)} billion`;
		}
		return whole.toLocaleString('en-US');
	}

	if (canAbbreviateWithTwoDecimals(whole, SAITO_MILLION)) {
		const scaled = (whole * 100n) / SAITO_MILLION;
		return `${formatAbbreviatedQuotient(scaled)} million`;
	}

	return whole.toLocaleString('en-US');
}

/**
 * Format a NOLAN balance using Explorer monetary display rules (no unit suffix).
 */
function formatNolanAsExplorerCurrency(nolan) {
	if (nolan == null || nolan === '') {
		return '—';
	}

	let amount;
	try {
		amount = BigInt(nolan);
	} catch (err) {
		return String(nolan);
	}

	const whole = amount / NOLAN_PER_SAITO;
	const frac = amount % NOLAN_PER_SAITO;

	if (frac === 0n) {
		return formatMonetaryWhole(whole);
	}

	const fracStr = frac.toString().padStart(8, '0').replace(/0+$/, '');
	return `${whole.toLocaleString('en-US')}.${fracStr}`;
}

function formatSaito(nolan) {
	try {
		const amount = BigInt(nolan ?? 0);
		const whole = amount / NOLAN_PER_SAITO;
		const frac = amount % NOLAN_PER_SAITO;
		if (frac === 0n) {
			return `${formatMonetaryWhole(whole)} SAITO`;
		}
		let fracStr = frac.toString().padStart(8, '0').replace(/0+$/, '');
		return `${whole.toLocaleString('en-US')}.${fracStr} SAITO`;
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
		// Render the full signature and let CSS (.explorer-truncate) shorten it from
		// the right only when the column is too narrow — never a middle ellipsis.
		hash: esc(app, tx.signature || tx.hash || ''),
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
	const blockId = slip?.blockId ?? slip?.block_id;
	const txOrdinal = slip?.txOrdinal ?? slip?.tx_ordinal;
	const slipIndex = slip?.index ?? slip?.slip_index;
	return {
		publicKey: buildPublicKeyLink(app, rawKey, esc(app, rawKey)),
		publicKeyRaw: esc(app, rawKey),
		amount: esc(app, formatSaito(slipAmount(slip))),
		slipType: esc(app, formatSlipTypeName(slipType)),
		block: formatOptionalBigInt(app, blockId),
		transaction: formatOptionalBigInt(app, txOrdinal),
		slip:
			slipIndex != null && slipIndex !== ''
				? esc(app, String(slipIndex))
				: '—',
	};
}

function formatTransactionForBlockPage(app, tx, index = 0) {
	const signature = tx?.signature || tx?.hash || '';
	const txType = tx?.type ?? tx?.transaction_type;
	const txMsg = decodeTxMsg(tx);
	const fromSlips = Array.isArray(tx?.from) ? tx.from : [];
	const toSlips = Array.isArray(tx?.to) ? tx.to : [];
	const timeAbsolute = formatAbsoluteTime(tx?.timestamp);
	const timeDetail = timeAbsolute || '—';
	const inputCount = fromSlips.length;
	const outputCount = toSlips.length;

	return {
		index,
		hash: esc(app, truncateHash(signature, 8, 8)),
		hashFull: esc(app, signature),
		signatureRaw: esc(app, signature),
		signatureFull: esc(app, signature),
		txId: esc(app, String(index + 1)),
		time: esc(app, formatTimeAgo(app, tx?.timestamp)),
		timeAbsolute: esc(app, timeAbsolute),
		timeDetail: esc(app, timeDetail),
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
		hasP2shUnlock: hasP2shUnlockTargets(tx),
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

function buildPreviousBlockLink(app, previousHash) {
	const hash = String(previousHash || '').trim();
	if (!hash || /^0+$/.test(hash)) {
		return '—';
	}

	const safeHash = esc(app, hash);
	return `<a href="/explorer/block/${encodeURIComponent(hash)}" class="explorer-link explorer-mono explorer-block-prev-link" data-block-hash="${safeHash}">${safeHash}</a>`;
}

function formatBlockSummaryPrimary(app, block) {
	const rows = [];
	const add = (label, value, opts = {}) => {
		rows.push({
			label: esc(app, label),
			value: value == null || value === '' ? '—' : value,
			...opts,
		});
	};

	const absoluteTime = formatAbsoluteTime(block.timestamp);
	const creator = String(block.creator || '').trim();
	const merkleRoot = String(block.merkle_root || '').trim();
	const signature = String(block.signature || '').trim();

	add('Block Hash', esc(app, block.hash || '—'), { mono: true });
	add('Timestamp', esc(app, absoluteTime || '—'));
	add('Previous Block', buildPreviousBlockLink(app, block.previous_block_hash), { html: true });
	add(
		'Creator',
		creator ? buildPublicKeyLink(app, creator, creator) : '—',
		{ html: true, mono: true }
	);
	add('Merkle Root', merkleRoot ? esc(app, merkleRoot) : '—', { mono: true });
	add('Signature', signature ? esc(app, signature) : '—', { mono: true });

	return rows;
}

function formatBlockSummaryBadges(app, block) {
	return {
		goldenTicket: {
			label: esc(app, block.has_golden_ticket ? 'Golden Ticket' : 'No Golden Ticket'),
			active: Boolean(block.has_golden_ticket),
		},
		longestChain: {
			label: esc(app, block.in_longest_chain === false ? 'Unconfirmed' : 'Longest Chain'),
			active: block.in_longest_chain !== false,
		},
	};
}

function formatBlockSummaryDetail(app, block, txCount = 0) {
	const rows = [];
	const add = (label, value, opts = {}) => {
		rows.push({
			label: esc(app, label),
			value: value == null || value === '' ? '—' : value,
			...opts,
		});
	};

	add(
		'Status',
		esc(app, block.in_longest_chain === false ? 'Unconfirmed' : 'Finalized')
	);
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
			return enrichBlockCryptoFromSerialize(block, enrichBlockFromWrapper(block, parsed));
		} catch (err) {
			return block;
		}
	}
	return enrichBlockCryptoFromSerialize(block, block);
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
		hasSpvTransactions: transactions.some(isSpvTransaction),
		summaryPrimary: formatBlockSummaryPrimary(app, block),
		summaryBadges: formatBlockSummaryBadges(app, block),
		summaryDetail: formatBlockSummaryDetail(app, block, transactions.length),
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
	truncatePublicKey,
	EXPLORER_INTEGER_ONLY_KEYS,
	formatExplorerInteger,
	formatMonetaryWhole,
	formatNolanAsExplorerCurrency,
	formatSaito,
	formatTimeAgo,
	displayName,
	isAnonymousUsername,
	buildPublicKeyLink,
	formatPublicKeyDisplay,
	formatBlocksForTeaser,
	formatTransactionsForTeaser,
	formatBlockForPage,
	formatTransactionsForBlockPage,
	formatTransactionForBlockPage,
	extractTransactionsFromBlocks,
	mergeBlockByHash,
	normalizeBlockRecord,
	isSpvTransaction,
};
