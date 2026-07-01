const Slip = require('../../../lib/saito/slip').default;
const Transaction = require('../../../lib/saito/transaction').default;
const { SlipType } = require('saito-js/lib/slip');
const { TransactionType } = require('saito-js/lib/transaction');
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

function returnP2shInputIndexesWithApp(app, from = []) {
	const indexes = [];
	for (let i = 0; i < from.length; i++) {
		if (isP2shPublicKey(app, from[i]?.publicKey)) {
			indexes.push(i);
		}
	}
	return indexes;
}

function returnFirstP2shUtxoSetKeyHex(tx, app) {
	const indexes = returnP2shInputIndexesWithApp(app, tx?.from || []);
	if (!indexes.length) {
		return '';
	}
	return String(tx.from[indexes[0]]?.utxoKey || '');
}

async function attachP2shAccessScripts(app, tx, script_by_pubkey = {}) {
	if (!app || !tx) {
		throw new Error('transaction and app are required for P2SH witness');
	}

	const indexes = returnP2shInputIndexesWithApp(app, tx.from || []);
	if (!indexes.length) {
		return tx;
	}

	const witness_message = returnFirstP2shUtxoSetKeyHex(tx, app);
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
		const slip = new Slip(undefined, slipToStoredJson(source));
		slip.blockId = block_id;
		slip.txOrdinal = transaction_id;
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
		return new Slip(undefined, data);
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

/**
 * @deprecated Use returnPaymentUtxoFromPurchase for P2SH purchase payments.
 */
function returnPaymentUtxoToStore(tx, store_public_key) {
	if (!tx?.signature || !store_public_key) {
		return null;
	}

	for (let i = 0; i < (tx.to || []).length; i++) {
		const o = tx.to[i];
		if (o?.publicKey !== store_public_key) {
			continue;
		}

		const amount = typeof o.amount === 'bigint' ? o.amount : BigInt(o.amount ?? 0);
		return {
			payment_tx_sig: tx.signature,
			payment_output_index: Number(o?.index ?? i),
			payment_amount: amount
		};
	}

	return null;
}

/**
 * @deprecated Use returnAmountPaidInPurchase for P2SH purchase payments.
 */
function returnAmountPaidToStore(tx, store_public_key) {
	let amount_paid = 0n;

	for (const o of tx.to || []) {
		if (o?.publicKey === store_public_key) {
			const a = typeof o.amount === 'bigint' ? o.amount : BigInt(o.amount ?? 0);
			amount_paid += a;
		}
	}

	if (tx.isFrom(store_public_key) && tx.to?.[0]) {
		const a =
			typeof tx.to[0].amount === 'bigint' ? tx.to[0].amount : BigInt(tx.to[0].amount ?? 0);
		amount_paid = a;
	}

	return amount_paid;
}

function cloneOutputTriple(sourceTriple, { nft_amount, buyer_public_key, p2sh_address }) {
	const out1 = new Slip(undefined, slipToStoredJson(sourceTriple[0]));
	out1.amount = BigInt(nft_amount);
	const out2 = new Slip(undefined, slipToStoredJson(sourceTriple[1]));
	out2.publicKey = buyer_public_key || p2sh_address;
	const out3 = new Slip(undefined, slipToStoredJson(sourceTriple[2]));
	return [out1, out2, out3];
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

	const slip = new Slip(undefined, slipToStoredJson(source));
	slip.blockId = Number(chain.block_id ?? 0) || 0;
	slip.txOrdinal = Number(chain.transaction_id ?? 0) || 0;
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

function addListingInputsToTransaction(tx, listing_rows = [], app = null) {
	const inputs = [];

	for (let i = 0; i < listing_rows.length; i++) {
		const listing_row = listing_rows[i];
		let nft_triple = listingInputsFromRecord(listing_row);
		if (!nft_triple) {
			throw new Error('listing position not available');
		}

		const script_address = listing_row.p2sh_address || '';
		const slip_public_key = slipPublicKey(app, script_address) || script_address;

		for (const input of nft_triple) {
			tx.addFromSlip(input);
		}

		const p2sh_marker = new Slip();
		p2sh_marker.type = SLIP_TYPE_P2SH;
		p2sh_marker.amount = BigInt(0);
		p2sh_marker.publicKey = slip_public_key;
		tx.addFromSlip(p2sh_marker);

		inputs.push({ listing: listing_row, nft_triple, slip_public_key });
	}

	return inputs;
}

async function buildFulfillmentTransaction({
	app = null,
	listing_tx = null,
	listing_txmsg = {},
	listing,
	listings = null,
	summary = null,
	sale,
	buyer,
	quantity,
	payment_tx = null
}) {
	const listing_rows = Array.isArray(listings) && listings.length ? listings : listing ? [listing] : [];
	if (!listing_rows.length) {
		throw new Error('listing position not available');
	}

	const primary = listing_rows[0];
	const script_address = primary.p2sh_address || listing_txmsg?.listing?.pay_descriptor || '';
	const slip_public_key = app ? slipPublicKey(app, script_address) : script_address;
	const access_script = primary.access_script || listing_txmsg?.access_script || '';

	let nft_triple = listingInputsFromRecord(primary);
	let anchored_inputs = nft_triple;

	if (!nft_triple && listing_tx) {
		nft_triple = findInventoryTriple(listing_tx.to, slip_public_key);
		anchored_inputs = anchorInventoryInputs(listing_tx, slip_public_key, {
			block_id: primary.block_id_listed ?? primary.block_id,
			transaction_id: primary.transaction_id_listed ?? primary.transaction_id
		});
	}

	if (!nft_triple || !anchored_inputs) {
		throw new Error('listing position not available');
	}

	const total_qty = Number(nft_triple[0]?.amount || 0);
	const buy_qty = Number(quantity) || 1;
	if (buy_qty <= 0 || buy_qty > total_qty) {
		throw new Error('invalid fulfillment quantity');
	}
	const remainder = total_qty - buy_qty;

	const tx = new Transaction();
	tx.timestamp = Date.now();
	tx.type = TransactionType.Bound;

	const payment_input = paymentInputFromOrder(sale, payment_tx);
	if (!payment_input) {
		throw new Error('payment input not available');
	}
	tx.addFromSlip(payment_input);

	addListingInputsToTransaction(tx, listing_rows, app);

	for (const out of cloneOutputTriple(nft_triple, {
		nft_amount: buy_qty,
		buyer_public_key: buyer
	})) {
		tx.addToSlip(out);
	}

	if (remainder > 0) {
		for (const out of cloneOutputTriple(nft_triple, {
			nft_amount: remainder,
			p2sh_address: slip_public_key
		})) {
			tx.addToSlip(out);
		}
	}

	const unit_price = BigInt(sale?.price ?? summary?.price ?? primary.price ?? 0);
	const seller_amount = unit_price * BigInt(buy_qty);
	if (seller_amount > 0n && primary.seller) {
		const seller_slip = new Slip();
		seller_slip.publicKey = primary.seller;
		seller_slip.amount = seller_amount;
		seller_slip.type = SlipType.Normal;
		tx.addToSlip(seller_slip);
	}

	const base_listing = listing_txmsg?.listing || {
		id: primary.summary_id,
		nft_id: primary.nft_id || summary?.nft_id,
		title: summary?.title,
		description: summary?.description,
		price: summary?.returnPrice?.() || summary?.price,
		denomination: 'SAITO',
		pay_descriptor: script_address
	};
	const relist_listing = {
		...base_listing,
		id: primary.summary_id || base_listing.id,
		nft_id: primary.nft_id || base_listing.nft_id,
		title: summary?.title || base_listing.title,
		description: summary?.description || base_listing.description,
		price: summary?.returnPrice?.() || base_listing.price,
		denomination: base_listing.denomination || 'SAITO',
		pay_descriptor: script_address,
		nft_amount: remainder,
		quantity: remainder
	};

	tx.msg = JSON.parse(JSON.stringify(listing_txmsg || {}));
	tx.msg.module = 'Store';
	tx.msg.request = 'list-asset';
	tx.msg.access_script = access_script;
	tx.msg.access_hash = primary.access_hash || listing_txmsg?.access_hash || '';
	tx.msg.listing = relist_listing;
	tx.msg.fulfill_sale = {
		sale_signature: sale.order_tx_sig || sale.signature,
		prior_inventory: primary.signature,
		buyer,
		quantity: buy_qty,
		seller: primary.seller || ''
	};

	const payment_txmsg =
		(typeof payment_tx?.returnMessage === 'function' ? payment_tx.returnMessage() : payment_tx?.msg) ||
		{};
	const payment_access_script = payment_txmsg.access_script || '';
	const payment_pubkey = slipPublicKey(app, payment_txmsg.p2sh_address || '');
	const script_by_pubkey = {};

	if (payment_pubkey && payment_access_script) {
		script_by_pubkey[payment_pubkey] = payment_access_script;
	}
	if (slip_public_key && access_script) {
		script_by_pubkey[slip_public_key] = access_script;
	}

	await attachP2shAccessScripts(app, tx, script_by_pubkey);
	return tx;
}

async function buildOrderRefundTransaction({
	app = null,
	order,
	payment_tx = null,
	refund_public_key = '',
	reason = 'unable-to-fulfill'
}) {
	if (!order) {
		return null;
	}

	const payment_input = paymentInputFromOrder(order, payment_tx);
	if (!payment_input) {
		throw new Error('payment input not available');
	}

	const refund_to = refund_public_key || order.buyer || '';
	if (!refund_to) {
		throw new Error('refund recipient not available');
	}

	const amount = BigInt(order.payment_amount ?? payment_input.amount ?? 0);
	if (amount <= 0n) {
		throw new Error('refund amount not available');
	}

	const tx = new Transaction();
	tx.timestamp = Date.now();

	tx.addFromSlip(payment_input);

	const refund_slip = new Slip();
	refund_slip.publicKey = refund_to;
	refund_slip.amount = amount;
	refund_slip.type = SlipType.Normal;
	tx.addToSlip(refund_slip);

	tx.msg = {
		module: 'Store',
		request: 'order-refund',
		type: 'order-refund',
		order_tx_sig: order.order_tx_sig || order.signature || '',
		buyer: order.buyer || '',
		refund: refund_to,
		reason,
		payment_tx_sig: order.payment_tx_sig || order.order_tx_sig || '',
		payment_output_index: Number(order.payment_output_index ?? 0),
		payment_amount: String(order.payment_amount ?? 0)
	};

	const payment_txmsg =
		(typeof payment_tx?.returnMessage === 'function' ? payment_tx.returnMessage() : payment_tx?.msg) ||
		{};
	const payment_access_script = payment_txmsg.access_script || '';
	const payment_pubkey = slipPublicKey(app, payment_txmsg.p2sh_address || '');
	if (!payment_pubkey || !payment_access_script) {
		throw new Error('payment access script not available');
	}

	await attachP2shAccessScripts(app, tx, {
		[payment_pubkey]: payment_access_script
	});

	return tx;
}

module.exports = {
	SLIP_TYPE_P2SH,
	slipPublicKey,
	isP2shPublicKey,
	returnP2shInputIndexesWithApp,
	returnFirstP2shUtxoSetKeyHex,
	attachP2shAccessScripts,
	slipToStoredJson,
	isNFTTuple,
	findInventoryTriple,
	findInventoryTripleStartIndex,
	anchorInventoryInputs,
	slipToJsonString,
	parseStoredSlip,
	listingInputsFromRecord,
	serializeAnchoredListingSlips,
	returnChainLocation,
	returnListingSlipId,
	returnAmountPaidInPurchase,
	returnPaymentUtxoFromPurchase,
	returnAmountPaidToStore,
	returnPaymentUtxoToStore,
	cloneOutputTriple,
	anchorPaymentInput,
	paymentInputFromOrder,
	serializePaymentSlip,
	addListingInputsToTransaction,
	buildFulfillmentTransaction,
	buildOrderRefundTransaction
};
