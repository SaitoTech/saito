const path = require('path');
const { deriveP2shFromLockingScript } = require('../../rustscript/lib/rustscript/p2sh');

const LISTING_SCRIPT_FILE = path.join('mods', 'store', 'lib', 'listing-script.js');
console.log('Store: listing-script helpers loaded from', LISTING_SCRIPT_FILE);

/**
 * Strip witness fields from a script tree (locking view).
 */
function lockingView(node) {
	if (!node || typeof node !== 'object') {
		return node;
	}
	if (Array.isArray(node)) {
		return node.map(lockingView);
	}
	const out = {};
	for (const key of Object.keys(node)) {
		if (key === 'witness') {
			continue;
		}
		out[key] = lockingView(node[key]);
	}
	return out;
}

/**
 * Sole origin for Store listing P2SH scripts.
 */
function generateListingScript(app, { nft_id = '', seller_publickey = '', store_publickey = '', timestamp = Date.now() } = {}) {
	console.log('Store/listing-script: generateListingScript', LISTING_SCRIPT_FILE, {
		nft_id,
		seller_publickey,
		store_publickey,
		timestamp
	});

	if (!nft_id || !seller_publickey || !store_publickey) {
		throw new Error('Listing script requires nft_id, seller, and store public keys');
	}

	const msg = `${nft_id}-${seller_publickey}-${timestamp}`;
	const script = lockingView({
		op: 'CHECKMULTISIG',
		m: 1,
		publickeys: [seller_publickey, store_publickey],
		msg
	});

	const { hash, address } = deriveP2shFromLockingScript(app, script);
	if (!hash || !address) {
		throw new Error('Failed to derive listing P2SH from script');
	}

	console.log('Store/listing-script: generateListingScript result', {
		access_hash: hash,
		pay_descriptor: address,
		msg
	});

	return {
		script,
		access_script: JSON.stringify(script),
		access_hash: hash,
		pay_descriptor: address,
		msg,
		timestamp
	};
}

function parseAccessScript(access_script) {
	if (!access_script) {
		return null;
	}
	if (typeof access_script === 'object') {
		return access_script;
	}
	try {
		return JSON.parse(access_script);
	} catch (err) {
		return null;
	}
}

function hashAccessScript(app, access_script) {
	const script = parseAccessScript(access_script);
	if (!script) {
		return '';
	}
	const locking = lockingView(script);
	const { hash } = deriveP2shFromLockingScript(app, locking);
	return hash || '';
}

/**
 * Prove Store can satisfy the listing script using the same Rust validator as P2SH spends.
 * Does not create or broadcast a transaction.
 */
async function storeCanSpendListingScript(app, store_public_key = '', access_script = '') {
	console.log('Store/listing-script: storeCanSpendListingScript', LISTING_SCRIPT_FILE, {
		store_public_key
	});

	const script = parseAccessScript(access_script);
	if (!script || String(script.op || '').toUpperCase() !== 'CHECKMULTISIG') {
		console.log('Store/listing-script: storeCanSpendListingScript false (not CHECKMULTISIG)');
		return false;
	}

	const msg = script.msg;
	if (!msg) {
		console.log('Store/listing-script: storeCanSpendListingScript false (no msg)');
		return false;
	}

	if (!app?.core?.scripting?.evaluate) {
		console.log('Store/listing-script: storeCanSpendListingScript false (no app.core.scripting.evaluate)');
		return false;
	}

	let signature = '';
	try {
		if (typeof app.wallet?.signMessage === 'function') {
			signature = await app.wallet.signMessage(msg);
		} else {
			const privatekey = await app.wallet.getPrivateKey();
			signature = app.crypto.signMessage(msg, privatekey);
		}
	} catch (err) {
		console.log('Store/listing-script: storeCanSpendListingScript false (sign failed)', err?.message);
		return false;
	}

	const executable = JSON.parse(JSON.stringify(script));
	executable.witness = { signatures: [signature] };

	const result = await app.core.scripting.evaluate(executable);
	const can_spend = result === 1;

	console.log('Store/listing-script: storeCanSpendListingScript', can_spend, {
		msg,
		rust_result: result
	});

	return can_spend;
}

function findListingP2shAddress(tx, txmsg = {}) {
	const outputs = tx?.to || [];
	for (let i = 1; i < outputs.length - 1; i += 1) {
		const slip2 = outputs[i];
		const slip1 = outputs[i - 1];
		const slip3 = outputs[i + 1];
		if (!slip2?.publicKey) {
			continue;
		}
		if (slip1?.type !== 9 && slip1?.type !== 'Bound') {
			continue;
		}
		if (slip3?.type !== 9 && slip3?.type !== 'Bound') {
			continue;
		}
		if (txmsg.pay_descriptor && slip2.publicKey === txmsg.pay_descriptor) {
			return slip2.publicKey;
		}
		return slip2.publicKey;
	}
	return '';
}

module.exports = {
	lockingView,
	generateListingScript,
	parseAccessScript,
	hashAccessScript,
	storeCanSpendListingScript,
	findListingP2shAddress
};
