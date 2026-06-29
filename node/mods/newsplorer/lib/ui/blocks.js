const BlocksTemplate = require('./blocks.template');

class Blocks {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.data = [
			{
				number: '1,842,905',
				time: '11 secs ago',
				miner: 'BuilderNet',
				txns: '42',
				duration: '2 secs',
				reward: '0.125 SAITO'
			},
			{
				number: '1,842,904',
				time: '23 secs ago',
				miner: 'Saito Validator',
				txns: '38',
				duration: '2 secs',
				reward: '0.118 SAITO'
			},
			{
				number: '1,842,903',
				time: '35 secs ago',
				miner: '0xE556bF2A...0DD3C1F58',
				txns: '51',
				duration: '2 secs',
				reward: '0.131 SAITO'
			},
			{
				number: '1,842,902',
				time: '47 secs ago',
				miner: 'Archive Node',
				txns: '29',
				duration: '2 secs',
				reward: '0.102 SAITO'
			},
			{
				number: '1,842,901',
				time: '1 min ago',
				miner: 'Golden Ticket',
				txns: '64',
				duration: '2 secs',
				reward: '0.144 SAITO'
			},
			{
				number: '1,842,900',
				time: '1 min ago',
				miner: 'Routing Pool',
				txns: '33',
				duration: '2 secs',
				reward: '0.109 SAITO'
			}
		];
	}

	render(container) {
		if (!container) {
			return;
		}

		this.app.browser.replaceElementContentBySelector(
			BlocksTemplate({ blocks: this.data }),
			container
		);
	}
}

module.exports = Blocks;
