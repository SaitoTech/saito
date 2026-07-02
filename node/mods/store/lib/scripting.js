const { SlipType } = require('saito-js/lib/slip');

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

function collectNftTuples(slips = []) {
	const tuples = [];

	for (let i = 0; i + 2 < slips.length; i++) {
		if (!isNFTTuple(slips, i)) {
			continue;
		}

		const custody = slips[i + 1];
		tuples.push({
			slips: [slips[i], slips[i + 1], slips[i + 2]],
			custody_public_key: custody?.publicKey || ''
		});
		i += 2;
	}

	return tuples;
}

/** NFT triples created in transaction outputs. */
function returnCreatedNftTuples(tx) {
	return collectNftTuples(tx?.to || []);
}

/** NFT triples consumed from transaction inputs. */
function returnSpentNftTuples(tx) {
	return collectNftTuples(tx?.from || []);
}

function buildBuyerOrStoreScript(buyer_publickey, store_publickey) {
	return {
		op: 'CHECKMULTISIG',
		m: 1,
		publickeys: [buyer_publickey, store_publickey],
		msg: 'tx.from.p2sh.utxoset_key'
	};
}

function createListingScript(app, { seller_publickey, store_publickey } = {}) {
	const script = buildBuyerOrStoreScript(seller_publickey, store_publickey);

	const hash = app.core.scripting.hash(script);
	const address = app.core.scripting.address(script);

	return {
		access_script: JSON.stringify(script),
		access_hash: hash,
		p2sh_address: address
	};
}

function createPurchaseScript(app, { buyer_publickey, store_publickey } = {}) {
	return createListingScript(app, {
		seller_publickey: buyer_publickey,
		store_publickey
	});
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

async function executeListingScript(app, access_script, publickey) {
	const script = parseAccessScript(access_script);
	if (!script || String(script.op || '').toUpperCase() !== 'CHECKMULTISIG') {
		return false;
	}

	const publickeys = Array.isArray(script.publickeys) ? script.publickeys : [];
	if (!publickey || !publickeys.includes(publickey)) {
		return false;
	}

	const msg = script.msg;
	if (!msg) {
		return false;
	}

	// Contextual msg references resolve during on-chain P2SH validation.
	if (typeof msg === 'string' && msg.startsWith('tx.')) {
		return true;
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

async function signAccessScriptWitness(app, access_script, message, options = {}) {
	const script = parseAccessScript(access_script);
	if (!script || !message) {
		throw new Error('access script and message are required for P2SH witness');
	}

	let signature = '';
	if (typeof app.wallet?.signMessage === 'function') {
		signature = await app.wallet.signMessage(message);
	} else {
		const privatekey = await app.wallet.getPrivateKey();
		signature = app.crypto.signMessage(message, privatekey);
	}

	const executable = JSON.parse(JSON.stringify(script));
	executable.witness = { signatures: [signature] };
	const executable_string = JSON.stringify(executable);

	if (options.logRustScript) {
		const { dumpRustScriptEngineCall } = require('./fulfillment-trace');
		dumpRustScriptEngineCall(options.context || 'signAccessScriptWitness', {
			locking_script: script,
			executable,
			executable_string
		});
	}

	return executable_string;
}

module.exports = {
	buildBuyerOrStoreScript,
	createListingScript,
	createPurchaseScript,
	parseAccessScript,
	returnCreatedNftTuples,
	returnSpentNftTuples,
	executeListingScript,
	signAccessScriptWitness
};
