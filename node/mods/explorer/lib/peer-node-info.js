const { formatSaito, truncatePublicKey } = require('./explorer-format');

function parseBalanceSnapshotNolan(text) {
	if (!text || typeof text !== 'string') {
		return 0n;
	}

	let total = 0n;
	const lines = text.trim().split('\n');
	for (let i = 0; i < lines.length; i++) {
		const cols = lines[i].split(' ');
		if (cols.length < 5) {
			continue;
		}
		try {
			total += BigInt(cols[4]);
		} catch (err) {
			// skip malformed rows
		}
	}
	return total;
}

async function fetchPeerCount() {
	const response = await fetch('/json/peers');
	if (!response.ok) {
		throw new Error('peer stats unavailable');
	}
	const data = await response.json();
	const peers = Array.isArray(data?.peers) ? data.peers : [];
	return peers.length;
}

async function fetchBalanceNolan(publicKey) {
	if (!publicKey) {
		return null;
	}
	const response = await fetch(`/balance/${encodeURIComponent(publicKey)}`);
	if (!response.ok) {
		throw new Error('balance unavailable');
	}
	const text = await response.text();
	return parseBalanceSnapshotNolan(text);
}

function resolveEndpoint() {
	if (typeof window === 'undefined' || !window.location) {
		return '—';
	}
	return window.location.origin || window.location.host || '—';
}

async function buildPeerNodeInfo(app, mod) {
	const peer = mod?.explorerPeer;
	const publicKey = String(peer?.publicKey || '').trim();
	if (!publicKey) {
		return {
			ready: false,
			loading: true,
			error: null,
		};
	}

	const endpoint = resolveEndpoint();
	const [peerCount, balanceNolan] = await Promise.all([
		fetchPeerCount().catch(() => null),
		fetchBalanceNolan(publicKey).catch(() => null),
	]);

	return {
		ready: true,
		loading: false,
		error: null,
		publicKey,
		publicKeyDisplay: truncatePublicKey(publicKey, 16),
		balance: balanceNolan != null ? formatSaito(balanceNolan) : '—',
		peerCount: peerCount != null ? String(peerCount) : '—',
		endpoint,
		endpointDisplay: window?.location?.host || endpoint,
	};
}

module.exports = {
	buildPeerNodeInfo,
	parseBalanceSnapshotNolan,
};
