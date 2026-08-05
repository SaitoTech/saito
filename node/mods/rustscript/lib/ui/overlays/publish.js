const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const PublishTemplate = require('./publish.template');
const { applyPublishOverlayShell } = require('./overlay.shell');
const { lockingView } = require('../script_build');

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
    const hash = this.app.core.scripting.hash(locking);
    const address = this.app.core.scripting.address(locking);
    if (!hash || !address) {
      return;
    }

    this.p2shAddress = address;
    this.p2shHash = hash;

    const defaultFee = this.app.wallet.convertNolanToSaito(
      this.app.wallet.default_fee || BigInt(0)
    );
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

  show(html) {
    document.body.classList.add('rs-publish-modal-open');
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
    document.body.classList.remove('rs-publish-modal-open');
    document.removeEventListener('keydown', this.onEscapeKey);
    if (this.blockedRoot) {
      this.blockedRoot.inert = false;
      this.blockedRoot = null;
    }
    this.step = null;
  }

  applyOverlayLayout() {
    applyPublishOverlayShell(this.overlay);
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
    root.querySelector('[data-action="publish-nft"]')?.addEventListener('click', () => {
      this.hide();
      this.mainUi?.publishNftFlow?.openSend();
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
        return;
      }
      errorEl.textContent = msg;
      errorEl.hidden = !msg;
    };

    root.querySelector('[data-action="publish-copy-hash"]')?.addEventListener('click', async () => {
      const hash = root.querySelector('.rs-publish-address')?.value;
      if (!hash) {
        return;
      }
      try {
        await navigator.clipboard.writeText(hash);
      } catch (_err) {
        /* clipboard unavailable */
      }
    });

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
        await this.broadcastPublish(amount, fee || '0', {
          callback: (result) => {
            if (result?.status === 'confirmed') {
              this.mainUi?.openPostPublish?.({
                tx: result.tx || this.lastPublishedTx,
                p2shAddress: this.p2shAddress,
                p2shHash: this.p2shHash,
                blockId: result.blockId,
                txOrdinal: result.txOrdinal,
                blk: result.blk
              });
            }
          }
        });
        this.hide();
      } catch (err) {
        showError(err?.message || 'Could not publish the transaction.');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Publish';
        }
      }
    });
  }

  async broadcastPublish(amountSaito, feeSaito, { callback = null } = {}) {
    const locking = lockingView(this.mod.getScript());
    const hash = this.app.core.scripting.hash(locking);
    const address = this.app.core.scripting.address(locking);
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

    const newtx = await this.mod.broadcastPublish({
      assetType: 'saito',
      locking,
      p2shAddress: address,
      p2shHash: hash,
      amountSaito,
      feeSaito,
      callback
    });

    this.lastPublishedTx = newtx;

    return newtx;
  }
}

module.exports = PublishFlow;
