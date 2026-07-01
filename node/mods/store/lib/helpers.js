const Slip = require('../../../lib/saito/slip').default;
const { SlipType } = require('saito-js/lib/slip');
const { signAccessScriptWitness } = require('./scripting');

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

async function attachP2shAccessScripts(app, tx, script_by_pubkey = {}) {
	if (!app || !tx) {
		throw new Error('transaction and app are required for P2SH witness');
	}

	const from = tx.from || [];
	const indexes = [];
	for (let i = 0; i < from.length; i++) {
		if (isP2shPublicKey(app, from[i]?.publicKey)) {
			indexes.push(i);
		}
	}
	if (!indexes.length) {
		return tx;
	}

	const witness_message = String(tx.from[indexes[0]]?.utxoKey || '');
	if (!witness_message) {
		throw new Error('P2SH input is missing utxoset key');
	}

	const access_scripts = [];
	for (let i = 0; i < indexes.length; i++) {
		const slip = tx.from[indexes[i]];
		const pubkey = slip?.publicKey || '';
		const locking_script = script_by_pubkey[pubkey] || '';
		if (!locking_script) {
			throw new Error('missing access script for P2SH input');
		}
		access_scripts.push(await signAccessScriptWitness(app, locking_script, witness_message));
	}

	tx.msg = tx.msg || {};
	tx.msg.access_scripts = access_scripts;
	return tx;
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

function slipToStoredJson(slip) {
	if (!slip) {
		return null;
	}
	if (typeof slip.toJson === 'function') {
		return slip.toJson();
	}
	return {
		publicKey: slip.publicKey,
		amount: slip.amount,
		type: slip.type,
		blockId: slip.blockId,
		txOrdinal: slip.txOrdinal,
		index: slip.index,
		utxoKey: slip.utxoKey
	};
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

function isNFTTuple(slips, i) {
	if (!slips || i + 2 >= slips.length) {
		return false;
	}
	const a = slips[i];
	const b = slips[i + 1];
	const c = slips[i + 2];
	return (
		a?.type === SlipType.Bound &&
		c?.type === SlipType.Bound &&
		(b?.type === SlipType.Normal || b?.type === SlipType.ATR)
	);
}

function findInventoryTripleStartIndex(slips, p2sh_address) {
	if (!p2sh_address || !slips?.length) {
		return -1;
	}
	for (let i = 0; i + 2 < slips.length; i++) {
		if (!isNFTTuple(slips, i)) {
			continue;
		}
		// slip2.publicKey is the P2SH custody address, not a wallet public key.
		if (slips[i + 1]?.publicKey === p2sh_address) {
			return i;
		}
	}
	return -1;
}

function findInventoryTriple(slips, p2sh_address) {
	const start = findInventoryTripleStartIndex(slips, p2sh_address);
	if (start < 0) {
		return null;
	}
	return [slips[start], slips[start + 1], slips[start + 2]];
}

/**
 * Input slips must reference the mined listing transaction UTXO, not template outputs.
 */
function anchorInventoryInputs(listing_tx, p2sh_address, chain = {}) {
	const outputs = listing_tx?.to || [];
	const start = findInventoryTripleStartIndex(outputs, p2sh_address);
	if (start < 0) {
		return null;
	}

	const block_id = Number(chain.block_id ?? 0) || 0;
	const transaction_id = Number(chain.transaction_id ?? 0) || 0;
	const anchored = [];

	for (let j = 0; j < 3; j++) {
		const source = outputs[start + j];
		const slip = new Slip(undefined, normalizeSlipJson(slipToStoredJson(source)));
		slip.blockId = BigInt(block_id);
		slip.txOrdinal = BigInt(transaction_id);
		slip.index = Number(source?.index ?? start + j) || start + j;
		anchored.push(slip);
	}

	return anchored;
}

function slipToJsonString(slip) {
	const json = slipToStoredJson(slip);
	return json ? JSON.stringify(json) : '';
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

function listingInputsFromRecord(listing) {
	if (!listing) {
		return null;
	}

	const slips = [listing.utxo_slip1, listing.utxo_slip2, listing.utxo_slip3]
		.map(parseStoredSlip)
		.filter(Boolean);
	if (slips.length !== 3 || !isNFTTuple(slips, 0)) {
		return null;
	}

	return slips;
}

function serializeAnchoredListingSlips(tx, p2sh_address, chain = {}) {
	const anchored = anchorInventoryInputs(tx, p2sh_address, chain);
	if (!anchored) {
		return null;
	}

	return anchored.map((slip) => slipToJsonString(slip));
}

function returnChainLocation(blk = null, tx = null) {
	return {
		block_id: Number(blk?.id ?? blk?.block_id ?? blk?.bid ?? 0) || 0,
		block_hash: String(blk?.hash ?? blk?.block_hash ?? blk?.bsh ?? ''),
		transaction_id: Number(tx?.transaction_id ?? tx?.tx_index ?? tx?.index ?? 0) || 0
	};
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

function anchorPaymentInput(payment_tx, payment_output_index, chain = {}) {
	if (!payment_tx?.to?.length) {
		return null;
	}

	const index = Number(payment_output_index ?? 0);
	const source = payment_tx.to[index];
	if (!source) {
		return null;
	}

	const slip = new Slip(undefined, normalizeSlipJson(slipToStoredJson(source)));
	slip.blockId = BigInt(chain.block_id ?? 0);
	slip.txOrdinal = BigInt(chain.transaction_id ?? 0);
	slip.index = Number(source?.index ?? index) || index;
	return slip;
}

function paymentInputFromOrder(order, payment_tx = null) {
	if (!order) {
		return null;
	}

	if (order.payment_utxo_slip) {
		const cached = parseStoredSlip(order.payment_utxo_slip);
		if (cached) {
			return cached;
		}
	}

	if (!payment_tx) {
		return null;
	}

	return anchorPaymentInput(payment_tx, order.payment_output_index, {
		block_id: order.block_id_received ?? order.block_id_added,
		transaction_id: order.transaction_id_received ?? order.transaction_id_added
	});
}

function serializePaymentSlip(payment_tx, payment_output_index, chain = {}) {
	const slip = anchorPaymentInput(payment_tx, payment_output_index, chain);
	return slip ? slipToJsonString(slip) : '';
}

module.exports = {
	SLIP_TYPE_P2SH,
	slipPublicKey,
	attachP2shAccessScripts,
	slipToStoredJson,
	normalizeSlipJson,
	findInventoryTriple,
	anchorInventoryInputs,
	slipToJsonString,
	listingInputsFromRecord,
	serializeAnchoredListingSlips,
	returnChainLocation,
	returnListingSlipId,
	returnAmountPaidInPurchase,
	returnPaymentUtxoFromPurchase,
	paymentInputFromOrder,
	serializePaymentSlip
};
