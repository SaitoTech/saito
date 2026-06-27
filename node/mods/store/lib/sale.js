class Sale {
	constructor(data = {}) {
		this.id = data.id ?? 0;
		this.signature = data.signature || '';
		this.listing_id = data.listing_id ?? 0;
		this.buyer = data.buyer || '';
		this.seller = data.seller || '';
		this.quantity = data.quantity ?? 1;
		this.price = data.price || '';
		this.fee = data.fee || '';
		this.refund = data.refund || '';
		this.status = data.status ?? 0;
		this.on_chain = data.on_chain ?? data.onchain ?? 1;
		this.outbound_tx = data.outbound_tx || data.fulfillment_tx || '';
		this.retry_count = data.retry_count ?? 0;
		this.last_attempt = data.last_attempt ?? 0;
		this.block_id = data.block_id ?? 0;
		this.block_hash = data.block_hash || '';
		this.transaction_id = data.transaction_id ?? 0;
		this.created_at = data.created_at || 0;
		this.updated_at = data.updated_at || data.created_at || 0;
	}

	toInsertParams() {
		return {
			$signature: this.signature,
			$buyer: this.buyer,
			$seller: this.seller,
			$listing_id: Number(this.listing_id),
			$quantity: Number(this.quantity) || 1,
			$price: String(this.price),
			$fee: String(this.fee),
			$refund: this.refund,
			$status: this.status,
			$on_chain: this.on_chain ?? 1,
			$outbound_tx: this.outbound_tx || '',
			$retry_count: this.retry_count ?? 0,
			$last_attempt: this.last_attempt ?? 0,
			$block_id: this.block_id ?? 0,
			$block_hash: this.block_hash || '',
			$transaction_id: this.transaction_id ?? 0,
			$created_at: this.created_at,
			$updated_at: this.updated_at
		};
	}
}

module.exports = Sale;
