class Sale {
	constructor(data = {}) {
		this.id = data.id ?? 0;
		this.signature = data.signature || '';
		this.listing_id = data.listing_id || data.listing || '';
		this.buyer = data.buyer || '';
		this.seller = data.seller || '';
		this.quantity = data.quantity ?? 1;
		this.price = data.price ?? '';
		this.fee = data.fee ?? '';
		this.refund = data.refund || '';
		this.status = data.status ?? 0;
		this.onchain = data.onchain ?? 1;
		this.fulfillment_tx = data.fulfillment_tx || '';
		this.retry_count = data.retry_count ?? 0;
		this.last_attempt = data.last_attempt ?? 0;
		this.block_id = data.block_id ?? 0;
		this.block_hash = data.block_hash || '';
		this.transaction_id = data.transaction_id ?? 0;
		this.created_at = data.created_at || 0;
		this.updated_at = data.updated_at || data.created_at || 0;
	}

	toInsertParams(now = Date.now()) {
		return {
			$signature: this.signature,
			$buyer: this.buyer,
			$seller: this.seller,
			$listing_id: this.listing_id,
			$quantity: this.quantity,
			$price: this.price,
			$fee: this.fee,
			$refund: this.refund,
			$status: this.status,
			$onchain: this.onchain,
			$fulfillment_tx: this.fulfillment_tx,
			$retry_count: this.retry_count,
			$last_attempt: this.last_attempt,
			$block_id: this.block_id,
			$block_hash: this.block_hash,
			$transaction_id: this.transaction_id,
			$created_at: this.created_at || now,
			$updated_at: this.updated_at || now
		};
	}
}

module.exports = Sale;
