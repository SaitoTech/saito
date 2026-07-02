const { parseAccessScript } = require('./scripting');
const {
	isP2shPublicKey,
	slipPublicKey,
	listRustP2shInputIndexes,
	isBoundSlip,
	slipRequiresP2shWitness
} = require('./helpers');

const LOG_PREFIX = 'Store:fulfillment';

function logFulfillment(stage, message, data = null) {
	const payload = data == null ? '' : ` ${JSON.stringify(data)}`;
	console.log(`${LOG_PREFIX} [${stage}] ${message}${payload}`);
}

function summarizeSlipForApp(app, slip, index = null) {
	if (!slip) {
		return null;
	}
	return {
		index,
		type: slip.type,
		publicKey: slip.publicKey || '',
		amount: String(slip.amount ?? 0),
		blockId: String(slip.blockId ?? 0),
		txOrdinal: String(slip.txOrdinal ?? 0),
		utxoKey: slip.utxoKey || '',
		p2sh: isP2shPublicKey(app, slip.publicKey || '')
	};
}

function summarizeOrder(order) {
	if (!order) {
		return null;
	}
	return {
		id: order.id,
		order_tx_sig: order.order_tx_sig || order.signature || '',
		buyer: order.buyer || '',
		nft_id: order.nft_id || '',
		price: Number(order.price ?? 0),
		quantity: Number(order.quantity ?? 1),
		payment_tx_sig: order.payment_tx_sig || '',
		payment_output_index: Number(order.payment_output_index ?? 0),
		payment_amount: Number(order.payment_amount ?? 0),
		access_hash: order.access_hash || '',
		p2sh_address: order.p2sh_address || '',
		has_access_script: Boolean(order.access_script),
		status: order.status || '',
		attempts: Number(order.attempts ?? 0)
	};
}

function listP2shInputIndexes(app, tx) {
	return listRustP2shInputIndexes(app, tx);
}

function utf8ToHex(str) {
	if (str == null || str === '') {
		return '';
	}
	return Buffer.from(String(str), 'utf8').toString('hex');
}

function parseExecutableEntry(entry) {
	if (entry == null) {
		return null;
	}
	if (typeof entry === 'string') {
		return JSON.parse(entry);
	}
	return entry;
}

function scriptHashForExecutable(app, executable) {
	const locking = lockingViewFromExecutable(executable);
	if (!locking || !app?.core?.scripting?.hash) {
		return '';
	}
	try {
		return app.core.scripting.hash(locking);
	} catch (err) {
		return '';
	}
}

/**
 * Log exact script/witness parameters passed to or produced for RustScript evaluation.
 * Logging only — does not call the engine.
 */
function dumpRustScriptEngineCall(context = '', {
	locking_script = null,
	executable = null,
	executable_string = ''
} = {}) {
	const locking =
		locking_script ||
		(executable ? lockingViewFromExecutable(executable) : null);
	const locking_string = locking ? JSON.stringify(locking) : '';
	const witness_object = executable?.witness ?? null;
	const witness_string =
		witness_object != null ? JSON.stringify(witness_object) : '';
	const full_string =
		executable_string ||
		(executable != null ? JSON.stringify(executable) : '');

	console.log('');
	console.log('######################################################################');
	console.log('#################### RUSTSCRIPT ENGINE INPUT ####################');
	console.log('######################################################################');
	if (context) {
		console.log(`Context: ${context}`);
		console.log('');
	}
	console.log('SCRIPT (locking script, exact string):');
	console.log(locking_string);
	console.log('');
	console.log('SCRIPT HEX:');
	console.log(utf8ToHex(locking_string));
	console.log('');
	console.log('SCRIPT LENGTH:');
	console.log(String(locking_string.length));
	console.log('');
	console.log('WITNESS (exact string):');
	console.log(witness_string);
	console.log('');
	console.log('WITNESS HEX:');
	console.log(utf8ToHex(witness_string));
	console.log('');
	console.log('WITNESS LENGTH:');
	console.log(String(witness_string.length));
	console.log('');
	if (full_string && full_string !== locking_string) {
		console.log('EXECUTABLE (locking script + witness, exact string):');
		console.log(full_string);
		console.log('');
		console.log('EXECUTABLE HEX:');
		console.log(utf8ToHex(full_string));
		console.log('');
		console.log('EXECUTABLE LENGTH:');
		console.log(String(full_string.length));
		console.log('');
	}
	console.log('######################################################################');
	console.log('');
}

