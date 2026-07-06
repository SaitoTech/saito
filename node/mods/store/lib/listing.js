class Listing {
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
		this.slip_id = data.slip_id ?? 0;

		this.block_id_listed = Number(data.block_id_listed ?? data.block_id ?? 0);
		this.block_hash_listed = data.block_hash_listed || data.block_hash || '';
		this.transaction_id_listed = Number(
			data.transaction_id_listed ?? data.transaction_id ?? 0
		);
		this.longest_chain_listed = data.longest_chain_listed ?? data.longest_chain ?? 1;

		this.block_id_sold = Number(data.block_id_sold ?? 0);
		this.block_hash_sold = data.block_hash_sold || '';
		this.transaction_id_sold = Number(data.transaction_id_sold ?? 0);
		this.longest_chain_sold = data.longest_chain_sold ?? 0;

		this.on_chain = data.on_chain ?? 1;
		this.utxo_slip1 = data.utxo_slip1 || '';
		this.utxo_slip2 = data.utxo_slip2 || '';
		this.utxo_slip3 = data.utxo_slip3 || '';
		this.created_at = data.created_at || 0;
		this.updated_at = data.updated_at || data.created_at || 0;

		// compatibility aliases used by fulfillment helpers
		this.block_id = this.block_id_listed;
		this.block_hash = this.block_hash_listed;
		this.transaction_id = this.transaction_id_listed;

		if (!this.p2sh_address && this.utxo_slip2) {
			try {
				const slip2 = JSON.parse(this.utxo_slip2);
				this.p2sh_address = slip2.publicKey || '';
			} catch (err) {
				// ignore malformed slip json
			}
		}
	}

	isListedOnChain() {
		return Number(this.longest_chain_listed) === 1;
	}

	isSoldOnChain() {
		return Number(this.block_id_sold) > 0 && Number(this.longest_chain_sold) === 1;
	}

	isSettlementPending() {
		return Number(this.block_id_sold) === -1 && Number(this.longest_chain_sold) === 0;
	}

	isAvailable() {
		return this.isListedOnChain() && !this.isSoldOnChain() && !this.isSettlementPending();
	}
}

module.exports = Listing;
