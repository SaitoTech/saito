const email = require('./email');
const Transaction = require('../../../lib/saito/transaction').default;
const {
  createMigrationPayoutTransaction,
  receiveMigrationPayoutTransaction,
  createBuySaitoPayoutTransaction,
  receiveBuySaitoPayoutTransaction,
  restoreSavedSignedTransaction
} = require('./transactions');

// A submitted amount may differ from the cached quote by this fraction.
// One basis point of floating-point noise is inside this band; a different rate is not.
const QUOTE_TOLERANCE = 0.01;

function saitoPublicKey(app, value) {
  const key = String(value || '').trim();
  if (!key || typeof app?.crypto?.isPublicKey !== 'function' || !app.crypto.isPublicKey(key)) {
    return '';
  }
  return key;
}

function storePurchaseMessage(app, raw) {
  if (!raw) {
    return null;
  }
  try {
    const tx = new Transaction();
    if (typeof tx.deserialize_from_web === 'function') {
      tx.deserialize_from_web(app, raw);
    }
    const message = typeof tx.returnMessage === 'function' ? tx.returnMessage() : null;
    if (message?.module === 'Store' && message?.request === 'purchase-asset') {
      return message;
    }
  } catch (err) {
    return null;
  }
  return null;
}

function storePurchaseRecipient(app, message) {
  return saitoPublicKey(app, message?.refund) || saitoPublicKey(app, message?.buyer);
}

// Store purchases only. A Mixin deposit observation is evidence that the
// reserved address was paid. It does not apply BuySaito's quote match or
// migration's sender match, and it does not wait for additional confirmations.
function storePurchaseDeposit(row, observation) {
  if (!observation) {
    return null;
  }
  const reserved = Number(row.inbound_amount);
  const enough = (amount) =>
    amount > 0 && (!Number.isFinite(reserved) || reserved <= 0 || amount + 1e-9 >= reserved);
  const found = [];
  for (const snapshot of observation.snapshots || []) {
    const destination = snapshot?.deposit?.destination || snapshot?.receiver || '';
    if (!destination || destination !== row.inbound_address) {
      continue;
    }
    found.push({
      hash: snapshot.transaction_hash || '',
      id: snapshot.snapshot_id || '',
      sender: snapshot.deposit?.sender || '',
      amount: Number(snapshot.amount)
    });
  }
  for (const deposit of observation.deposits || []) {
    if (deposit?.destination && deposit.destination !== row.inbound_address) {
      continue;
    }
    found.push({
      hash: deposit.transaction_hash || '',
      id: deposit.deposit_id || deposit.transaction_id || '',
      sender: deposit.sender || '',
      amount: Number(deposit.amount)
    });
  }
  return found.find((item) => item.hash && enough(item.amount)) || null;
}

const OPEN_STATUSES = [
  'inbound_awaiting',
  'inbound_broadcast',
  'inbound_confirmed',
  'outbound_awaiting',
  'outbound_broadcast'
];

