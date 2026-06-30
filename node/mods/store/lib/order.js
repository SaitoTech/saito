class Order {
	constructor(data = {}) {
		this.id = data.id ?? 0;
		this.order_tx_sig = data.order_tx_sig || data.signature || '';
		this.signature = this.order_tx_sig;
		this.buyer = data.buyer || '';
		this.nft_id = data.nft_id || '';
		this.price = Number(data.price ?? 0);

		this.payment_tx_sig = data.payment_tx_sig || data.order_tx_sig || data.signature || '';
		this.payment_output_index = Number(data.payment_output_index ?? 0);
		this.payment_amount = Number(data.payment_amount ?? 0);

		this.block_id_added = Number(data.block_id_added ?? data.block_id ?? 0);
		this.block_hash_added = data.block_hash_added || data.block_hash || '';
		this.transaction_id_added = Number(data.transaction_id_added ?? data.transaction_id ?? 0);
		this.longest_chain_added = data.longest_chain_added ?? 1;

		this.settlement_tx_sig = data.settlement_tx_sig || '';

		this.block_id_fulfilled = Number(data.block_id_fulfilled ?? 0);
		this.block_hash_fulfilled = data.block_hash_fulfilled || '';
		this.transaction_id_fulfilled = Number(data.transaction_id_fulfilled ?? 0);
		this.longest_chain_fulfilled = data.longest_chain_fulfilled ?? 0;

		this.created_at = data.created_at || 0;
		this.updated_at = data.updated_at || data.created_at || 0;
	}

	isOpen() {
		return Number(this.longest_chain_added) === 1 && Number(this.longest_chain_fulfilled) === 0;
	}

	isFulfilled() {
		return Number(this.block_id_fulfilled) > 0 && Number(this.longest_chain_fulfilled) === 1;
	}

	toInsertParams() {
		const now = Date.now();
		return {
			$order_tx_sig: this.order_tx_sig,
			$buyer: this.buyer,
			$nft_id: this.nft_id,
			$price: Number(this.price ?? 0),
			$payment_tx_sig: this.payment_tx_sig,
			$payment_output_index: Number(this.payment_output_index ?? 0),
			$payment_amount: Number(this.payment_amount ?? 0),
			$block_id_added: Number(this.block_id_added ?? 0),
			$block_hash_added: this.block_hash_added || '',
			$transaction_id_added: Number(this.transaction_id_added ?? 0),
			$longest_chain_added: this.longest_chain_added ?? 1,
			$settlement_tx_sig: this.settlement_tx_sig || '',
			$block_id_fulfilled: Number(this.block_id_fulfilled ?? 0),
			$block_hash_fulfilled: this.block_hash_fulfilled || '',
			$transaction_id_fulfilled: Number(this.transaction_id_fulfilled ?? 0),
			$longest_chain_fulfilled: this.longest_chain_fulfilled ?? 0,
			$created_at: this.created_at || now,
			$updated_at: this.updated_at || now
		};
	}
}

module.exports = Order;
