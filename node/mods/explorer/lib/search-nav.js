function normalizeSearchQuery(raw = '') {
	return String(raw || '').trim();
}

function decodedByteLength(app, value) {
	if (!value) {
		return 0;
	}

	if (/^[0-9a-fA-F]+$/.test(value)) {
		if (value.length % 2 !== 0) {
			return 0;
		}
		return value.length / 2;
	}

	try {
		if (app?.crypto?.fromBase58) {
			const hex = app.crypto.fromBase58(value);
			if (hex && hex.length % 2 === 0) {
				return hex.length / 2;
			}
		}
	} catch (err) {
		// not base58
	}

	return 0;
}

function classifySearchQuery(app, raw = '') {
	const query = normalizeSearchQuery(raw);
	if (!query) {
		return null;
	}

	const byteLength = decodedByteLength(app, query);

	if (byteLength === 33) {
		return { type: 'address', value: query };
	}

	if (byteLength === 32) {
		return { type: 'block', value: query };
	}

	return null;
}

module.exports = {
	normalizeSearchQuery,
	classifySearchQuery,
	decodedByteLength,
};