class Transfers {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.running = false;
    this.inclusion_checked = false;
    this.reservation_ms = 25 * 60 * 1000;
    this.quote_tolerance = QUOTE_TOLERANCE;
  }

  // outbound_confirmed is the completed SAITO inclusion. `succeeded` stays in the
  // schema for older rows and has no separate evidence, so this queue does not
  // write it.
  async processTransferQueue() {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const now = Date.now();
      const observations = await this.fetchInboundMixinPayments();
      const observed = new Map(observations.map((item) => [item.transfer_id, item]));

      for (const row of await this.mod.database.getTransfersPendingInboundBroadcast()) {
        if (row.outbound_tx_sig) {
          continue;
        }
        // BuySaito only. A reservation older than reservation_ms (25 minutes) is
        // failed because the quoted deposit was held for a limited time. Migration
        // deposits have no reservation and must not inherit this expiry.
        if (row.purpose === 'buysaito' && Number(row.created_at) < now - this.reservation_ms) {
          await this.mod.database.updateTransfer(row.id, { status: 'failed' });
          continue;
        }
        // Store purchases only. A reservation older than reservation_ms (25 minutes)
        // is failed because the quoted deposit was held for a limited time. This
        // expiry is not a generic transfer rule and must not apply to migration.
        if (row.purpose === 'store-purchase' && Number(row.created_at) < now - this.reservation_ms) {
          await this.mod.database.updateTransfer(row.id, { status: 'failed' });
          continue;
        }
        // Store purchases only. Mixin reports the deposit through this observation.
        // The payment is recorded immediately, without BuySaito or migration matching
        // and without additional inbound confirmations.
        if (row.purpose === 'store-purchase') {
          const evidence = storePurchaseDeposit(row, observed.get(row.id));
          if (evidence) {
            await this.recordStorePurchaseInboundPayment(row, evidence);
          }
          continue;
        }
        const match = this.findMatchingInboundPayment(row, observed.get(row.id));
        if (!match?.hash) {
          continue;
        }
        const confirmed = match.confirmations >= Number(row.inbound_confirmations_required || 0);
        const next = confirmed ? 'inbound_confirmed' : 'inbound_broadcast';
        if (row.purpose === 'migration') {
          const duplicate = await this.mod.migration.findByInboundHash(match.hash);
          // Migration only. The same external deposit hash cannot fund a second
          // migration row. The open row keeps its status. This duplicate-deposit
          // rule must not be applied to BuySaito or any other purpose.
          if (duplicate && String(duplicate.id) !== String(row.id)) {
            await this.mod.database.updateTransfer(row.id, {
              last_error: 'Migration deposit was already recorded'
            });
            continue;
          }
          let allocated;
          try {
            // Migration only. The payout is the received amount, and amounts above
            // the migration cap are refused. BuySaito uses its reservation quote
            // instead, so this cap must not be applied to other purposes.
            allocated = this.mod.migration.allocationForDeposit(match.amount);
          } catch (err) {
            await this.mod.database.updateTransfer(row.id, {
              status: 'failed',
              last_error: err.message,
              inbound_tx_hash: match.hash
            });
            email.sendStatusEmail(this.app, 0, { ...row, inbound_amount: match.amount }, err.message);
            await email.sendFailureNotice(this.app, row.recipient_publickey || row.requester_publickey);
            this.mod.creditDepositAddress?.(row.inbound_address, match.amount, match.hash);
            continue;
          }
          await this.mod.database.updateTransfer(row.id, {
            status: next,
            inbound_amount: String(allocated),
            outbound_amount: String(allocated),
            outbound_ticker: 'SAITO',
            inbound_tx_hash: match.hash,
            inbound_tx_id: match.id || '',
            inbound_sender: match.sender || row.inbound_sender,
            inbound_confirmations: match.confirmations,
            inbound_received_at: row.inbound_received_at || now,
            last_error: ''
          });
          this.mod.creditDepositAddress?.(row.inbound_address, match.amount, match.hash);
          continue;
        }
        // BuySaito only. The matched deposit is evidence for the quote already
        // stored on the row; this update does not change those amounts. The
        // payment-detected notice is a BuySaito client message and must not be
        // sent for migration or any other purpose.
        if (row.purpose === 'buysaito') {
          await this.mod.database.updateTransfer(row.id, {
            status: next,
            inbound_tx_hash: match.hash,
            inbound_tx_id: match.id,
            inbound_sender: match.sender,
            inbound_confirmations: match.confirmations,
            inbound_received_at: row.inbound_received_at || now
          });
          const detected = {
            id: row.id,
            address: row.inbound_address,
            ticker: row.inbound_ticker,
            status: next === 'inbound_confirmed' ? 'confirmed' : 'pending',
            initiator_pubkey: row.requester_publickey
          };
          this.app.network.sendRequestAsTransaction(
            'buysaito payment detected',
            detected,
            null,
            row.requester_publickey
          );
          this.app.connection.emit('saito-purchase-payment-detected', detected);
          this.mod.creditDepositAddress?.(
            row.inbound_address,
            match.amount || row.inbound_amount,
            match.hash
          );
        }
      }

      for (const row of await this.mod.database.getTransfers({
        status: 'inbound_broadcast',
        mode: 'automatic',
        excluded: 0
      })) {
        if (row.outbound_tx_sig) {
          continue;
        }
        // Store purchases only. They are confirmed by recordStorePurchaseInboundPayment
        // and must not be refreshed by BuySaito or migration deposit matching.
        if (row.purpose === 'store-purchase') {
          continue;
        }
        const match = this.findMatchingInboundPayment(row, observed.get(row.id));
        if (!match) {
          continue;
        }
        // Migration only. An accepted allocation stays at the stored amount.
        // A later observation can refresh confirmations for that same deposit,
        // and must not replace the amount or satisfy a BuySaito quote rule.
        if (row.purpose === 'migration') {
          if (row.inbound_tx_hash && match.hash && match.hash !== row.inbound_tx_hash) {
            continue;
          }
          await this.mod.database.updateTransfer(row.id, {
            inbound_tx_hash: match.hash || row.inbound_tx_hash,
            inbound_tx_id: match.id || row.inbound_tx_id,
            inbound_sender: match.sender || row.inbound_sender,
            inbound_confirmations: match.confirmations
          });
          continue;
        }
        // BuySaito only. Confirmation progress is updated from the quoted
        // deposit. This refresh must not rewrite the reserved amounts or run
        // migration allocation.
        if (row.purpose === 'buysaito') {
          await this.mod.database.updateTransfer(row.id, {
            inbound_tx_hash: match.hash || row.inbound_tx_hash,
            inbound_tx_id: match.id || row.inbound_tx_id,
            inbound_sender: match.sender || row.inbound_sender,
            inbound_confirmations: match.confirmations
          });
        }
      }

      for (const row of await this.mod.database.getTransfersPendingInboundConfirmed()) {
        await this.mod.database.updateTransfer(row.id, { status: 'inbound_confirmed' });
        // BuySaito only. The confirmed payment notice tells the purchase client
        // that the quoted deposit has enough confirmations. Migration does not
        // use this notice, and the status change above is not BuySaito-specific.
        if (row.purpose !== 'buysaito') {
          continue;
        }
        const detected = {
          id: row.id,
          address: row.inbound_address,
          ticker: row.inbound_ticker,
          status: 'confirmed',
          initiator_pubkey: row.requester_publickey
        };
        this.app.network.sendRequestAsTransaction(
          'buysaito payment detected',
          detected,
          null,
          row.requester_publickey
        );
        this.app.connection.emit('saito-purchase-payment-detected', detected);
      }

      // A missing or unusable block id skips issuance and outbound confirmation.
      // It is not replaced with block 0, which would authorize a threshold of 0.
      let currentBlockId = null;
      if (typeof this.app.blockchain?.getLatestBlockId === 'function') {
        try {
          const raw = await this.app.blockchain.getLatestBlockId();
          const blockId = typeof raw === 'bigint' ? Number(raw) : raw;
          if (Number.isInteger(blockId) && blockId >= 0 && Number.isSafeInteger(blockId)) {
            currentBlockId = blockId;
          }
        } catch (err) {
          currentBlockId = null;
        }
      }

      if (!this.inclusion_checked) {
        const candidates = [];
        const awaitingSigned = await this.mod.database.getTransfersPendingOutboundBroadcast();
        const broadcastSigned = await this.mod.database.getTransfers({ status: 'outbound_broadcast' });
        for (const row of [...(awaitingSigned || []), ...(broadcastSigned || [])]) {
          if (row.outbound_tx_sig && !row.outbound_block_hash) {
            candidates.push(row);
          }
        }
        if (!this.app.blockchain?.getLatestBlockId || !candidates.length) {
          this.inclusion_checked = true;
        } else {
          const wanted = new Map(candidates.map((row) => [row.outbound_tx_sig, row]));
          try {
            const latestId = Number(await this.app.blockchain.getLatestBlockId());
            for (let id = latestId; id > 0 && wanted.size; id--) {
              let hash = '';
              let block = null;
              try {
                hash = await this.app.blockchain.getLongestChainHashAtId(id);
                if (!hash) {
                  continue;
                }
                block = await this.app.blockchain.loadBlockAsync(String(hash));
                if (!block && this.app.blockchain.getBlock) {
                  block = await this.app.blockchain.getBlock(String(hash), true);
                }
              } catch (err) {
                continue;
              }
              if (!block) {
                continue;
              }
              for (const tx of block.transactions || []) {
                const row = wanted.get(tx?.signature);
                if (!row) {
                  continue;
                }
                const blockId = Number(block.id);
                await this.mod.database.updateTransfer(row.id, {
                  outbound_block_id: blockId,
                  outbound_block_hash: block.hash || hash,
                  outbound_confirmation_block_id:
                    blockId + Number(row.outbound_confirmations_required || 0),
                  status: 'outbound_broadcast'
                });
                wanted.delete(tx.signature);
              }
            }
            this.inclusion_checked = true;
          } catch (err) {
            console.error('Mixin transfer inclusion check failed:', err);
          }
        }
      }

      if (currentBlockId !== null) {
        for (const row of await this.mod.database.getTransfersPendingOutboundAwaiting(currentBlockId)) {
          try {
            await this.issueOutboundTransfer(row);
          } catch (err) {
            console.error(`Mixin transfer ${row.id} issuance failed:`, err);
          }
        }
      }

      for (const row of await this.mod.database.getTransfersPendingOutboundBroadcast()) {
        if (row.outbound_block_hash) {
          await this.mod.database.updateTransfer(row.id, { status: 'outbound_broadcast' });
        }
      }

      if (currentBlockId !== null) {
        for (const row of await this.mod.database.getTransfersPendingOutboundConfirmed(currentBlockId)) {
          let canonical = '';
          try {
            canonical = await this.app.blockchain.getLongestChainHashAtId(Number(row.outbound_block_id));
          } catch (err) {
            canonical = '';
          }
          if (!canonical || canonical !== row.outbound_block_hash) {
            await this.mod.database.updateTransfer(row.id, {
              status: 'outbound_awaiting',
              outbound_block_id: null,
              outbound_block_hash: '',
              outbound_confirmation_block_id: null
            });
            continue;
          }
          await this.mod.database.updateTransfer(row.id, { status: 'outbound_confirmed' });
          // Migration only. The team completion email is sent when a migration
          // payout is canonically confirmed. BuySaito uses its own issued notice,
          // and this email must not be sent for another purpose.
          if (row.purpose === 'migration') {
            email.sendStatusEmail(
              this.app,
              2,
              row,
              `TX Signature: ${row.outbound_tx_sig}</p><p>Block ID: ${row.outbound_block_id}`
            );
            continue;
          }
          // BuySaito only. `buysaito saito issued` tells the purchase client that
          // the quoted payout is in the canonical chain. Migration has its own
          // completion email, so this notice must not be sent for another purpose.
          if (row.purpose !== 'buysaito') {
            continue;
          }
          const issued = {
            id: row.id,
            address: row.inbound_address,
            ticker: row.inbound_ticker,
            initiator_pubkey: row.requester_publickey,
            recipient_pubkey: row.recipient_publickey,
            issue_amount: row.outbound_amount,
            paid: row.outbound_tx_sig,
            status: 'confirmed'
          };
          this.app.network.sendRequestAsTransaction(
            'buysaito saito issued',
            issued,
            null,
            row.requester_publickey
          );
          this.app.connection.emit('saito-purchase-saito-issued', issued);
        }
      }

      await this.rebroadcastSavedOutboundTransfers();
    } finally {
      this.running = false;
    }
  }

  async fetchInboundMixinPayments() {
    const awaiting = await this.mod.database.getTransfers({
      status: 'inbound_awaiting',
      mode: 'automatic',
      excluded: 0
    });
    const broadcast = await this.mod.database.getTransfers({
      status: 'inbound_broadcast',
      mode: 'automatic',
      excluded: 0
    });
    const rows = [...awaiting, ...broadcast];
    if (!rows.length) {
      return [];
    }

    const bundles = new Map();
    const memory = this.mod.accounts.getCredentials();
    if (memory?.user_id) {
      bundles.set(memory.user_id, memory);
    }
    let privateKey = '';
    try {
      privateKey = await this.app.wallet.getPrivateKey();
    } catch (err) {
      privateKey = '';
    }
    const stored = await this.mod.database.getCredentials(this.mod.publicKey);
    for (const saved of stored || []) {
      if (!saved.user_id || bundles.has(saved.user_id) || !privateKey) {
        continue;
      }
      try {
        bundles.set(
          saved.user_id,
          this.mod.accounts.decryptCredentials(saved.ciphertext, privateKey)
        );
      } catch (err) {
        console.error(`Mixin credentials for ${saved.user_id} could not be decrypted:`, err);
      }
    }

    const cache = new Map();
    const observations = [];
    for (const row of rows) {
      const credentials = bundles.get(row.inbound_mixin_user_id);
      if (!credentials) {
        observations.push({ transfer_id: row.id, deposits: [], snapshots: [] });
        continue;
      }
      const key = `${row.inbound_mixin_user_id}:${row.inbound_asset_id}:${row.inbound_address}`;
      if (!cache.has(key)) {
        const deposits = await this.mod.api.fetchDeposits(
          credentials,
          row.inbound_asset_id,
          row.inbound_address
        );
        const snapshots = await this.mod.api.fetchHistory(
          credentials,
          row.inbound_asset_id,
          row.created_at
        );
        cache.set(key, {
          deposits: deposits === false ? [] : deposits || [],
          snapshots: snapshots === false ? [] : snapshots || []
        });
      }
      observations.push({ transfer_id: row.id, ...cache.get(key) });
    }
    return observations;
  }

  findMatchingInboundPayment(row, observation) {
    if (!observation) {
      return null;
    }
    // Store purchases only. Inbound evidence is recorded by
    // recordStorePurchaseInboundPayment. BuySaito and migration matching
    // must not accept or reject these rows.
    if (row.purpose === 'store-purchase') {
      return null;
    }
    const required = Number(row.inbound_confirmations_required || 0);
    // Migration only. A deposit matches when its destination is this request's
    // collection address and its external sender is the declared chain address.
    // Internal Mixin transfers have no usable sender and do not match. BuySaito
    // matches a quoted amount instead, so this sender rule must not be applied
    // to another purpose.
    if (row.purpose === 'migration' && this.mod.migration) {
      const expected = String(row.inbound_sender || '').trim().toLowerCase();
      const sameSender = (value) => {
        const actual = String(value || '').trim().toLowerCase();
        return Boolean(expected && actual && actual === expected);
      };
      for (const snapshot of observation.snapshots || []) {
        const destination = snapshot?.deposit?.destination || '';
        if (!destination || destination !== row.inbound_address || !sameSender(snapshot?.deposit?.sender)) {
          continue;
        }
        const amount = Number(snapshot.amount);
        if (!(amount > 0)) {
          continue;
        }
        return {
          hash: snapshot.transaction_hash || '',
          id: snapshot.snapshot_id || '',
          sender: snapshot.deposit.sender,
          amount,
          confirmations: Number(snapshot.confirmations || 0)
        };
      }
      for (const deposit of observation.deposits || []) {
        if (deposit?.destination && deposit.destination !== row.inbound_address) {
          continue;
        }
        if (!sameSender(deposit?.sender)) {
          continue;
        }
        const amount = Number(deposit.amount);
        if (!(amount > 0)) {
          continue;
        }
        return {
          hash: deposit.transaction_hash || '',
          id: deposit.deposit_id || deposit.transaction_id || '',
          sender: deposit.sender,
          amount,
          confirmations: Number(deposit.confirmations || 0)
        };
      }
      return null;
    }
    // BuySaito only. The observed deposit must reach the quoted inbound_amount
    // reserved for this transfer. Migration accepts the received amount, so
    // this minimum must not be applied to migration or another purpose.
    if (row.purpose !== 'buysaito') {
      return null;
    }
    for (const snapshot of observation.snapshots) {
      const address = snapshot?.deposit?.destination || snapshot?.receiver || '';
      if (!address || address !== row.inbound_address) {
        continue;
      }
      if (Number(snapshot?.amount) < Number(row.inbound_amount)) {
        continue;
      }
      return {
        hash: snapshot.transaction_hash || '',
        id: snapshot.snapshot_id || '',
        sender: snapshot.deposit?.sender || '',
        amount: Number(snapshot.amount),
        confirmations: Math.max(Number(snapshot.confirmations || 0), required)
      };
    }
    for (const deposit of observation.deposits) {
      if (Number(deposit?.amount) < Number(row.inbound_amount)) {
        continue;
      }
      const confirmations = Number(deposit.confirmations || 0);
      const confirmed = deposit.status === 'confirmed' || confirmations >= required;
      return {
        hash: deposit.transaction_hash || '',
        id: deposit.deposit_id || deposit.transaction_id || '',
        sender: deposit.sender || '',
        amount: Number(deposit.amount),
        confirmations: confirmed ? Math.max(confirmations, required) : confirmations
      };
    }
    return null;
  }

  async recordStorePurchaseInboundPayment(row, evidence = {}) {
    if (!row || row.purpose !== 'store-purchase') {
      throw new Error('That transfer is not a Store purchase.');
    }
    if (Number(row.excluded) === 1) {
      throw new Error('That transfer is excluded from processing.');
    }
    if (row.outbound_tx_sig) {
      return row;
    }

    const hash = String(evidence.hash || '').trim();
    const inboundId = String(evidence.id || '').trim();
    const sender = String(evidence.sender || '').trim();
    const amount = Number(evidence.amount);
    if (!hash || !(amount > 0)) {
      throw new Error('Store purchase payment evidence is incomplete.');
    }

    const current = (await this.mod.database.getTransfers({ id: row.id }))?.[0] || row;
    if (current.inbound_tx_hash && current.inbound_tx_hash !== hash) {
      return current;
    }
    if (current.status !== 'inbound_awaiting' && current.inbound_tx_hash === hash) {
      return current;
    }
    if (current.status !== 'inbound_awaiting') {
      throw new Error(
        `Store purchase ${current.id} cannot be confirmed from status ${current.status}.`
      );
    }

    const now = Date.now();
    await this.mod.database.updateTransfer(current.id, {
      status: 'inbound_confirmed',
      inbound_tx_hash: hash,
      inbound_tx_id: inboundId,
      inbound_sender: sender,
      inbound_amount: String(amount),
      inbound_confirmations: 0,
      inbound_confirmations_required: 0,
      inbound_received_at: current.inbound_received_at || now,
      last_error: ''
    });
    this.mod.creditDepositAddress?.(current.inbound_address, amount, hash);

    const updated = (await this.mod.database.getTransfers({ id: current.id }))[0];
    const detected = {
      id: updated.id,
      address: updated.inbound_address,
      ticker: updated.inbound_ticker,
      status: 'confirmed',
      initiator_pubkey: updated.requester_publickey
    };
    this.app.network?.sendRequestAsTransaction?.(
      'buysaito payment detected',
      detected,
      null,
      updated.requester_publickey
    );
    this.app.connection?.emit?.('saito-purchase-payment-detected', detected);
    return updated;
  }

  async issueOutboundTransfer(row) {
    if (!row || row.outbound_tx_sig) {
      return row;
    }
    let amount = row.outbound_amount;
    // Migration only. The stored allocation is checked against the migration cap
    // again before signing. This does not read a new deposit or change the
    // accepted amount. BuySaito signs its reserved quote, so this cap must not
    // be applied to another purpose.
    if (row.purpose === 'migration') {
      amount = this.mod.migration.allocationForDeposit(row.outbound_amount);
    }
    const required = this.app.wallet.convertSaitoToNolan(amount);
    const available = await this.app.wallet.getBalance();
    // Migration only. A short treasury records insufficient_funds and emails
    // the operators. It does not wait on pending wallet balance. BuySaito has
    // its own pending-balance wait, and that wait must not be applied here.
    if (row.purpose === 'migration') {
      if (typeof available !== 'bigint' || typeof required !== 'bigint' || available < required) {
        if (row.last_error !== 'insufficient_funds') {
          await this.mod.database.updateTransfer(row.id, { last_error: 'insufficient_funds' });
          email.sendLowBalanceEmail(this.app, row.outbound_amount);
        }
        return (await this.mod.database.getTransfers({ id: row.id }))[0];
      }
      const tx = await createMigrationPayoutTransaction(this.app, row, amount);
      await this.mod.database.updateTransfer(row.id, {
        status: 'outbound_awaiting',
        outbound_tx: tx.serialize_to_web(this.app),
        outbound_tx_sig: tx.signature,
        outbound_amount: String(amount),
        outbound_address: row.recipient_publickey,
        outbound_ticker: 'SAITO',
        last_error: ''
      });
      email.sendStatusEmail(this.app, 1, { ...row, outbound_amount: String(amount) });
      return (await this.mod.database.getTransfers({ id: row.id }))[0];
    }
    // BuySaito only. Issuance uses the reserved outbound amount. A pending
    // balance that already covers it waits rather than failing the purchase.
    // A confirmed shortfall sends buysaito report error. Migration uses the
    // treasury email instead, so this wait and notice must not be generalized.
    if (row.purpose === 'buysaito') {
      if (typeof available !== 'bigint' || typeof required !== 'bigint' || required <= 0n) {
        throw new Error('Invalid payout balance or amount');
      }
      if (available < required) {
        try {
          const pending = await this.app.core?.wallet?.getPendingBalance?.();
          if (typeof pending === 'bigint' && pending >= required) {
            return row;
          }
        } catch (err) {
          console.error(`Mixin transfer ${row.id} pending balance check failed:`, err);
          return row;
        }
        if (row.last_error !== 'insufficient_funds') {
          await this.mod.database.updateTransfer(row.id, { last_error: 'insufficient_funds' });
          this.app.network.sendRequestAsTransaction(
            'buysaito report error',
            {
              code: 'insufficient_funds',
              id: row.id,
              ticker: row.inbound_ticker,
              address: row.inbound_address
            },
            null,
            row.requester_publickey
          );
        }
        return (await this.mod.database.getTransfers({ id: row.id }))[0];
      }
      const { tx, recipient } = await createBuySaitoPayoutTransaction(this.app, row, required);
      await this.mod.database.updateTransfer(row.id, {
        status: 'outbound_awaiting',
        outbound_tx: tx.serialize_to_web(this.app),
        outbound_tx_sig: tx.signature,
        outbound_address: recipient,
        last_error: ''
      });
      return (await this.mod.database.getTransfers({ id: row.id }))[0];
    }
    // Store purchases only. The reserved SAITO amount is issued with the saved
    // purchase message. Migration allocation and BuySaito pending-balance
    // notices do not apply to this purpose.
    if (row.purpose === 'store-purchase') {
      const message = storePurchaseMessage(this.app, row.payload);
      if (!storePurchaseRecipient(this.app, message)) {
        if (row.last_error !== 'Store purchase refund recipient is missing') {
          await this.mod.database.updateTransfer(row.id, {
            last_error: 'Store purchase refund recipient is missing'
          });
        }
        return (await this.mod.database.getTransfers({ id: row.id }))[0];
      }
      if (typeof available !== 'bigint' || typeof required !== 'bigint' || required <= 0n) {
        throw new Error('Invalid payout balance or amount');
      }
      if (available < required) {
        if (row.last_error !== 'insufficient_funds') {
          await this.mod.database.updateTransfer(row.id, { last_error: 'insufficient_funds' });
        }
        return (await this.mod.database.getTransfers({ id: row.id }))[0];
      }
      const { tx, recipient } = await createBuySaitoPayoutTransaction(this.app, row, required);
      await this.mod.database.updateTransfer(row.id, {
        status: 'outbound_awaiting',
        outbound_tx: tx.serialize_to_web(this.app),
        outbound_tx_sig: tx.signature,
        outbound_address: recipient,
        last_error: ''
      });
      return (await this.mod.database.getTransfers({ id: row.id }))[0];
    }
    // Any purpose other than migration, BuySaito, or a Store purchase. Neither payment constructor
    // applies, so the transfer stays unsigned. This guard must not skip a
    // migration or BuySaito row, and it must not stand in for either purpose's
    // own amount, balance, or reservation rules.
    console.error(`Mixin transfer ${row.id} has no outbound payment for purpose ${row.purpose}`);
    return row;
  }

  async rebroadcastSavedOutboundTransfers() {
    for (const row of await this.mod.database.getTransfersPendingOutboundBroadcast()) {
      if (row.outbound_block_hash) {
        continue;
      }
      try {
        const tx = restoreSavedSignedTransaction(this.app, row.outbound_tx, row.outbound_tx_sig);
        if (!tx) {
          throw new Error(`Transfer ${row.id} has invalid saved issuance data`);
        }
        try {
          await this.app.wallet.addTransactionToPending(tx);
        } catch (err) {
          console.error(`Mixin transfer ${row.id} was already pending:`, err);
        }
        await this.app.network.propagateTransaction(tx);
        await this.mod.database.updateTransfer(row.id, {
          status: 'outbound_broadcast',
          outbound_sent_at: Date.now(),
          last_error: ''
        });
      } catch (err) {
        console.error(`Mixin transfer ${row.id} broadcast failed:`, err);
        await this.mod.database.updateTransfer(row.id, {
          last_error: String(err?.message || err)
        });
      }
    }
  }

  async reserveAddress(requesterPublickey, request = {}) {
    const ticker = request.ticker;
    const crypto = this.mod.crypto_mods.find((item) => item.ticker === ticker);
    if (!crypto) {
      throw new Error(`Unsupported payment ticker: ${ticker}`);
    }
    if (!crypto.last_update || Date.now() - crypto.last_update > 300000) {
      await crypto.returnMixinNetworkInfo();
    }
    const erc = this.mod.crypto_mods.find((item) => item.ticker === 'ERC-SAITO');
    if (erc && (!erc.last_update || Date.now() - erc.last_update > 300000)) {
      await erc.returnMixinNetworkInfo();
    }

    const existing = await this.mod.database.getTransfers({
      requester_publickey: requesterPublickey,
      inbound_ticker: ticker,
      purpose: 'buysaito'
    });
    const open = existing.find((row) => !Number(row.excluded) && OPEN_STATUSES.includes(row.status));
    if (open) {
      return this.buildDepositReservationResponse(open);
    }

    if (
      request.price_usd != null ||
      request.usd_price != null ||
      request.saito_price != null ||
      request.rate != null ||
      request.exchange_rate != null
    ) {
      throw new Error('BuySaito: the exchange rate is set by the server');
    }
    const ercPrice = Number(erc?.price_usd);
    const usdPrice = Number(crypto.price_usd);
    const priceFresh = (item) => item?.last_update && Date.now() - item.last_update <= 300000;
    if (
      !priceFresh(crypto) ||
      !priceFresh(erc) ||
      !Number.isFinite(usdPrice) ||
      usdPrice <= 0 ||
      !Number.isFinite(ercPrice) ||
      ercPrice <= 0
    ) {
      throw new Error(`No price is available for ${ticker}`);
    }
    // The same spread and six-decimal deposit rounding used when the client quoted.
    const saitoPrice = Math.max(0.001, 1.1 * ercPrice);
    const submittedIssue = Number(request.issue_amount);
    const submittedDeposit = Number(request.expected_deposit);
    const hasIssue = Number.isFinite(submittedIssue) && submittedIssue > 0;
    const hasDeposit = Number.isFinite(submittedDeposit) && submittedDeposit > 0;
    if (!hasIssue && !hasDeposit) {
      throw new Error('BuySaito: invalid payment amount');
    }
    const depositForIssue = (issue) =>
      Math.ceil(((issue * saitoPrice) / usdPrice) * 1000000) / 1000000;
    const issueForDeposit = (deposit) => Math.floor((deposit * usdPrice) / saitoPrice);
    const closeEnough = (submitted, expected) =>
      Number.isFinite(submitted) &&
      Number.isFinite(expected) &&
      expected > 0 &&
      Math.abs(submitted - expected) <= expected * this.quote_tolerance;
    let issueAmount = 0;
    let expectedDeposit = 0;
    if (hasIssue && closeEnough(hasDeposit ? submittedDeposit : depositForIssue(submittedIssue), depositForIssue(submittedIssue))) {
      issueAmount = submittedIssue;
      expectedDeposit = depositForIssue(submittedIssue);
    } else if (hasDeposit && closeEnough(hasIssue ? submittedIssue : issueForDeposit(submittedDeposit), issueForDeposit(submittedDeposit))) {
      expectedDeposit = submittedDeposit;
      issueAmount = issueForDeposit(submittedDeposit);
    } else {
      throw new Error('BuySaito: the order does not match the current exchange rate');
    }
    if (
      !Number.isFinite(issueAmount) ||
      issueAmount <= 0 ||
      !Number.isFinite(expectedDeposit) ||
      expectedDeposit <= 0
    ) {
      throw new Error('BuySaito: invalid payment amount');
    }

    const privateKey = await this.app.wallet.getPrivateKey();
    const candidates = [];
    const memory = this.mod.accounts.getCredentials();
    if (memory?.user_id) {
      candidates.push(memory);
    }
    for (const saved of await this.mod.database.getCredentials(this.mod.publicKey)) {
      if (candidates.some((item) => item.user_id === saved.user_id)) {
        continue;
      }
      try {
        candidates.push(this.mod.accounts.decryptCredentials(saved.ciphertext, privateKey));
      } catch (err) {
        console.error(`Mixin credentials for ${saved.user_id} could not be decrypted:`, err);
      }
    }

    let selected = null;
    let address = '';
    for (const credentials of candidates) {
      let found = await this.mod.database.findAddress({
        assetId: crypto.asset_id,
        mixinUserId: credentials.user_id
      });
      if (!found?.address) {
        const created = await this.mod.accounts.createAddress(
          crypto.asset_id,
          crypto.chain_id,
          credentials
        );
        if (!created) {
          continue;
        }
        found = { address: created, user_id: credentials.user_id };
      }
      const rows = await this.mod.database.getTransfers({ inbound_address: found.address });
      if (rows.some((row) => !Number(row.excluded) && OPEN_STATUSES.includes(row.status))) {
        continue;
      }
      selected = credentials;
      address = found.address;
      break;
    }

    if (!selected) {
      const created = await this.mod.accounts.createAccount(this.mod.publicKey, { additional: true });
      selected = this.mod.accounts.decryptCredentials(created.ciphertext, privateKey);
      address = await this.mod.accounts.createAddress(crypto.asset_id, crypto.chain_id, selected);
      if (!address) {
        throw new Error(`Unable to create a ${ticker} deposit address`);
      }
    }

    const now = Date.now();
    if (typeof this.app.blockchain?.getLatestBlockId !== 'function') {
      throw new Error('Saito block height is unavailable');
    }
    let inboundConfirmationBlockId;
    try {
      const raw = await this.app.blockchain.getLatestBlockId();
      inboundConfirmationBlockId = typeof raw === 'bigint' ? Number(raw) : raw;
    } catch (err) {
      throw new Error('Saito block height is unavailable');
    }
    if (
      !Number.isInteger(inboundConfirmationBlockId) ||
      inboundConfirmationBlockId < 0 ||
      !Number.isSafeInteger(inboundConfirmationBlockId)
    ) {
      throw new Error('Saito block height is unavailable');
    }
    const purchase = storePurchaseMessage(this.app, request.tx);
    let purpose = 'buysaito';
    let inboundConfirmationsRequired = Number(crypto.confirmations || 0);
    if (purchase) {
      if (!storePurchaseRecipient(this.app, purchase)) {
        throw new Error('Store purchase refund recipient is missing');
      }
      purpose = 'store-purchase';
      inboundConfirmationsRequired = 0;
    }
    const id = await this.mod.database.insertTransfer({
      purpose,
      mode: 'automatic',
      payload: request.tx || '',
      request_id: request.request_id || '',
      requester_publickey: requesterPublickey,
      recipient_publickey: request.recipient_pubkey || request.recipient_publickey || requesterPublickey,
      status: 'inbound_awaiting',
      inbound_ticker: ticker,
      inbound_asset_id: crypto.asset_id,
      inbound_chain_id: crypto.chain_id || '',
      inbound_amount: String(expectedDeposit),
      inbound_address: address,
      inbound_mixin_user_id: selected.user_id,
      inbound_confirmations_required: inboundConfirmationsRequired,
      inbound_confirmation_block_id: inboundConfirmationBlockId,
      outbound_ticker: 'SAITO',
      outbound_amount: String(issueAmount),
      outbound_address: request.recipient_pubkey || request.recipient_publickey || requesterPublickey,
      outbound_confirmations_required: 0,
      created_at: now
    });

    return this.buildDepositReservationResponse({
      id,
      status: 'inbound_awaiting',
      requester_publickey: requesterPublickey,
      recipient_publickey: request.recipient_pubkey || request.recipient_publickey || requesterPublickey,
      outbound_amount: String(issueAmount),
      inbound_ticker: ticker,
      inbound_address: address,
      inbound_mixin_user_id: selected.user_id,
      inbound_amount: String(expectedDeposit),
      created_at: now,
      outbound_tx_sig: ''
    });
  }

  buildDepositReservationResponse(row) {
    let status = 'new';
    if (row.status === 'inbound_broadcast') {
      status = 'pending';
    } else if (row.status === 'inbound_confirmed') {
      status = 'confirmed';
    } else if (row.outbound_tx_sig && row.status !== 'outbound_confirmed') {
      status = 'issuing';
    }
    return {
      id: row.id,
      status,
      initiator_pubkey: row.requester_publickey,
      recipient_pubkey: row.recipient_publickey,
      issue_amount: row.outbound_amount,
      ticker: row.inbound_ticker,
      address: row.inbound_address,
      mixin_id: row.inbound_mixin_user_id,
      expected_deposit: row.inbound_amount,
      reserved_until: Number(row.created_at) + this.reservation_ms
    };
  }

  async releaseAddress(requesterPublickey, ticker) {
    const rows = await this.mod.database.getTransfers({
      requester_publickey: requesterPublickey,
      inbound_ticker: ticker,
      purpose: 'buysaito'
    });
    for (const row of rows) {
      if (row.status === 'inbound_awaiting') {
        await this.mod.database.updateTransfer(row.id, { status: 'cancelled' });
      }
    }
  }

  async onNewBlock(block, longestChain) {
    if (!longestChain || !Array.isArray(block?.transactions)) {
      await this.processTransferQueue();
      return;
    }
    const signatures = new Map();
    for (const tx of block.transactions) {
      if (tx?.signature) {
        signatures.set(tx.signature, tx);
      }
    }
    const awaitingSigned = await this.mod.database.getTransfersPendingOutboundBroadcast();
    const broadcastSigned = await this.mod.database.getTransfers({ status: 'outbound_broadcast' });
    for (const row of [...(awaitingSigned || []), ...(broadcastSigned || [])]) {
        const included = signatures.get(row.outbound_tx_sig);
        if (!row.outbound_tx_sig || row.outbound_block_hash || !included) {
          continue;
        }
        // Migration issuance is accepted only when the included transaction is
        // the saved migration payout. BuySaito uses its own issuance message,
        // including a preserved user payload, so this check must not accept a
        // BuySaito payment and must not be reused for another purpose.
        let accepted = false;
        if (row.purpose === 'migration') {
          accepted = receiveMigrationPayoutTransaction(included, row);
        } else if (row.purpose === 'buysaito') {
          // BuySaito only. The included transaction must be the saved BuySaito
          // payout, or the preserved user payload signed for that purchase.
          // Migration validates `migration issuance` instead.
          accepted = receiveBuySaitoPayoutTransaction(included, row);
        }
        if (!accepted) {
          continue;
        }
        const blockId = Number(block.id);
        await this.mod.database.updateTransfer(row.id, {
          outbound_block_id: blockId,
          outbound_block_hash: block.hash || '',
          outbound_confirmation_block_id: blockId + Number(row.outbound_confirmations_required || 0)
        });
    }
    await this.processTransferQueue();
  }

  async onChainReorganization(blockId, blockHash, longestChain) {
    if (longestChain) {
      await this.processTransferQueue();
      return;
    }
    for (const status of ['outbound_broadcast', 'outbound_confirmed']) {
      for (const row of await this.mod.database.getTransfers({ status })) {
        if (!row.outbound_tx_sig) {
          continue;
        }
        if (row.outbound_block_hash !== blockHash || Number(row.outbound_block_id) !== Number(blockId)) {
          continue;
        }
        await this.mod.database.updateTransfer(row.id, {
          status: 'outbound_awaiting',
          outbound_block_id: null,
          outbound_block_hash: '',
          outbound_confirmation_block_id: null
        });
      }
    }
    await this.processTransferQueue();
  }
}

module.exports = Transfers;