function inputRoleForFulfillmentDump(app, slip, slip_index, payment_pubkey = '') {
	if (slip_index === 0 && payment_pubkey && slip?.publicKey === payment_pubkey) {
		return 'payment';
	}
	if (isBoundSlip(slip)) {
		return 'bound';
	}
	if (isP2shPublicKey(app, slip?.publicKey || '')) {
		return 'nft-custody';
	}
	return 'other';
}

/**
 * Full access-script and input-mapping dump immediately before fulfillment sign.
 * Logging only — does not validate or modify the transaction.
 */
function dumpFulfillmentAccessScripts(app, tx, payment_pubkey = '') {
	if (!tx) {
		return;
	}

	const txmsg = tx.returnMessage?.() || tx.msg || {};
	const access_scripts = Array.isArray(txmsg.access_scripts) ? txmsg.access_scripts : [];
	const p2sh_indexes = listRustP2shInputIndexes(app, tx);
	const access_script_by_input = new Map();
	for (let i = 0; i < p2sh_indexes.length; i++) {
		access_script_by_input.set(p2sh_indexes[i], i);
	}

	console.log('');
	console.log('######################################################################');
	console.log('##################### FULFILLMENT ACCESS SCRIPTS ######################');
	console.log('######################################################################');
	console.log('');

	for (let n = 0; n < access_scripts.length; n++) {
		const slip_index = p2sh_indexes[n];
		const slip = tx.from?.[slip_index];
		const role = inputRoleForFulfillmentDump(app, slip, slip_index, payment_pubkey);
		const entry = access_scripts[n];
		const entry_string = typeof entry === 'string' ? entry : JSON.stringify(entry);

		let executable = null;
		try {
			executable = parseExecutableEntry(entry);
		} catch (err) {
			executable = null;
		}

		const locking = executable ? lockingViewFromExecutable(executable) : null;
		const locking_string = locking ? JSON.stringify(locking) : '';
		const witness_object = executable?.witness ?? null;
		const witness_string =
			witness_object != null ? JSON.stringify(witness_object) : '';
		const script_hash = executable ? scriptHashForExecutable(app, executable) : '';

		console.log('----------------------------------------------------------------------');
		console.log(`ACCESS SCRIPT #${n}`);
		console.log('----------------------------------------------------------------------');
		console.log('');
		console.log(`Input Index: ${slip_index}`);
		console.log('');
		console.log(`Role: ${role}`);
		console.log('');
		console.log(`Script Hash: ${script_hash}`);
		console.log('');
		console.log('SCRIPT (exact string)');
		console.log(locking_string);
		console.log('');
		console.log('SCRIPT HEX');
		console.log(utf8ToHex(locking_string));
		console.log('');
		console.log('SCRIPT LENGTH');
		console.log(String(locking_string.length));
		console.log('');
		console.log('WITNESS (exact string)');
		console.log(witness_string);
		console.log('');
		console.log('WITNESS HEX');
		console.log(utf8ToHex(witness_string));
		console.log('');
		console.log('WITNESS LENGTH');
		console.log(String(witness_string.length));
		console.log('');
		console.log('ACCESS_SCRIPTS ENTRY (exact string submitted on tx)');
		console.log(entry_string);
		console.log('');
		console.log('ACCESS_SCRIPTS ENTRY HEX');
		console.log(utf8ToHex(entry_string));
		console.log('');
		console.log('ACCESS_SCRIPTS ENTRY LENGTH');
		console.log(String(entry_string.length));
		console.log('');
		if (executable != null) {
			console.log('EXECUTABLE OBJECT (parsed JSON)');
			console.log(JSON.stringify(executable, null, 2));
			console.log('');
		}
	}

	console.log('######################################################################');
	console.log('######################## INPUT MAPPING ########################');
	console.log('######################################################################');
	console.log('');

	for (let i = 0; i < (tx.from || []).length; i++) {
		const slip = tx.from[i];
		const summary = summarizeSlipForApp(app, slip, i);
		const is_p2sh = slipRequiresP2shWitness(app, slip);
		const access_script_index = access_script_by_input.has(i)
			? access_script_by_input.get(i)
			: 'none';

		console.log(`INPUT #${i}`);
		console.log('');
		console.log(`Slip Type: ${summary?.type}`);
		console.log('');
		console.log(`Public Key: ${summary?.publicKey || ''}`);
		console.log('');
		console.log(`UTXO Key: ${summary?.utxoKey || ''}`);
		console.log('');
		console.log(`Amount: ${summary?.amount || '0'}`);
		console.log('');
		console.log(`Rust considers this P2SH: ${is_p2sh ? 'YES' : 'NO'}`);
		console.log('');
		console.log(`Access Script Index: ${access_script_index}`);
		console.log('');
		console.log('----------------------------------------------------------------------');
		console.log('');
	}

	console.log('######################################################################');
	console.log('');
}

