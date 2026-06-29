const TransactionsTemplate = require('./transactions.template');

class Transactions {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.data = [
			{
				hash: '0xa71960b5...ac561bba',
				time: '11 secs ago',
				from: 'BuilderNet',
				to: 'SAITO Treasury',
				amount: '12.50 SAITO'
			},
			{
				hash: '0xc9d62882...17304ae',
				time: '11 secs ago',
				from: '0x167b4d33...ED8Cd',
				to: 'RedSquare Module',
				amount: '4.20 SAITO'
			},
			{
				hash: '0x68a43931...ced65d9',
				time: '11 secs ago',
				from: '0x90cCF9FD...CCBd7',
				to: '0x1c419f8f...a5A57',
				amount: '1.00 SAITO'
			},
			{
				hash: '0x8f1cac3a...aaec291',
				time: '11 secs ago',
				from: '0x91EC4eD9...B9889',
				to: '0x40AAf754...fd6Aca',
				amount: '0 SAITO'
			},
			{
				hash: '0x9dfa465b...eb2d667',
				time: '11 secs ago',
				from: '0xECe98Cb1...A2841',
				to: 'Store Module',
				amount: '0 SAITO'
			},
			{
				hash: '0x501dc7c4...d1e9410',
				time: '11 secs ago',
				from: '0xFF304C5A...eB2df',
				to: 'Arcade Module',
				amount: '0.50 SAITO'
			}
		];
	}

	render(container) {
		if (!container) {
			return;
		}

		this.app.browser.replaceElementContentBySelector(
			TransactionsTemplate({ transactions: this.data }),
			container
		);
	}
}

module.exports = Transactions;
