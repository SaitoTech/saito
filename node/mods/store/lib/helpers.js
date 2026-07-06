const Slip = require('../../../lib/saito/slip').default;
const { SlipType } = require('saito-js/lib/slip');
const { isNFTTuple, signAccessScriptWitness } = require('./scripting');

/** Saito SlipType::P2SH — matches rustscript store unlock pattern. */
const SLIP_TYPE_P2SH = 10;

function isP2shPublicKey(app, publicKey = '') {
	if (!publicKey || !app?.crypto?.fromBase58) {
		return false;
	}
	try {
		const hex = app.crypto.fromBase58(publicKey);
		return typeof hex === 'string' && hex.length >= 2 && hex.startsWith('00');
	} catch (err) {
		return false;
	}
}

/** Mirrors saito-core: Bound slips are never P2SH inputs for witness purposes. */
function isBoundSlip(slip) {
	return Number(slip?.type) === SlipType.Bound;
}

/** True when Rust would include this input in p2sh_idxs. */
function slipRequiresP2shWitness(app, slip) {
	if (isBoundSlip(slip)) {
		return false;
	}
	return isP2shPublicKey(app, slip?.publicKey || '');
}

function listRustP2shInputIndexes(app, tx) {
	const indexes = [];
	const from = tx?.from || [];
	for (let i = 0; i < from.length; i++) {
		if (slipRequiresP2shWitness(app, from[i])) {
			indexes.push(i);
		}
	}
	return indexes;
}

async function attachP2shAccessScripts(
	app,
	fulfillment_tx,
	{ payment_access_script = '', listing_txs = [] } = {}
) {
	if (!app || !fulfillment_tx) {
		throw new Error('transaction and app are required for P2SH witness');
	}

	const from = fulfillment_tx.from || [];
	const p2sh_indexes = [];
	for (let i = 0; i < from.length; i++) {
		if (isP2shPublicKey(app, from[i]?.publicKey)) {
			p2sh_indexes.push(i);
		}
	}
	if (!p2sh_indexes.length) {
		return fulfillment_tx;
	}

	const witness_message = String(from[p2sh_indexes[0]]?.utxoKey || '');
	if (!witness_message) {
		throw new Error('P2SH input is missing utxoset key');
	}

	const locking_scripts = [];
	if (payment_access_script) {
		locking_scripts.push(payment_access_script);
	}
	for (const listing_tx of listing_txs) {
		const listing_txmsg = listingTxmsg(listing_tx);
		locking_scripts.push(listing_txmsg.access_script || '');
	}

	if (locking_scripts.length !== p2sh_indexes.length) {
		throw new Error('P2SH input count does not match access script count');
	}

	const access_scripts = [];
	for (let i = 0; i < p2sh_indexes.length; i++) {
		const locking_script = locking_scripts[i] || '';
		if (!locking_script) {
			throw new Error('missing access script for P2SH input');
		}
		access_scripts.push(await signAccessScriptWitness(app, locking_script, witness_message));
	}

	fulfillment_tx.msg = fulfillment_tx.msg || {};
	fulfillment_tx.msg.access_scripts = access_scripts;
	return fulfillment_tx;
}

function slipPublicKey(app, script_address) {
	if (!script_address) {
		return '';
	}
	if (script_address.length === 66 && script_address.startsWith('00')) {
		return app.crypto.toBase58(script_address);
	}
	return script_address;
}

function serializeSlip(slip) {
	if (!slip) {
		return '';
	}
	if (typeof slip.toJson === 'function') {
		return JSON.stringify(slip.toJson());
	}
	return JSON.stringify({
		publicKey: slip.publicKey,
		amount: slip.amount,
		type: slip.type,
		blockId: slip.blockId,
		txOrdinal: slip.txOrdinal,
		index: slip.index,
		utxoKey: slip.utxoKey
	});
}

/**
 * WASM Slip setters require bigint for blockId and txOrdinal.
 * JSON.parse and Number() paths may yield JS numbers — normalize before construction.
 */
function normalizeSlipJson(data) {
	if (!data || typeof data !== 'object') {
		return data;
	}
	const normalized = { ...data };
	if (normalized.blockId != null && normalized.blockId !== '') {
		normalized.blockId = BigInt(normalized.blockId);
	}
	if (normalized.txOrdinal != null && normalized.txOrdinal !== '') {
		normalized.txOrdinal = BigInt(normalized.txOrdinal);
	}
	return normalized;
}

