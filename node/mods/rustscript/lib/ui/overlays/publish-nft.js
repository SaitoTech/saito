const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const SaitoNFTCard = require('./../../../../../lib/saito/ui/saito-nft/saito-nft-card');
const PublishNFTTemplate = require('./publish-nft.template');
const { applyPublishOverlayShell } = require('./overlay.shell');
const { lockingView } = require('../script_build');

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function parseNftAmount(raw) {
  const text = String(raw || '').trim();
  if (!text) {
    return null;
  }
  const amount = parseInt(text, 10);
  if (!Number.isInteger(amount) || amount <= 0) {
    return null;
  }
  return amount;
}

class PublishNFTFlow {
  constructor(app, mod, mainUi, publishFlow) {
    this.app = app;
    this.mod = mod;
    this.mainUi = mainUi;
    this.publishFlow = publishFlow;
    this.overlay = new SaitoOverlay(app, mod, true, true, false);
    this.overlay.class = 'saito-overlay rs-publish-overlay-shell';
    this.overlay.clickBackdropToClose = true;
    this.overlay.nonBlocking = false;

    this.step = null;
    this.p2shAddress = '';
    this.p2shHash = '';
    this.cardList = [];
    this.selectedCard = null;
    this.blockedRoot = null;

    this.onEscapeKey = (event) => {
      if (event.key === 'Escape' && this.step) {
        this.hide();
      }
    };
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
    this.selectedCard = null;
    this.cardList = [];

    const defaultFee = this.app.wallet.convertNolanToSaito(
      this.app.wallet.default_fee || BigInt(0)
    );
    const fee = defaultFee && defaultFee !== '0.00' ? defaultFee : '0.001';

    this.step = 'send';
    this.show(
      PublishNFTTemplate.sendOverlay({
        p2shAddress: escapeHtml(address),
        fee
      })
    );
    await this.renderNftList();
    this.bindSendEvents();
    this.syncPublishButtonState();
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
    this.selectedCard = null;
    this.cardList = [];
  }

  applyOverlayLayout() {
    applyPublishOverlayShell(this.overlay);
  }

  async updateCardList() {
    await this.app.wallet.updateNFTList();
    const nftList = this.app.options.wallet.nfts || [];

    this.cardList.forEach((card) => {
      card.delete_me = true;
    });

    for (const rec of nftList) {
      let alreadyRendered = false;
      for (let i = 0; i < this.cardList.length; i++) {
        if (rec.id === this.cardList[i].nft.id) {
          this.cardList[i].callback = (nft) => this.onNftSelected(this.cardList[i]);
          delete this.cardList[i].delete_me;
          alreadyRendered = true;
          break;
        }
      }

      if (!alreadyRendered) {
        const card = new SaitoNFTCard(
          this.app,
          this.mod,
          '.rs-publish-nft-list',
          null,
          rec,
          (nft) => this.onNftSelected(card)
        );
        this.cardList.push(card);
      }
    }

    for (let j = this.cardList.length - 1; j >= 0; j--) {
      if (this.cardList[j].delete_me) {
        this.cardList.splice(j, 1);
      }
    }
  }

  async renderNftList() {
    const container = document.querySelector('.rs-publish-nft-list');
    if (!container) {
      return;
    }

    await this.updateCardList();

    if (!this.cardList.length) {
      container.innerHTML = `
        <div class="rs-publish-nft-empty instructions">
          You do not have any NFTs in your wallet.
        </div>`;
      return;
    }

    container.innerHTML = '';
    for (const card of this.cardList) {
      card.callback = (nft) => this.onNftSelected(card);
      await card.render();
    }
  }

  onNftSelected(card) {
    this.selectedCard = card;

    document.querySelectorAll('.rs-publish-nft-list .saito-nft-card').forEach((el) => {
      el.classList.remove('is-selected');
    });
    const cardEl = document.querySelector(card.my_qs);
    cardEl?.classList.add('is-selected');

    this.updateSelectedSummary();
    this.syncPublishButtonState();
  }

