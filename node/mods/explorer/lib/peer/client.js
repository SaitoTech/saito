/**
 * Single browser→Explorer-server off-chain request path.
 */
function sendExplorerPeerRequest(app, requestName, options = {}) {
	const { data, callback, peer } = options;
	const peerPublicKey = peer?.publicKey;

	return app.network.sendRequestAsTransaction(
		requestName,
		data,
		callback,
		peerPublicKey
	);
}

module.exports = {
	sendExplorerPeerRequest,
};