function lockingViewFromExecutable(executable) {
	if (!executable || typeof executable !== 'object') {
		return null;
	}
	const locking = { ...executable };
	delete locking.witness;
	return locking;
}

function resolveWitnessMessage(script, slip) {
	const msg = script?.msg;
	if (typeof msg === 'string' && msg === 'tx.from.p2sh.utxoset_key') {
		return String(slip?.utxoKey || '');
	}
	if (typeof msg === 'string') {
		return msg;
	}
	return '';
}

function verifyCheckmultisigWitness(app, executable, slip) {
	const script = lockingViewFromExecutable(executable);
	if (!script || String(script.op || '').toUpperCase() !== 'CHECKMULTISIG') {
		return { ok: false, reason: 'unsupported script op' };
	}

	const publickeys = Array.isArray(script.publickeys) ? script.publickeys : [];
	const signatures = Array.isArray(executable?.witness?.signatures)
		? executable.witness.signatures
		: [];
	const threshold = Number(script.m) > 0 ? Number(script.m) : publickeys.length;
	const message = resolveWitnessMessage(script, slip);

	if (!message) {
		return { ok: false, reason: 'empty witness message' };
	}
	if (!signatures.length) {
		return { ok: false, reason: 'missing witness signatures' };
	}

	let valid = 0;
	const used = new Set();
	for (const signature of signatures) {
		for (const publickey of publickeys) {
			if (!publickey || used.has(publickey)) {
				continue;
			}
			try {
				if (app.crypto.verifyMessage(signature, publickey, message)) {
					used.add(publickey);
					valid += 1;
					break;
				}
			} catch (err) {
				// try next key
			}
		}
		if (valid >= threshold) {
			break;
		}
	}

	return {
		ok: valid >= threshold,
		reason: valid >= threshold ? '' : 'CHECKMULTISIG threshold not met',
		message,
		threshold,
		valid_signatures: valid,
		publickeys,
		slip_publicKey: slip?.publicKey || ''
	};
}

function verifyScriptCommitment(app, executable, slip) {
	const script = lockingViewFromExecutable(executable);
	if (!script || !app?.core?.scripting?.hash || !app?.core?.scripting?.address) {
		return { ok: true, skipped: true, reason: 'scripting hash API unavailable' };
	}

	try {
		const script_hash = app.core.scripting.hash(script);
		const script_address = app.core.scripting.address(script);
		const expected_pubkey = slipPublicKey(app, script_address) || script_address;
		const slip_pubkey = slip?.publicKey || '';
		const ok = expected_pubkey === slip_pubkey;
		return {
			ok,
			reason: ok ? '' : 'script hash does not match input publicKey',
			script_hash,
			script_address,
			expected_pubkey,
			slip_pubkey
		};
	} catch (err) {
		return { ok: false, reason: `script commitment check failed: ${err?.message || err}` };
	}
}

