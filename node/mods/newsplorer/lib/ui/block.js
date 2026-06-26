const BlockTemplate = require('./block.template');

class Block {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
	}

	render() {}
}

module.exports = Block;
