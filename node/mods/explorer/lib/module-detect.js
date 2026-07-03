const { formatTransactionTypeName } = require('./transaction-types');

const REQUEST_TO_MODULE = {
	'chat message': 'Chat',
	'chat history': 'Chat',
	'request blocks': 'Explorer',
	'request block': 'Explorer',
	'request transaction': 'Explorer',
	'request supply': 'Explorer',
	'request address': 'Explorer',
	'send': 'Wallet',
	'receive': 'Wallet',
	'registry': 'Registry',
	'registry lookup': 'Registry',
	'register': 'Registry',
	'record': 'Registry',
	'store': 'Store',
	'store purchase': 'Store',
	'purchase': 'Store',
	'buy': 'Store',
	'sell': 'Store',
	'arcade create': 'Arcade',
	'arcade accept': 'Arcade',
	'gamemove': 'Arcade',
	'game': 'Arcade',
	'relay': 'Relay',
	'email': 'Email',
	'archive': 'Archive',
	'post': 'RedSquare',
	'like': 'RedSquare',
	'repost': 'RedSquare',
};

function detectTransactionModule(tx) {
	const txType = tx?.type ?? tx?.transaction_type;
	const typeName = formatTransactionTypeName(txType);

	if (typeName === 'Fee') return 'Fee';
	if (typeName === 'GoldenTicket') return 'GoldenTicket';
	if (typeName === 'ATR') return 'ATR';
	if (typeName === 'Issuance') return 'Issuance';
	if (typeName === 'BlockStake') return 'BlockStake';

	const msg = tx?.msg;
	if (msg && typeof msg === 'object') {
		if (msg.module && typeof msg.module === 'string') {
			return capitalizeFirst(msg.module);
		}

		if (msg.request && typeof msg.request === 'string') {
			const lower = msg.request.toLowerCase();
			if (REQUEST_TO_MODULE[lower]) {
				return REQUEST_TO_MODULE[lower];
			}
		}
	}

	if (typeName !== 'Normal' && typeName !== 'Unknown') {
		return typeName;
	}

	return 'Unknown';
}

function capitalizeFirst(str) {
	if (!str) return str;
	return str.charAt(0).toUpperCase() + str.slice(1);
}

module.exports = {
	detectTransactionModule,
};