  updateSelectedSummary() {
    const slot = document.querySelector('.rs-publish-nft-selected-slot');
    const amountInput = document.querySelector('.rs-publish-nft-amount');
    const maxBtn = document.querySelector('.rs-publish-nft-max-btn');
    if (!slot) {
      return;
    }

    if (!this.selectedCard?.nft) {
      slot.innerHTML = PublishNFTTemplate.selectedNftSummaryHtml({});
      if (amountInput) {
        amountInput.value = '1';
        amountInput.disabled = true;
      }
      maxBtn?.setAttribute('disabled', 'disabled');
      return;
    }

    const nft = this.selectedCard.nft;
    const total = nft.getTotalAmount ? nft.getTotalAmount() : 0;
    let imageStyle = '';
    if (nft.image) {
      imageStyle = `background-image: url("${escapeHtml(nft.image)}");`;
    }

    slot.innerHTML = PublishNFTTemplate.selectedNftSummaryHtml({
      title: escapeHtml(nft.title || 'Untitled NFT'),
      type: escapeHtml(nft.returnType ? nft.returnType() : ''),
      units: escapeHtml(String(total)),
      imageStyle
    });

    if (amountInput) {
      amountInput.disabled = false;
      amountInput.value = '1';
    }
    maxBtn?.removeAttribute('disabled');
  }

  syncPublishButtonState() {
    const btn = document.querySelector('[data-action="publish-nft-broadcast"]');
    if (!btn) {
      return;
    }
    const active = !!this.selectedCard?.nft;
    btn.disabled = !active;
    btn.classList.toggle('is-active', active);
  }

  bindSendEvents() {
    const root = document.querySelector('.rs-publish-nft-send');
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

    root.querySelector('[data-action="publish-nft-max"]')?.addEventListener('click', () => {
      const nft = this.selectedCard?.nft;
      const amountInput = root.querySelector('.rs-publish-nft-amount');
      if (!nft || !amountInput) {
        return;
      }
      amountInput.value = String(nft.getTotalAmount() || 0);
    });

    root
      .querySelector('[data-action="publish-nft-broadcast"]')
      ?.addEventListener('click', async () => {
        showError('');
        const nft = this.selectedCard?.nft;
        if (!nft) {
          showError('Select an NFT to publish.');
          return;
        }

        const nftAmountRaw = root.querySelector('.rs-publish-nft-amount')?.value;
        const feeRaw = root.querySelector('.rs-publish-fee')?.value;
        const nftAmount = parseNftAmount(nftAmountRaw);
        const fee = parseSaitoAmount(feeRaw, true);

        if (!nftAmount) {
          showError('Enter a valid NFT amount.');
          return;
        }
        if (fee === null) {
          showError('Enter a valid fee.');
          return;
        }

        const totalAvailable = nft.getTotalAmount ? nft.getTotalAmount() : 0;
        if (nftAmount > totalAvailable) {
          showError(`Insufficient NFT units (${totalAvailable} available).`);
          return;
        }

        const btn = root.querySelector('[data-action="publish-nft-broadcast"]');
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Publishing…';
        }

        try {
          const tx = await this.broadcastPublishNft(nft, nftAmount, fee || '0');
          this.hide();
          this.publishFlow.lastPublishedTx = this.lastPublishedTx;
          this.publishFlow.p2shAddress = this.p2shAddress;
          this.publishFlow.p2shHash = this.p2shHash;
          this.publishFlow.watchTransaction(tx, {
            onConfirmed: () => {
              this.mainUi?.openPostPublish?.({
                tx: this.lastPublishedTx || tx,
                p2shAddress: this.p2shAddress,
                p2shHash: this.p2shHash
              });
            }
          });
        } catch (err) {
          showError(err?.message || 'Could not publish the transaction.');
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Publish';
            this.syncPublishButtonState();
          }
        }
      });
  }

  async broadcastPublishNft(nft, nftAmount, feeSaito) {
    const locking = lockingView(this.mod.getScript());
    const hash = this.app.core.scripting.hash(locking);
    const address = this.app.core.scripting.address(locking);
    if (!hash || !address) {
      throw new Error('Could not derive script address');
    }

    this.p2shAddress = address;
    this.p2shHash = hash;

    const newtx = await this.mod.publishScript({
      assetType: 'nft',
      locking,
      p2shAddress: address,
      p2shHash: hash,
      feeSaito,
      nft,
      nftAmount
    });

    await this.app.network.propagateTransaction(newtx);

    this.lastPublishedTx = newtx;

    if (!newtx.signature) {
      throw new Error('Transaction was not signed.');
    }

    try {
      await this.app.wallet.updateNFTList();
    } catch (err) {
      console.warn('publish NFT: updateNFTList', err);
    }

    return newtx;
  }
}

module.exports = PublishNFTFlow;
