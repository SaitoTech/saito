class Inventory {
	constructor(data = {}) {
		this.id = data.id ?? 0;
		this.signature = data.signature || '';
		this.nft_id = data.nft_id || '';
		this.seller = data.seller || '';
		this.quantity = data.quantity ?? 1;
		this.price = data.price ?? 0;
		this.access_hash = data.access_hash || '';
		this.access_script = data.access_script || '';
		this.p2sh_address = data.p2sh_address || '';
		this.block_id = data.block_id ?? 0;
		this.block_hash = data.block_hash || '';
		this.transaction_id = data.transaction_id ?? 0;
		this.slip_id = data.slip_id ?? 0;
		this.longest_chain = data.longest_chain ?? 1;
		this.on_chain = data.on_chain ?? 1;
		this.spent = data.spent ?? 0;
		this.utxo_slip1 = data.utxo_slip1 || '';
		this.utxo_slip2 = data.utxo_slip2 || '';
		this.utxo_slip3 = data.utxo_slip3 || '';
		this.created_at = data.created_at || 0;
		this.updated_at = data.updated_at || data.created_at || 0;
		if (!this.p2sh_address && this.utxo_slip2) {
			try {
				const slip2 = JSON.parse(this.utxo_slip2);
				this.p2sh_address = slip2.publicKey || '';
			} catch (err) {
				// ignore malformed slip json
			}
		}
	}
}

module.exports = Inventory;