function findInventoryTriple(slips, p2sh_address) {
	if (!p2sh_address || !slips?.length) {
		return null;
	}
	for (let i = 0; i + 2 < slips.length; i++) {
		if (!isNFTTuple(slips, i)) {
			continue;
		}
		// slip2.publicKey is the P2SH custody address, not a wallet public key.
		if (slips[i + 1]?.publicKey === p2sh_address) {
			return [slips[i], slips[i + 1], slips[i + 2]];
		}
	}
	return null;
}

function parseStoredSlip(stored) {
	if (!stored) {
		return null;
	}
	try {
		const data = typeof stored === 'string' ? JSON.parse(stored) : stored;
		return new Slip(undefined, normalizeSlipJson(data));
	} catch (err) {
		return null;
	}
}

function listingTxmsg(transaction) {
	return (typeof transaction?.returnMessage === 'function'
		? transaction.returnMessage()
		: transaction?.msg) || {};
}

function listingInputSlipJsonFromRecord(listing) {
	if (!listing) {
		return null;
	}

	const stored = [listing.utxo_slip1, listing.utxo_slip2, listing.utxo_slip3];
	if (stored.some((value) => !value)) {
		return null;
	}

	const json_triple = stored.map((value) => {
		const data = typeof value === 'string' ? JSON.parse(value) : value;
		return normalizeSlipJson(data);
	});

	const slips = json_triple.map((data) => new Slip(undefined, data));
	if (slips.length !== 3 || !isNFTTuple(slips, 0)) {
		return null;
	}

	return json_triple;
}

/** Store bookkeeping only — index of tx within its confirming block. */
function transactionIndexInBlock(blk = null, tx = null) {
	const signature = tx?.signature || '';
	const txs = blk?.transactions || [];
	for (let i = 0; i < txs.length; i++) {
		if (txs[i]?.signature === signature) {
			return i;
		}
	}
	return 0;
}

function returnListingSlipId(tx = null, p2sh_address = '') {
	const outputs = tx?.to || [];
	for (let i = 0; i < outputs.length; i++) {
		const slip = outputs[i];
		if (p2sh_address && slip?.publicKey === p2sh_address) {
			return Number(slip?.index ?? slip?.slip_id ?? i) || 0;
		}
	}
	return 0;
}

function returnPaymentUtxoFromPurchase(tx, txmsg = {}, app = null) {
	if (!tx?.signature || !txmsg?.p2sh_address || !app) {
		return null;
	}

	const expected = slipPublicKey(app, txmsg.p2sh_address);
	if (!expected) {
		return null;
	}

	for (let i = 0; i < (tx.to || []).length; i++) {
		const o = tx.to[i];
		if (o?.publicKey !== expected) {
			continue;
		}

		const amount = typeof o.amount === 'bigint' ? o.amount : BigInt(o.amount ?? 0);
		return {
			payment_tx_sig: tx.signature,
			payment_output_index: Number(o?.index ?? i),
			payment_amount: amount,
			p2sh_address: txmsg.p2sh_address,
			access_script: txmsg.access_script || ''
		};
	}

	return null;
}

function returnAmountPaidInPurchase(tx, txmsg = {}, app = null) {
	const payment_utxo = returnPaymentUtxoFromPurchase(tx, txmsg, app);
	return payment_utxo ? payment_utxo.payment_amount : 0n;
}

function paymentInputFromOrder(order_row) {
	if (!order_row) {
		return null;
	}

	const stored = order_row.utxo_slip || order_row.payment_utxo_slip || '';
	return parseStoredSlip(stored);
}

module.exports = {
	SLIP_TYPE_P2SH,
	isP2shPublicKey,
	isBoundSlip,
	slipRequiresP2shWitness,
	listRustP2shInputIndexes,
	slipPublicKey,
	attachP2shAccessScripts,
	serializeSlip,
	normalizeSlipJson,
	findInventoryTriple,
	parseStoredSlip,
	listingTxmsg,
	listingInputSlipJsonFromRecord,
	transactionIndexInBlock,
	returnListingSlipId,
	returnAmountPaidInPurchase,
	returnPaymentUtxoFromPurchase,
	paymentInputFromOrder
};