async function evaluateWitnessScript(app, executable) {
	if (!app?.core?.scripting?.evaluate) {
		return { ok: null, skipped: true, reason: 'app.core.scripting.evaluate unavailable' };
	}
	try {
		const result = await app.core.scripting.evaluate(executable);
		return { ok: result === 1, result };
	} catch (err) {
		return { ok: false, reason: err?.message || String(err) };
	}
}

/**
 * Best-effort pre-broadcast validation for settlement txs.
 * Mirrors key P2SH checks consensus performs; not a full duplicate of saito-core validate().
 */
async function validateSettlementPreflight(app, tx) {
	const errors = [];
	const checks = [];

	if (!tx) {
		return { valid: false, errors: ['transaction missing'], checks };
	}

	const txmsg = tx.returnMessage?.() || tx.msg || {};
	const p2sh_indexes = listP2shInputIndexes(app, tx);
	const access_scripts = Array.isArray(txmsg.access_scripts) ? txmsg.access_scripts : [];

	checks.push({
		check: 'input_output_counts',
		from_count: (tx.from || []).length,
		to_count: (tx.to || []).length,
		type: tx.type,
		request: txmsg.request || '',
		module: txmsg.module || ''
	});

	if (!p2sh_indexes.length) {
		checks.push({ check: 'p2sh_inputs', count: 0 });
	} else {
		checks.push({
			check: 'p2sh_inputs',
			count: p2sh_indexes.length,
			indexes: p2sh_indexes,
			slips: p2sh_indexes.map((i) => summarizeSlipForApp(app, tx.from[i], i))
		});
	}

	if (p2sh_indexes.length && access_scripts.length !== p2sh_indexes.length) {
		errors.push(
			`access_scripts length ${access_scripts.length} does not match P2SH input count ${p2sh_indexes.length}`
		);
	}

	const first_witness_utxo = p2sh_indexes.length
		? String(tx.from[p2sh_indexes[0]]?.utxoKey || '')
		: '';

	for (let i = 0; i < p2sh_indexes.length; i++) {
		const slip_index = p2sh_indexes[i];
		const slip = tx.from[slip_index];
		const witness_entry = access_scripts[i];
		const input_utxo = String(slip?.utxoKey || '');

		if (i > 0 && first_witness_utxo !== input_utxo) {
			checks.push({
				check: 'witness_message_mismatch',
				input_index: slip_index,
				input_utxo,
				witness_signed_utxo: first_witness_utxo,
				note: 'attachP2shAccessScripts signs all witnesses with first P2SH input utxoKey'
			});
		}

		if (!witness_entry) {
			errors.push(`missing access_scripts[${i}] for input #${slip_index}`);
			continue;
		}

		let executable = null;
		try {
			executable =
				typeof witness_entry === 'string' ? JSON.parse(witness_entry) : witness_entry;
		} catch (err) {
			errors.push(`access_scripts[${i}] is not valid JSON`);
			continue;
		}

		const commitment = verifyScriptCommitment(app, executable, slip);
		checks.push({ check: 'script_commitment', input_index: slip_index, ...commitment });
		if (!commitment.ok && !commitment.skipped) {
			errors.push(`input #${slip_index}: ${commitment.reason}`);
		}

		const multisig = verifyCheckmultisigWitness(app, executable, slip);
		checks.push({ check: 'checkmultisig_witness', input_index: slip_index, ...multisig });
		if (!multisig.ok) {
			errors.push(`input #${slip_index}: ${multisig.reason}`);
		}

		const evaluated = await evaluateWitnessScript(app, executable);
		checks.push({ check: 'scripting_evaluate', input_index: slip_index, ...evaluated });
		if (evaluated.ok === false) {
			errors.push(
				`input #${slip_index}: app.core.scripting.evaluate returned ${evaluated.result ?? evaluated.reason}`
			);
		}
	}

	const valid = errors.length === 0;
	return { valid, errors, checks };
}

