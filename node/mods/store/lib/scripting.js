const { deriveP2shFromLockingScript } = require('../../rustscript/lib/rustscript/p2sh');

function stripWitness(node) {
	if (!node || typeof node !== 'object') {
		return node;
	}
	if (Array.isArray(node)) {
		return node.map(stripWitness);
	}
	const out = {};
	for (const key of Object.keys(node)) {
		if (key === 'witness') {
			continue;
		}
		out[key] = stripWitness(node[key]);
	}
	return out;
}

function generateListingScript(app, { nft_id = '', seller_publickey = '', store_publickey = '', timestamp = Date.now() } = {}) {
	if (!nft_id || !seller_publickey || !store_publickey) {
		throw new Error('Listing script requires nft_id, seller, and store public keys');
	}

	const msg = `${nft_id}-${seller_publickey}-${timestamp}`;
	const script = stripWitness({
		op: 'CHECKMULTISIG',
		m: 1,
		publickeys: [seller_publickey, store_publickey],
		msg
	});

	const { hash, address } = deriveP2shFromLockingScript(app, script);
	if (!hash || !address) {
		throw new Error('Failed to derive listing P2SH from script');
	}

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
	const locking = stripWitness(script);
	const { hash } = deriveP2shFromLockingScript(app, locking);
	return hash || '';
}

async function storeCanSpendListingScript(app, store_public_key = '', access_script = '') {
	const script = parseAccessScript(access_script);
	if (!script || String(script.op || '').toUpperCase() !== 'CHECKMULTISIG') {
		return false;
	}

	const msg = script.msg;
	if (!msg) {
		return false;
	}

	if (!app?.core?.scripting?.evaluate) {
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
		return false;
	}

	const executable = JSON.parse(JSON.stringify(script));
	executable.witness = { signatures: [signature] };

	const result = await app.core.scripting.evaluate(executable);
	return result === 1;
}

module.exports = {
	generateListingScript,
	parseAccessScript,
	hashAccessScript,
	storeCanSpendListingScript
};
