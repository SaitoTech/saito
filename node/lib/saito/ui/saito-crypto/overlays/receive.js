const ReceiveTemplate = require('./receive.template');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');
const SaitoUser = require('./../../saito-user/saito-user');

class Receive {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);

    this.overlay.clickBackdropToClose = false;

    this.counter_party = new SaitoUser(
      this.app,
      this.mod,
      '#receive-crypto-request-container .counterparty-details'
    );

    this.app.connection.on('saito-crypto-receive-render-request', (details) => {
      this.render(details);
    });
    const { logNftArrival } = require('../../saito-nft/tx-review-dump');
    this.app.connection.on('on-nft-received', (obj = {}) => {
      logNftArrival(obj, 'receive-overlay on-nft-received');
      this.processExpectedPayment(obj, 'on-nft-received');
    });
    this.app.connection.on('on-payment-received', (obj = {}) => {
      console.log('[ReceiveOverlay] on-payment-received', obj);
      this.processExpectedPayment(obj, 'on-payment-received');
    });
  }

  /**
   * Snapshot where wallet.receivePayment may have registered expected hashes.
   */
  snapshotInboundStores(ticker = '') {
    const ti = this.app.options?.transfers_inbound;
    const crypto = this.app.options?.crypto?.[ticker];
    return {
      ticker,
      transfers_inbound_type: ti == null ? 'null' : Array.isArray(ti) ? 'array' : typeof ti,
      transfers_inbound_tickers:
        ti && typeof ti === 'object' && !Array.isArray(ti)
          ? Object.keys(ti)
          : Array.isArray(ti)
            ? `(array len ${ti.length})`
            : [],
      transfers_inbound_for_ticker: ti?.[ticker] ?? null,
      crypto_module_exists: !!this.app.wallet.returnCryptoModuleByTicker(ticker),
      crypto_transfers_inbound: crypto?.transfers_inbound ?? null
    };
  }

  processExpectedPayment(obj = {}, eventSource = 'unknown') {
    console.log(`[ReceiveOverlay] processExpectedPayment start (${eventSource})`, {
      eventSource,
      obj,
      mod: this.mod?.name ?? this.mod?.returnName?.() ?? null,
      mod_publicKey: this.mod?.publicKey?.slice?.(0, 12),
      has_game: !!this.mod?.game,
      expectHash: this.expectHash ?? null,
      expectAmount: this.expectAmount ?? null,
      payer: this.payer ?? null,
      overlay_open: !!document.getElementById('receive-crypto-request-container')
    });

    const game = this.mod?.game;
    if (!game) {
      console.warn('[ReceiveOverlay] FAIL: no game on mod', {
        eventSource,
        mod: this.mod?.name ?? null
      });
      return;
    }

    const ticker = game.crypto;
    console.log('[ReceiveOverlay] game context', {
      eventSource,
      game_id: game.id?.slice?.(0, 12),
      game_crypto: ticker,
      game_dice: game.dice,
      game_over: game.over,
      players: game.players?.map((p) => p?.slice?.(0, 12))
    });

    if (obj.ticker && ticker && obj.ticker !== ticker) {
      console.warn('[ReceiveOverlay] FAIL: ticker mismatch', {
        eventSource,
        obj_ticker: obj.ticker,
        game_crypto: ticker
      });
      return;
    }

    const sender = obj.sender || obj.sender_publickey || '';
    if (!sender) {
      console.warn('[ReceiveOverlay] FAIL: no sender on event', { eventSource, obj });
      return;
    }

    let from = null;
    const playerMatchDebug = [];

    for (let i = 0; i < game.players.length; i++) {
      const player = game.players[i];
      const knownKeys = [game.keys?.[i], game.cryptos?.[i + 1]?.[ticker]?.address].filter(
        Boolean
      );
      const matched =
        player === sender || knownKeys.some((k) => k === sender || k.includes(sender));

      playerMatchDebug.push({
        seat: i + 1,
        player: player?.slice?.(0, 12),
        knownKeys: knownKeys.map((k) => (typeof k === 'string' ? k.slice(0, 12) : k)),
        matched
      });

      if (matched) {
        from = player;
        break;
      }
    }

    if (!from) {
      console.warn('[ReceiveOverlay] FAIL: unable to resolve sender to game player', {
        eventSource,
        sender: sender?.slice?.(0, 20),
        sender_full_len: sender?.length,
        ticker,
        playerMatchDebug
      });
      return;
    }

    if (this.payer && from !== this.payer) {
      console.warn('[ReceiveOverlay] FAIL: payer mismatch', {
        eventSource,
        resolved_from: from?.slice?.(0, 12),
        expected_payer: this.payer?.slice?.(0, 12)
      });
      return;
    }

    const rawAmount = this.expectAmount ?? obj.amount ?? obj.nft_amount;
    if (rawAmount === undefined || rawAmount === null) {
      console.warn('[ReceiveOverlay] FAIL: missing amount', {
        eventSource,
        expectAmount: this.expectAmount,
        obj_amount: obj.amount,
        obj_nft_amount: obj.nft_amount
      });
      return;
    }

    let amtH;
    if (ticker === 'SAITO') {
      amtH = String(rawAmount);
    } else {
      const amt = this.app.crypto.convertFloatToSmartPrecision(parseFloat(rawAmount));
      amtH = String(amt);
    }

    const hash = this.app.crypto.hash(
      Buffer.from(from + this.mod.publicKey + amtH + game.dice + ticker, 'utf-8')
    );

    console.log('[ReceiveOverlay] hash comparison inputs', {
      eventSource,
      from: from?.slice?.(0, 12),
      to: this.mod.publicKey?.slice?.(0, 12),
      rawAmount,
      amtH,
      dice: game.dice,
      ticker,
      recomputed_hash: hash,
      expectHash: this.expectHash ?? null,
      obj_nft_id: obj.nft_id ?? null
    });

    const inboundStores = this.snapshotInboundStores(ticker);
    console.log('[ReceiveOverlay] inbound store snapshot', {
      eventSource,
      ...inboundStores
    });

    const inbound = this.app.options?.crypto?.[ticker]?.transfers_inbound;

    if (!Array.isArray(inbound) || inbound.length === 0) {
      console.warn('[ReceiveOverlay] FAIL: no inbound transfers at crypto[ticker] path', {
        eventSource,
        lookup_path: `app.options.crypto[${ticker}].transfers_inbound`,
        inbound_is_array: Array.isArray(inbound),
        inbound,
        wallet_registered: inboundStores.transfers_inbound_for_ticker,
        hint:
          inboundStores.transfers_inbound_for_ticker?.length
            ? 'hash may be on app.options.transfers_inbound[ticker] but receive.js reads crypto[ticker]'
            : 'receivePayment may not have registered hash yet'
      });
      return;
    }

    let idx = -1;
    let matchedBy = null;

    if (this.expectHash) {
      idx = inbound.indexOf(this.expectHash);
      if (idx >= 0) {
        matchedBy = 'expectHash';
      }
    }

    if (idx < 0) {
      idx = inbound.indexOf(hash);
      if (idx >= 0) {
        matchedBy = 'recomputed_hash';
      }
    }

    if (idx < 0) {
      console.warn('[ReceiveOverlay] FAIL: hash not found in crypto[ticker].transfers_inbound', {
        eventSource,
        recomputed_hash: hash,
        expectHash: this.expectHash ?? null,
        inbound_list: inbound,
        wallet_registered: inboundStores.transfers_inbound_for_ticker,
        hash_in_wallet_list: inboundStores.transfers_inbound_for_ticker?.includes?.(hash),
        hash_in_wallet_expect: this.expectHash
          ? inboundStores.transfers_inbound_for_ticker?.includes?.(this.expectHash)
          : false
      });
      return;
    }

    console.log('[ReceiveOverlay] matched expected inbound', {
      eventSource,
      matchedBy,
      idx,
      matched_hash: inbound[idx]
    });

    inbound.splice(idx, 1);

    const cryptomod = this.app.wallet.returnCryptoModuleByTicker(ticker);
    if (cryptomod?.save) {
      cryptomod.save();
      console.log('[ReceiveOverlay] cryptomod.save() after match', { eventSource, ticker });
    } else {
      console.warn('[ReceiveOverlay] no cryptomod.save (module missing?) — inbound updated in memory only', {
        eventSource,
        ticker
      });
    }

    console.log('[ReceiveOverlay] SUCCESS: calling onReceivePayment', { eventSource });
    this.onReceivePayment(obj);
  }


  /**
   * Shows a confirmation overlay before initiating a crypto transfer
   * @param ticker { string } - name of a currency
   * @param amount { string } - the amount of crypto
   * @param publicKey { string } - Saito public key of recipient
   * @param address { string } - address of receiver (for currency)
   * @param trusted { boolean } - flag for whether to autoprocess
   * @param mycallback { function} - to run when approved
   *
   */
  render(details) {
    console.log('[ReceiveOverlay] render (waiting for payment)', {
      ticker: details?.ticker,
      amount: details?.amount,
      hash: details?.hash ?? null,
      publicKey: details?.publicKey?.slice?.(0, 12),
      address: details?.address?.slice?.(0, 12),
      trusted: !!details?.trusted,
      mod: this.mod?.name ?? null,
      game_crypto: this.mod?.game?.crypto ?? null,
      game_dice: this.mod?.game?.dice ?? null,
      inbound_snapshot: this.snapshotInboundStores(details?.ticker)
    });

    if (!details?.ticker || !details?.amount) {
      console.error('[ReceiveOverlay] FAIL render: missing ticker/amount', details);
      return;
    }

    if (!details?.publicKey || !details?.address) {
      console.error('[ReceiveOverlay] FAIL render: missing publicKey/address', details);
      return;
    }

    console.log('[ReceiveOverlay] show overlay UI');
    this.overlay.show(ReceiveTemplate(this.app, this.mod, details), () => {
      console.log('&&&&&&&&&&& close overlay -- run call back!!!');
      if (details.mycallback) {
        details.mycallback();
      }
    });

    this.counter_party.publicKey = details.publicKey;

    this.counter_party.render();

    let html = `
			<div class="profile-public-key">
				${details.address.slice(0, 8)}...${details.address.slice(-8)}
            </div>`;

    this.counter_party.updateUserline(html);

    this.attachEvents();

    if (details?.trusted) {
      console.log('Trusted!');
      this.timeout = setTimeout(() => {
        this.overlay.close();
        this.timeout = null;
      }, 3000);
      this.countDown();
    }
  }

  countDown() {
    // Countdown clock
    setTimeout(() => {
      let c = document.querySelector(
        '#receive-crypto-request-container .crypto-transfer-countdown span'
      );
      if (c) {
        let value = parseInt(c.innerHTML);
        value = Math.max(value - 1, 0);
        c.innerHTML = value.toString();
        this.countDown();
      }
    }, 900);
  }

  attachEvents() {
    if (document.getElementById('crypto_receipt_btn')) {
      document.getElementById('crypto_receipt_btn').onclick = (e) => {
        let ignoreBtn = document.querySelector('#ignore_checkbox');
        if (ignoreBtn?.checked) {
          this.mod.saveGamePreference('crypto_transfers_inbound_trusted', 1);
        }
        this.overlay.close();
      };
    }
  }

  onReceivePayment() {
    const container = document.getElementById('receive-crypto-request-container');
    if (!container) {
      console.warn('[ReceiveOverlay] onReceivePayment: overlay DOM not found (already closed?)');
      return;
    }

    console.log('[ReceiveOverlay] onReceivePayment: updating UI to Received Payment');
    document.querySelector('.spinner').style.display = 'none';
    document.querySelector('#auth_title').innerHTML = `Received Payment`;
    document.querySelector('#game-crypto-icon').style.display = 'block';

    if (this.timeout) {
      clearTimeout(this.timeout);
      setTimeout(() => {
        this.overlay.close();
        this.timeout = null;
      }, 3000);
      document.querySelector('#receive-crypto-request-container .crypto-transfer-countdown span');
    }
  }
}

module.exports = Receive;