function roleForP2shInput(app, slip, slip_index, payment_pubkey = '') {
	if (slip_index === 0 && payment_pubkey && slip?.publicKey === payment_pubkey) {
		return 'payment';
	}
	if (isBoundSlip(slip)) {
		return 'bound';
	}
	if (isP2shPublicKey(app, slip?.publicKey || '')) {
		return 'nft-custody';
	}
	return 'p2sh';
}

/**
 * Print access_script + witness payloads for manual validation in Rustscript.
 * Logs one block per P2SH input with locking script, executable JSON, and witness message.
 */
function logAccessScriptsForRustscript(app, tx, { operation = 'settlement', payment_pubkey = '' } = {}) {
	if (!tx) {
		logFulfillment('rustscript', 'transaction missing');
		return;
	}

	const txmsg = tx.returnMessage?.() || tx.msg || {};
	const access_scripts = Array.isArray(txmsg.access_scripts) ? txmsg.access_scripts : [];
	const p2sh_indexes = listP2shInputIndexes(app, tx);

	if (!p2sh_indexes.length) {
		logFulfillment('rustscript', `${operation}: no P2SH inputs`);
		return;
	}

	const witness_message = String(tx.from[p2sh_indexes[0]]?.utxoKey || '');

	console.log('');
	console.log(`========== Store P2SH / Rustscript (${operation}) ==========`);
	console.log(`P2SH inputs: ${p2sh_indexes.length}`);
	console.log(
		`Witness message used to sign (from first P2SH input utxoKey, index ${p2sh_indexes[0]}):`
	);
	console.log(witness_message || '(empty)');
	console.log('');

	for (let i = 0; i < p2sh_indexes.length; i++) {
		const slip_index = p2sh_indexes[i];
		const slip = tx.from[slip_index];
		const role = roleForP2shInput(app, slip, slip_index, payment_pubkey);
		const witness_entry = access_scripts[i];
		const slip_summary = summarizeSlipForApp(app, slip, slip_index);

		console.log(`----- ${role} — from[${slip_index}] — access_scripts[${i}] -----`);
		console.log('Input slip:', JSON.stringify(slip_summary, null, 2));

		if (!witness_entry) {
			console.log('MISSING access_scripts entry');
			console.log('');
			continue;
		}

		let executable = null;
		try {
			executable =
				typeof witness_entry === 'string' ? JSON.parse(witness_entry) : witness_entry;
		} catch (err) {
			console.log('INVALID access_scripts JSON:', witness_entry);
			console.log('');
			continue;
		}

		const locking_script = lockingViewFromExecutable(executable);
		const resolved_message = resolveWitnessMessage(locking_script, slip);

		console.log('');
		console.log('Locking script (canonical, no witness):');
		console.log(JSON.stringify(locking_script, null, 2));
		console.log('');
		console.log('Executable with witness (paste into Rustscript unlock / evaluate):');
		console.log(JSON.stringify(executable, null, 2));
		console.log('');
		console.log('tx.msg.access_scripts entry (exact submitted string):');
		console.log(
			typeof witness_entry === 'string' ? witness_entry : JSON.stringify(witness_entry)
		);
		console.log('');
		console.log('Witness details:');
		console.log(
			JSON.stringify(
				{
					signed_with_first_p2sh_utxoKey: witness_message,
					resolved_from_this_input_utxoKey: resolved_message,
					witness: executable?.witness || null,
					commitment: verifyScriptCommitment(app, executable, slip)
				},
				null,
				2
			)
		);
		console.log('');
	}

	console.log(`========== end Store P2SH / Rustscript (${operation}) ==========`);
	console.log('');
}

