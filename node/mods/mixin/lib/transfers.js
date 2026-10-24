const Transaction = require('../../../lib/saito/transaction').default;

// A submitted amount may differ from the cached quote by this fraction.
// One basis point of floating-point noise is inside this band; a different rate is not.
const QUOTE_TOLERANCE = 0.01;

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
      const observations = await this.fetchMixinTransfers();
      const observed = new Map(observations.map((item) => [item.transfer_id, item]));

      for (const row of await this.mod.database.getTransfers({ status: 'inbound_awaiting' })) {
        if (Number(row.created_at) < now - this.reservation_ms) {
          await this.mod.database.updateTransfer(row.id, { status: 'failed' });
        }
      }

      for (const row of await this.mod.database.getTransfersPendingInboundBroadcast(
        now - this.reservation_ms
      )) {
        const match = this.matchObservation(row, observed.get(row.id));
        if (!match) {
          continue;
        }
        const next =
          match.confirmations >= Number(row.inbound_confirmations_required)
            ? 'inbound_confirmed'
            : 'inbound_broadcast';
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
      }

      for (const row of await this.mod.database.getTransfers({ status: 'inbound_broadcast' })) {
        const match = this.matchObservation(row, observed.get(row.id));
        if (!match) {
          continue;
        }
        await this.mod.database.updateTransfer(row.id, {
          inbound_tx_hash: match.hash || row.inbound_tx_hash,
          inbound_tx_id: match.id || row.inbound_tx_id,
          inbound_sender: match.sender || row.inbound_sender,
          inbound_confirmations: match.confirmations
        });
      }

      for (const row of await this.mod.database.getTransfersPendingInboundConfirmed()) {
        await this.mod.database.updateTransfer(row.id, { status: 'inbound_confirmed' });
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

      let currentBlockId = 0;
      try {
        currentBlockId = Number((await this.app.blockchain?.getLatestBlockId?.()) || 0);
      } catch (err) {
        currentBlockId = 0;
      }

      if (!this.inclusion_checked) {
        const candidates = [];
        for (const status of ['outbound_awaiting', 'outbound_broadcast']) {
          const rows = await this.mod.database.getTransfers({ status });
          for (const row of rows) {
            if (row.outbound_tx_sig && !row.outbound_block_hash) {
              candidates.push(row);
            }
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

      for (const row of await this.mod.database.getTransfers({ status: 'inbound_confirmed' })) {
        if (row.outbound_tx_sig) {
          continue;
        }
        let available;
        let required;
        try {
          available = await this.app.wallet.getBalance();
          required = this.app.wallet.convertSaitoToNolan(row.outbound_amount);
          if (typeof available !== 'bigint' || typeof required !== 'bigint' || required <= 0n) {
            throw new Error('Invalid payout balance or amount');
          }
        } catch (err) {
          console.error(`Mixin transfer ${row.id} funding check failed:`, err);
          continue;
        }
        if (available < required) {
          try {
            const pending = await this.app.core?.wallet?.getPendingBalance?.();
            if (typeof pending === 'bigint' && pending >= required) {
              continue;
            }
          } catch (err) {
            console.error(`Mixin transfer ${row.id} pending balance check failed:`, err);
            continue;
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
          continue;
        }

        let recipient = row.recipient_publickey;
        let txmsg = null;
        if (row.payload) {
          const userTx = new Transaction();
          userTx.deserialize_from_web(this.app, row.payload);
          txmsg = userTx.returnMessage();
          if (txmsg?.p2sh_address) {
            const address = txmsg.p2sh_address;
            recipient =
              address.length === 66 && address.startsWith('00')
                ? this.app.crypto.toBase58(address)
                : address;
          }
        }
        const tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(recipient, required);
        if (txmsg) {
          tx.msg = txmsg;
        } else {
          tx.msg = {
            module: 'BuySaito',
            request: 'buysaito issuance',
            data: {
              id: row.id,
              requester_publickey: row.requester_publickey,
              recipient_publickey: row.recipient_publickey,
              inbound_ticker: row.inbound_ticker,
              inbound_amount: row.inbound_amount,
              outbound_amount: row.outbound_amount
            },
            memo: `${row.inbound_amount} ${row.inbound_ticker}`
          };
        }
        await tx.sign();
        await this.mod.database.updateTransfer(row.id, {
          status: 'outbound_awaiting',
          outbound_tx: tx.serialize_to_web(this.app),
          outbound_tx_sig: tx.signature,
          outbound_address: recipient,
          last_error: ''
        });
      }

      for (const row of await this.mod.database.getTransfersPendingOutboundBroadcast()) {
        if (row.outbound_block_hash) {
          await this.mod.database.updateTransfer(row.id, { status: 'outbound_broadcast' });
        }
      }

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
        const issued = {
          id: row.id,
          address: row.inbound_address,
          ticker: row.inbound_ticker,
          initiator_pubkey: row.requester_publickey,
          recipient_pubkey: row.recipient_publickey,
          issue_amount: row.outbound_amount,
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

      for (const row of await this.mod.database.getTransfersPendingOutboundBroadcast()) {
        if (row.outbound_block_hash) {
          continue;
        }
        try {
          const tx = new Transaction();
          tx.deserialize_from_web(this.app, row.outbound_tx);
          if (!tx.signature || tx.signature !== row.outbound_tx_sig) {
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
    } finally {
      this.running = false;
    }
  }

  async fetchMixinTransfers() {
    const awaiting = await this.mod.database.getTransfers({ status: 'inbound_awaiting' });
    const broadcast = await this.mod.database.getTransfers({ status: 'inbound_broadcast' });
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

  matchObservation(row, observation) {
    if (!observation) {
      return null;
    }
    const required = Number(row.inbound_confirmations_required || 0);
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
        confirmations: confirmed ? Math.max(confirmations, required) : confirmations
      };
    }
    return null;
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
    const open = existing.find((row) => OPEN_STATUSES.includes(row.status));
    if (open) {
      return this.reservationInstructions(open);
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
      if (rows.some((row) => OPEN_STATUSES.includes(row.status))) {
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
    const id = await this.mod.database.insertTransfer({
      purpose: 'buysaito',
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
      inbound_confirmations_required: Number(crypto.confirmations || 0),
      outbound_ticker: 'SAITO',
      outbound_amount: String(issueAmount),
      outbound_address: request.recipient_pubkey || request.recipient_publickey || requesterPublickey,
      outbound_confirmations_required: 0,
      created_at: now
    });

    return this.reservationInstructions({
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

  reservationInstructions(row) {
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
    for (const status of ['outbound_awaiting', 'outbound_broadcast']) {
      for (const row of await this.mod.database.getTransfers({ status })) {
        if (!row.outbound_tx_sig || row.outbound_block_hash || !signatures.has(row.outbound_tx_sig)) {
          continue;
        }
        const blockId = Number(block.id);
        await this.mod.database.updateTransfer(row.id, {
          outbound_block_id: blockId,
          outbound_block_hash: block.hash || '',
          outbound_confirmation_block_id: blockId + Number(row.outbound_confirmations_required || 0)
        });
      }
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
