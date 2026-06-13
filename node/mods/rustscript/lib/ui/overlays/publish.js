const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const PublishTemplate = require('./publish.template');
const { lockingView } = require('../script_build');
const { deriveP2shFromLockingScript } = require('../../rustscript/p2sh');

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatScriptForDisplay(script) {
  return JSON.stringify(script, null, 2);
}

function parseSaitoAmount(raw, allowZero = false) {
  const text = String(raw || '').trim();
  if (!text && allowZero) {
    return '0';
  }
  if (!text) {
    return null;
  }
  const num = Number(text);
  if (!Number.isFinite(num) || num < 0) {
    return null;
  }
  if (!allowZero && num <= 0) {
    return null;
  }
  return text;
}

class PublishFlow {
  constructor(app, mod, mainUi) {
    this.app = app;
    this.mod = mod;
    this.mainUi = mainUi;
    this.overlay = new SaitoOverlay(app, mod, true, true, false);
    this.overlay.class = 'saito-overlay rs-publish-overlay-shell';
    this.overlay.clickBackdropToClose = true;
    this.overlay.nonBlocking = false;

    this.step = null;
    this.pendingTxSignature = '';
    this.p2shAddress = '';
    this.p2shHash = '';
    this.lastPublishedTx = null;
    this.availableBalanceNolan = BigInt(0);
    this.blockedRoot = null;

    this.onEscapeKey = (event) => {
      if (event.key === 'Escape' && this.step) {
        this.hide();
      }
    };
  }

  openChoice() {
    this.step = 'choice';
    this.show(PublishTemplate.choiceOverlay());
    this.bindChoiceEvents();
  }

  async openSend() {
    const locking = lockingView(this.mod.getScript());
    const { hash, address } = deriveP2shFromLockingScript(this.app, locking);
    if (!hash || !address) {
      siteMessage('Could not derive a script address from this script.');
      return;
    }

    this.p2shAddress = address;
    this.p2shHash = hash;

    const defaultFee = this.app.wallet.convertNolanToSaito(this.app.wallet.default_fee || BigInt(0));
    const fee = defaultFee && defaultFee !== '0.00' ? defaultFee : '0.001';
    this.availableBalanceNolan = await this.app.wallet.getBalance();

    this.step = 'send';
    this.show(
      PublishTemplate.sendOverlay({
        scriptDisplay: escapeHtml(formatScriptForDisplay(locking)),
        p2shAddress: escapeHtml(address),
        amount: '1',
        fee
      })
    );
    this.bindSendEvents();
  }

  openWaiting() {
    this.step = 'waiting';
    this.show(PublishTemplate.waitingOverlay({ phase: 'pending', p2shAddress: this.p2shAddress }));
    this.bindWaitingEvents();
  }

  openSuccess() {
    this.step = 'success';
    this.show(
      PublishTemplate.waitingOverlay({
        phase: 'success',
        p2shAddress: escapeHtml(this.p2shAddress)
      })
    );
    this.bindWaitingEvents();
  }

  show(html) {
    const container = document.querySelector('.saito-container');
    container?.classList.add('rs-publish-modal-open');
    this.blockedRoot = document.querySelector('main.rustscript');
    if (this.blockedRoot) {
      this.blockedRoot.inert = true;
    }
    document.addEventListener('keydown', this.onEscapeKey);
    this.overlay.show(html, () => {
      this.onOverlayClosed();
    });
    this.applyOverlayLayout();
  }

  hide() {
    if (this.step) {
      this.overlay.close();
    }
  }

  onOverlayClosed() {
    document.querySelector('.saito-container')?.classList.remove('rs-publish-modal-open');
    document.removeEventListener('keydown', this.onEscapeKey);
    if (this.blockedRoot) {
      this.blockedRoot.inert = false;
      this.blockedRoot = null;
    }
    this.step = null;
    this.pendingTxSignature = '';
  }

  applyOverlayLayout() {
    const el = document.getElementById(`saito-overlay${this.overlay.ordinal}`);
    const backdrop = document.getElementById(`saito-overlay-backdrop${this.overlay.ordinal}`);

    if (el) {
      el.classList.add('rs-publish-overlay-shell', 'maximized-overlay');
      el.style.pointerEvents = 'none';
    }
    if (backdrop) {
      backdrop.classList.add('rs-publish-overlay-backdrop');
      backdrop.style.display = 'block';
      backdrop.style.pointerEvents = 'auto';
      backdrop.style.top = '0';
      backdrop.style.left = '0';
      backdrop.style.width = '100vw';
      backdrop.style.height = '100dvh';
      backdrop.style.zIndex = '100001';
    }
    if (el) {
      el.style.zIndex = '100002';
    }
    if (typeof this.overlay.pullOverlayToFront === 'function') {
      this.overlay.pullOverlayToFront();
    }
  }

  insufficientBalanceMessage(balanceNolan) {
    const maxDisplay = this.app.wallet.convertNolanToSaito(balanceNolan);
    return `Insufficient balance. Maximum available: ${maxDisplay} SAITO.`;
  }

  bindChoiceEvents() {
    const root = document.querySelector('.rs-publish-choice');
    if (!root) {
      return;
    }
    root.querySelector('[data-action="publish-saito"]')?.addEventListener('click', () => {
      this.openSend();
    });
  }

