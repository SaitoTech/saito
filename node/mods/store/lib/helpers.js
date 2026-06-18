const Slip = require('../../../lib/saito/slip').default;
const Transaction = require('../../../lib/saito/transaction').default;
const { SlipType } = require('saito-js/lib/slip');
const { TransactionType } = require('saito-js/lib/transaction');

/** Saito SlipType::P2SH — matches rustscript store unlock pattern. */
const SLIP_TYPE_P2SH = 10;

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

function inventoryInputsFromRecord(inventory) {
	if (!inventory) {
		return null;
	}

	const slips = [inventory.utxo_slip1, inventory.utxo_slip2, inventory.utxo_slip3]
		.map(parseStoredSlip)
		.filter(Boolean);
	if (slips.length !== 3 || !isNFTTuple(slips, 0)) {
		return null;
	}

	return slips;
}

function serializeAnchoredInventorySlips(tx, p2sh_address, chain = {}) {
	const anchored = anchorInventoryInputs(tx, p2sh_address, chain);
	if (!anchored) {
		return null;
	}

	return anchored.map((slip) => slipToJsonString(slip));
}

function returnTupleQuantity(triple) {
	return Number(triple?.[0]?.amount || 0);
}

function returnChainLocation(blk = null, tx = null) {
	return {
		block_id: Number(blk?.id ?? blk?.block_id ?? blk?.bid ?? 0) || 0,
		block_hash: String(blk?.hash ?? blk?.block_hash ?? blk?.bsh ?? ''),
		transaction_id: Number(tx?.transaction_id ?? tx?.tx_index ?? tx?.index ?? 0) || 0
	};
}

function returnInventorySlipId(tx = null, p2sh_address = '') {
	const outputs = tx?.to || [];
	for (let i = 0; i < outputs.length; i++) {
		const slip = outputs[i];
		if (p2sh_address && slip?.publicKey === p2sh_address) {
			return Number(slip?.index ?? slip?.slip_id ?? i) || 0;
		}
	}
	return 0;
}

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

function enrichInventoryFromTransaction(inventory, inventory_txmsg = {}) {
	if (!inventory) {
		return inventory;
	}

	const meta = inventory_txmsg.listing || {};
	if (!inventory.access_script) {
		inventory.access_script = inventory_txmsg.access_script || '';
	}
	if (!inventory.access_hash) {
		inventory.access_hash = inventory_txmsg.access_hash || '';
	}
	if (!inventory.p2sh_address) {
		inventory.p2sh_address = meta.pay_descriptor || '';
	}
	if (!inventory.nft_id) {
		inventory.nft_id = meta.nft_id || '';
	}
	if (!inventory.listing_id) {
		inventory.listing_id = meta.id || meta.listing_id || '';
	}

	return inventory;
}

function buildFulfillmentTransaction({
	app = null,
	inventory_tx = null,
	inventory_txmsg = {},
	inventory,
	listing = null,
	sale,
	buyer,
	quantity
}) {
	const script_address = inventory.p2sh_address || inventory_txmsg?.listing?.pay_descriptor || '';
	const slip_public_key = app ? slipPublicKey(app, script_address) : script_address;
	const access_script = inventory.access_script || inventory_txmsg?.access_script || '';

	let inventory_triple = inventoryInputsFromRecord(inventory);
	let anchored_inputs = inventory_triple;

	if (!inventory_triple && inventory_tx) {
		inventory_triple = findInventoryTriple(inventory_tx.to, slip_public_key);
		anchored_inputs = anchorInventoryInputs(inventory_tx, slip_public_key, {
			block_id: inventory.block_id,
			transaction_id: inventory.transaction_id
		});
	}

	if (!inventory_triple || !anchored_inputs) {
		throw new Error('inventory position not available');
	}

	const total_qty = Number(inventory_triple[0]?.amount || 0);
	const buy_qty = Number(quantity) || 1;
	if (buy_qty <= 0 || buy_qty > total_qty) {
		throw new Error('invalid fulfillment quantity');
	}
	const remainder = total_qty - buy_qty;

	const tx = new Transaction();
	tx.timestamp = Date.now();
	tx.type = TransactionType.Bound;

	for (const input of anchored_inputs) {
		tx.addFromSlip(input);
	}

	const p2sh_marker = new Slip();
	p2sh_marker.type = SLIP_TYPE_P2SH;
	p2sh_marker.amount = BigInt(0);
	p2sh_marker.publicKey = slip_public_key;
	tx.addFromSlip(p2sh_marker);

	for (const out of cloneOutputTriple(inventory_triple, {
		nft_amount: buy_qty,
		buyer_public_key: buyer
	})) {
		tx.addToSlip(out);
	}

	if (remainder > 0) {
		for (const out of cloneOutputTriple(inventory_triple, {
			nft_amount: remainder,
			p2sh_address: slip_public_key
		})) {
			tx.addToSlip(out);
		}
	}

	const base_listing = inventory_txmsg?.listing || {
		id: inventory.listing_id,
		nft_id: inventory.nft_id || listing?.nft_id,
		title: listing?.title,
		description: listing?.description,
		price: listing?.returnPrice?.() || listing?.price,
		denomination: 'SAITO',
		pay_descriptor: script_address
	};
	const relist_listing = {
		...base_listing,
		id: inventory.listing_id || base_listing.id,
		nft_id: inventory.nft_id || base_listing.nft_id,
		title: listing?.title || base_listing.title,
		description: listing?.description || base_listing.description,
		price: listing?.returnPrice?.() || base_listing.price,
		denomination: base_listing.denomination || 'SAITO',
		pay_descriptor: script_address,
		nft_amount: remainder,
		quantity: remainder
	};

	tx.msg = JSON.parse(JSON.stringify(inventory_txmsg || {}));
	tx.msg.module = 'Store';
	tx.msg.request = 'list-asset';
	tx.msg.access_script = access_script;
	tx.msg.access_hash = inventory.access_hash || inventory_txmsg?.access_hash || '';
	tx.msg.listing = relist_listing;
	tx.msg.fulfill_sale = {
		sale_signature: sale.signature,
		prior_inventory: inventory.signature,
		buyer,
		quantity: buy_qty
	};

	return tx;
}

function normalizeInventoryRecord(data = {}) {
	const Inventory = require('./inventory');
	return data instanceof Inventory ? data : new Inventory(data);
}

module.exports = {
	SLIP_TYPE_P2SH,
	slipPublicKey,
	slipToStoredJson,
	isNFTTuple,
	findInventoryTriple,
	findInventoryTripleStartIndex,
	anchorInventoryInputs,
	slipToJsonString,
	parseStoredSlip,
	inventoryInputsFromRecord,
	serializeAnchoredInventorySlips,
	returnTupleQuantity,
	returnChainLocation,
	returnInventorySlipId,
	returnAmountPaidToStore,
	normalizeInventoryRecord,
	cloneOutputTriple,
	enrichInventoryFromTransaction,
	buildFulfillmentTransaction
};