function logSettlementTransaction(app, tx, label = 'settlement', listing_count = 1) {
	if (!tx) {
		logFulfillment(label, 'transaction missing');
		return;
	}

	const txmsg = tx.returnMessage?.() || tx.msg || {};
	const p2sh_indexes = listP2shInputIndexes(app, tx);
	const access_scripts = Array.isArray(txmsg.access_scripts) ? txmsg.access_scripts : [];
	const payment_pubkey =
		slipPublicKey(app, txmsg.p2sh_address || '') || txmsg.p2sh_address || '';

	const input_roles = [];
	let listing_index = 0;
	let in_listing_triple = false;
	let triple_leg = 0;

	for (let i = 0; i < (tx.from || []).length; i++) {
		const slip = tx.from[i];
		if (i === 0) {
			input_roles.push('payment');
			continue;
		}
		if (!in_listing_triple) {
			in_listing_triple = true;
			triple_leg = 0;
		}
		const leg_names = ['bound', 'custody', 'bound'];
		input_roles.push(`listing #${listing_index} ${leg_names[triple_leg] || 'unknown'}`);
		triple_leg += 1;
		if (triple_leg >= 3) {
			in_listing_triple = false;
			listing_index += 1;
		}
	}

	console.log('');
	console.log('============================');
	console.log('SETTLEMENT TRANSACTION');
	console.log('============================');
	console.log('');
	console.log('INPUTS');

	for (let i = 0; i < (tx.from || []).length; i++) {
		const slip = tx.from[i];
		const summary = summarizeSlipForApp(app, slip, i);
		console.log(`- input index: ${i}`);
		console.log(`  slip type: ${summary?.type}`);
		console.log(`  public key: ${summary?.publicKey || ''}`);
		console.log(`  utxo key: ${summary?.utxoKey || ''}`);
		console.log(`  amount: ${summary?.amount || '0'}`);
		console.log(`  is P2SH (Rust): ${p2sh_indexes.includes(i)}`);
		console.log(`  source: ${input_roles[i] || 'unknown'}`);
		console.log('');
	}

	console.log('OUTPUTS');
	for (let i = 0; i < (tx.to || []).length; i++) {
		const slip = tx.to[i];
		const summary = summarizeSlipForApp(app, slip, i);
		console.log(`- output index: ${i}`);
		console.log(`  slip type: ${summary?.type}`);
		console.log(`  public key: ${summary?.publicKey || ''}`);
		console.log(`  amount: ${summary?.amount || '0'}`);
		console.log('');
	}

	console.log('ACCESS SCRIPTS');
	for (let i = 0; i < access_scripts.length; i++) {
		const slip_index = p2sh_indexes[i];
		const role = roleForP2shInput(app, tx.from[slip_index], slip_index, payment_pubkey);
		let script_hash = '';
		try {
			const executable =
				typeof access_scripts[i] === 'string'
					? JSON.parse(access_scripts[i])
					: access_scripts[i];
			const locking = lockingViewFromExecutable(executable);
			if (app?.core?.scripting?.hash) {
				script_hash = app.core.scripting.hash(locking);
			}
		} catch (err) {
			script_hash = '(parse error)';
		}
		console.log(`- index: ${i}`);
		console.log(`  attached for input: ${slip_index}`);
		console.log(`  role: ${role}`);
		console.log(`  script hash: ${script_hash}`);
		console.log('');
	}

	const expected_p2sh = 1 + Number(listing_count || 1);
	console.log(`Expected P2SH inputs: ${expected_p2sh}`);
	console.log(`Actual P2SH inputs: ${p2sh_indexes.length}`);
	console.log(`Access scripts: ${access_scripts.length}`);
	console.log('');
}

module.exports = {
	logFulfillment,
	summarizeOrder,
	summarizeSlipForApp,
	listP2shInputIndexes,
	validateSettlementPreflight,
	logAccessScriptsForRustscript,
	logSettlementTransaction,
	dumpFulfillmentAccessScripts,
	dumpRustScriptEngineCall
};
