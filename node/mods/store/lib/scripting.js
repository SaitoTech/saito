const { SlipType } = require('saito-js/lib/slip');

/** Saito SlipType::P2SH — matches rustscript unlock marker on spending inputs. */
const SLIP_TYPE_P2SH = 10;

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

function returnP2SHTuples(tx) {
	const from = tx?.from || [];
	const to = tx?.to || [];
	const inputs = [];
	const outputs = [];
	const p2sh_keys = new Set();

	for (let i = 0; i < from.length; i++) {
		if (Number(from[i]?.type) !== SLIP_TYPE_P2SH) {
			continue;
		}
		const marker = from[i];
		const key = marker?.publicKey || '';
		if (key) {
			p2sh_keys.add(key);
		}
		if (i >= 3 && isNFTTuple(from, i - 3)) {
			inputs.push({
				slips: [from[i - 3], from[i - 2], from[i - 1]],
				p2sh_public_key: key
			});
		}
	}

	const spending = p2sh_keys.size > 0;

	for (let i = 0; i + 2 < to.length; i++) {
		if (!isNFTTuple(to, i)) {
			continue;
		}
		const slip2_key = to[i + 1]?.publicKey || '';
		if (spending && !p2sh_keys.has(slip2_key)) {
			i += 2;
			continue;
		}
		outputs.push({
			slips: [to[i], to[i + 1], to[i + 2]],
			p2sh_public_key: slip2_key
		});
		i += 2;
	}

	return { inputs, outputs };
}

function createListingScript(app, { seller_publickey, store_publickey } = {}) {
	const script = {
		op: 'CHECKMULTISIG',
		m: 1,
		publickeys: [seller_publickey, store_publickey],
		msg: 'tx.from.p2sh.utxoset_key'
	};

	const hash = app.core.scripting.hash(script);
	const address = app.core.scripting.address(script);

	return {
		access_script: JSON.stringify(script),
		access_hash: hash,
		p2sh_address: address
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

module.exports = {
	createListingScript,
	parseAccessScript,
	returnP2SHTuples,
	executeListingScript
};
