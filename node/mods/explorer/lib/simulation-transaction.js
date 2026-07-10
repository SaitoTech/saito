/**
 * Parse a SAITO fee string for the simulation transaction control.
 * Returns { feeSaito } or { error }.
 */
function parseSimulationFeeSaito(raw) {
	const trimmed = String(raw ?? '').trim();
	if (!trimmed) {
		return { error: 'Enter a fee in SAITO.' };
	}

	if (!/^\d+(\.\d+)?$/.test(trimmed)) {
		return { error: 'Fee must be a non-negative number.' };
	}

	const feeSaito = Number(trimmed);
	if (!Number.isFinite(feeSaito) || feeSaito < 0) {
		return { error: 'Fee must be zero or greater.' };
	}

	return { feeSaito: trimmed };
}

/**
 * Browser Add Fee flow:
 *   wallet create → sign → propagateTransaction
 */
async function addFeeTransaction(app, feeSaito, onStep) {
	const report = (step, ok) => {
		if (typeof onStep === 'function') {
			onStep(step, ok);
		}
	};

	const parsed = parseSimulationFeeSaito(feeSaito);
	if (parsed.error) {
		throw new Error(parsed.error);
	}

	const feeNolan = app.wallet.convertSaitoToNolan(parsed.feeSaito);
	const publicKey = await app.wallet.getPublicKey();
	const newtx = await app.wallet.createUnsignedTransaction(
		publicKey,
		BigInt(0),
		feeNolan
	);
	await newtx.sign();

	if (!newtx.signature) {
		report('created', false);
		throw new Error('Transaction was not signed.');
	}
	report('created', true);

	try {
		await app.network.propagateTransaction(newtx);
	} catch (err) {
		report('accepted', false);
		throw err;
	}
	report('accepted', true);

	return { tx: newtx };
}

module.exports = {
	parseSimulationFeeSaito,
	addFeeTransaction,
};
