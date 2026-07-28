const ORDER_STATUS_PENDING = 'pending';
const ORDER_STATUS_SETTLING = 'settling';
const ORDER_STATUS_FULFILLED = 'fulfilled';
const ORDER_STATUS_UNFULFILLABLE = 'unfulfillable';

class Order {
  constructor(data = {}) {
    this.id = data.id ?? 0;
    this.order_tx_sig = data.order_tx_sig || data.signature || '';
    this.signature = this.order_tx_sig;
    this.buyer = data.buyer || '';
    this.nft_id = data.nft_id || '';
    this.price = Number(data.price ?? 0);
    this.quantity = Number(data.quantity ?? 1);

    this.payment_tx_sig = data.payment_tx_sig || data.order_tx_sig || data.signature || '';
    this.payment_output_index = Number(data.payment_output_index ?? 0);
    this.payment_amount = Number(data.payment_amount ?? 0);
    this.utxo_slip = data.utxo_slip || data.payment_utxo_slip || '';
    this.access_hash = data.access_hash || data.payment_access_hash || '';
    this.access_script = data.access_script || data.payment_access_script || '';
    this.p2sh_address = data.p2sh_address || data.payment_p2sh_address || '';

    this.block_id_received = Number(
      data.block_id_received ?? data.block_id_added ?? data.block_id ?? 0
    );
    this.block_hash_received =
      data.block_hash_received || data.block_hash_added || data.block_hash || '';
    this.transaction_id_received = Number(
      data.transaction_id_received ?? data.transaction_id_added ?? data.transaction_id ?? 0
    );
    this.longest_chain_received = data.longest_chain_received ?? data.longest_chain_added ?? 1;

    this.settlement_tx_sig = data.settlement_tx_sig || '';

    this.block_id_fulfilled = Number(data.block_id_fulfilled ?? 0);
    this.block_hash_fulfilled = data.block_hash_fulfilled || '';
    this.transaction_id_fulfilled = Number(data.transaction_id_fulfilled ?? 0);
    this.longest_chain_fulfilled = data.longest_chain_fulfilled ?? 0;

    this.attempts = Number(data.attempts ?? 0);
    this.status = data.status || ORDER_STATUS_PENDING;

    this.created_at = data.created_at || 0;
    this.updated_at = data.updated_at || data.created_at || 0;
  }

  isReceivedOnChain() {
    return Number(this.longest_chain_received) === 1;
  }

  isFulfilledOnChain() {
    return Number(this.block_id_fulfilled) > 0 && Number(this.longest_chain_fulfilled) === 1;
  }

  isOnLongestChain() {
    return this.isReceivedOnChain();
  }

  isPending() {
    return this.status === ORDER_STATUS_PENDING;
  }

  isSettling() {
    return this.status === ORDER_STATUS_SETTLING;
  }

  isFulfilled() {
    return this.status === ORDER_STATUS_FULFILLED;
  }

  isUnfulfillable() {
    return this.status === ORDER_STATUS_UNFULFILLABLE;
  }

  isOpen() {
    return this.isReceivedOnChain() && (this.isPending() || this.isSettling());
  }

  isProcessable() {
    return (
      this.isReceivedOnChain() &&
      !this.isFulfilledOnChain() &&
      !this.isUnfulfillable() &&
      this.isPending() &&
      !this.settlement_tx_sig
    );
  }

  isAwaitingSettlementConfirmation() {
    return this.isSettling() && this.settlement_tx_sig && Number(this.block_id_fulfilled) === 0;
  }

  isOrphanedSettlement() {
    return (
      this.isSettling() &&
      Number(this.block_id_fulfilled) > 0 &&
      Number(this.longest_chain_fulfilled) === 0
    );
  }

  toInsertParams() {
    const now = Date.now();
    return {
      $order_tx_sig: this.order_tx_sig,
      $buyer: this.buyer,
      $nft_id: this.nft_id,
      $price: Number(this.price ?? 0),
      $quantity: Number(this.quantity ?? 1),
      $payment_tx_sig: this.payment_tx_sig,
      $payment_output_index: Number(this.payment_output_index ?? 0),
      $payment_amount: Number(this.payment_amount ?? 0),
      $utxo_slip: this.utxo_slip || '',
      $access_hash: this.access_hash || '',
      $access_script: this.access_script || '',
      $p2sh_address: this.p2sh_address || '',
      $block_id_received: Number(this.block_id_received ?? 0),
      $block_hash_received: this.block_hash_received || '',
      $transaction_id_received: Number(this.transaction_id_received ?? 0),
      $longest_chain_received: this.longest_chain_received ?? 1,
      $settlement_tx_sig: this.settlement_tx_sig || '',
      $block_id_fulfilled: Number(this.block_id_fulfilled ?? 0),
      $block_hash_fulfilled: this.block_hash_fulfilled || '',
      $transaction_id_fulfilled: Number(this.transaction_id_fulfilled ?? 0),
      $longest_chain_fulfilled: this.longest_chain_fulfilled ?? 0,
      $attempts: Number(this.attempts ?? 0),
      $status: this.status || ORDER_STATUS_PENDING,
      $created_at: this.created_at || now,
      $updated_at: this.updated_at || now
    };
  }
}

module.exports = Order;
module.exports.ORDER_STATUS_PENDING = ORDER_STATUS_PENDING;
module.exports.ORDER_STATUS_SETTLING = ORDER_STATUS_SETTLING;
module.exports.ORDER_STATUS_FULFILLED = ORDER_STATUS_FULFILLED;
module.exports.ORDER_STATUS_UNFULFILLABLE = ORDER_STATUS_UNFULFILLABLE;