  bindSendEvents() {
    const root = document.querySelector('.rs-publish-send');
    if (!root) {
      return;
    }

    const errorEl = root.querySelector('.rs-publish-error');
    const showError = (msg) => {
      if (!errorEl) {
        siteMessage(msg);
        return;
      }
      errorEl.textContent = msg;
      errorEl.hidden = !msg;
    };

    root.querySelector('[data-action="publish-broadcast"]')?.addEventListener('click', async () => {
      showError('');
      const amountRaw = root.querySelector('.rs-publish-amount')?.value;
      const feeRaw = root.querySelector('.rs-publish-fee')?.value;
      const amount = parseSaitoAmount(amountRaw, false);
      const fee = parseSaitoAmount(feeRaw, true);

      if (!amount) {
        showError('Enter a valid amount of SAITO.');
        return;
      }
      if (fee === null) {
        showError('Enter a valid fee.');
        return;
      }

      const balance = await this.app.wallet.getBalance();
      this.availableBalanceNolan = balance;
      const amountNolan = this.app.wallet.convertSaitoToNolan(amount);
      const feeNolan = this.app.wallet.convertSaitoToNolan(fee || '0');
      if (balance < amountNolan + feeNolan) {
        showError(this.insufficientBalanceMessage(balance));
        return;
      }

      const btn = root.querySelector('[data-action="publish-broadcast"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Publishing…';
      }

      try {
        await this.broadcastPublish(amount, fee || '0');
        this.openWaiting();
      } catch (err) {
        showError(err?.message || 'Could not publish the transaction.');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Publish';
        }
      }
    });
  }

  bindWaitingEvents() {
    const root = document.querySelector('.rs-publish-waiting');
    if (!root) {
      return;
    }

    root.querySelector('[data-action="publish-new-script"]')?.addEventListener('click', () => {
      this.hide();
      this.mainUi?.welcomeOverlay?.render('splash');
    });

    root.querySelector('[data-action="publish-copy-address"]')?.addEventListener('click', async () => {
      const address =
        root.querySelector('.rs-publish-address-recap')?.dataset.address || this.p2shAddress;
      if (!address) {
        return;
      }
      try {
        await navigator.clipboard.writeText(address);
        siteMessage('Script address copied');
      } catch (err) {
        siteMessage('Could not copy address');
      }
    });

    root.querySelector('[data-action="publish-spend"]')?.addEventListener('click', async () => {
      const tx = this.lastPublishedTx;
      if (!tx) {
        siteMessage('Publish transaction not available');
        return;
      }
      this.hide();
      try {
        await this.mod.loadTransactionForWitness(tx);
      } catch (err) {
        siteMessage(err?.message || 'Could not start unlock workflow');
      }
    });

    root.querySelector('[data-action="publish-export"]')?.addEventListener('click', () => {
      const tx = this.lastPublishedTx;
      if (!tx) {
        siteMessage('Publish transaction not available');
        return;
      }
      try {
        const { filename } = this.mod.exportTransaction(tx);
        siteMessage(`Transaction exported (${filename})`);
      } catch (err) {
        siteMessage(err?.message || 'Could not export transaction');
      }
    });
  }

  async broadcastPublish(amountSaito, feeSaito) {
    const locking = lockingView(this.mod.getScript());
    const { hash, address } = deriveP2shFromLockingScript(this.app, locking);
    if (!hash || !address) {
      throw new Error('Could not derive script address');
    }

    this.p2shAddress = address;
    this.p2shHash = hash;

    const amountNolan = this.app.wallet.convertSaitoToNolan(amountSaito);
    const feeNolan = this.app.wallet.convertSaitoToNolan(feeSaito);

    const balance = await this.app.wallet.getBalance();
    const totalNeeded = amountNolan + feeNolan;
    if (balance < totalNeeded) {
      throw new Error(this.insufficientBalanceMessage(balance));
    }

    const newtx = await this.app.wallet.createUnsignedTransaction(address, amountNolan, feeNolan);
    const accessScript = JSON.stringify(locking);

    newtx.msg = {
      module: this.mod.name,
      request: 'publish p2sh',
      access_script: accessScript,
      scripthash: hash,
      p2sh_address: address,
      amount: String(amountSaito),
      fee: String(feeSaito)
    };

    await newtx.sign();
    await this.app.network.propagateTransaction(newtx);

    this.pendingTxSignature = newtx.signature || '';
    if (!this.pendingTxSignature) {
      throw new Error('Transaction was not signed.');
    }

    this.lastPublishedTx = newtx;

    return newtx;
  }

  async checkBlockForPendingTx(blk) {
    if (!this.pendingTxSignature || this.step !== 'waiting' || !blk) {
      return;
    }
    try {
      const txs = blk.transactions || [];
      for (let i = 0; i < txs.length; i++) {
        const tx = txs[i];
        if (tx?.signature === this.pendingTxSignature) {
          this.lastPublishedTx = tx;
          this.onPublishConfirmed();
          return;
        }
      }
    } catch (err) {
      // keep waiting
    }
  }

  onPublishConfirmed() {
    if (this.step !== 'waiting') {
      return;
    }
    this.openSuccess();
  }

  handleConfirmation(blk, tx, conf) {
    if (Number(conf) !== 0) {
      return;
    }
    const txmsg = tx.returnMessage();
    if (txmsg?.module !== this.mod.name || txmsg?.request !== 'publish p2sh') {
      return;
    }
    if (this.pendingTxSignature && tx.signature !== this.pendingTxSignature) {
      return;
    }
    this.lastPublishedTx = tx;
    this.onPublishConfirmed();
  }
}

module.exports = PublishFlow;
