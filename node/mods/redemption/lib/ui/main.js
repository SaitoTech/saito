const MainTemplate = require('./main.template');
const NftListOverlay = require('./overlays/nft-list');
const CreateNFT = require('../../../../lib/saito/ui/saito-nft/overlays/create-overlay');
const { defaultBlocksRequired } = require('../transactions');

class RedemptionMain {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.container = '.saito-container';
    this.list = new NftListOverlay(app, mod);
    this.create_nft = null;
  }

  render() {
    const html = MainTemplate();
    if (!document.querySelector('.redemption')) {
      this.app.browser.addElementToSelector(html, this.container);
    } else {
      this.app.browser.replaceElementBySelector(html, '.redemption');
    }
    this.attachEvents();
  }

  attachEvents() {
    const create = document.querySelector('#redemption-create');
    const redeem = document.querySelector('#redemption-open-nfts');
    if (create) {
      create.onclick = () => {
        this.openCreate();
      };
    }
    if (redeem) {
      redeem.onclick = () => {
        this.list.render();
      };
    }
  }

  async openCreate() {
    const capability = this.mod.respondTo('saito-create-nft');
    if (!capability?.class?.[0]) {
      return;
    }
    if (!this.create_nft) {
      this.create_nft = new CreateNFT(this.app, this.mod);
    }

    let confirmations = '';
    try {
      confirmations = (await defaultBlocksRequired(this.app)) || '';
    } catch (err) {
      confirmations = '';
    }
    let server = this.mod.publicKey || '';
    try {
      server = (await this.app.wallet.getPublicKey()) || server;
    } catch (err) {
      server = this.mod.publicKey || '';
    }

    this.create_nft.render({
      type: capability.class[0],
      locked: ['type']
    });
    this.installClaimFields({ confirmations, server });
  }

  installClaimFields({ confirmations, server }) {
    const fields = document.querySelector('.saito-nft-create .create-nft-fields');
    if (!fields) {
      return;
    }

    const upload = document.querySelector('#nft-image-upload');
    const textarea = document.querySelector('#create-nft-textarea');
    if (upload) {
      upload.style.display = 'none';
    }
    if (textarea) {
      textarea.style.display = 'none';
    }

    const existing = fields.querySelector('.redemption-create-fields');
    if (existing) {
      existing.remove();
    }

    const escape = (value) => this.app.browser.escapeHTML(String(value ?? ''));
    const html = `
      <div class="redemption-create-fields">
        <label class="label" for="redemption-create-ticker">Ticker</label>
        <input id="redemption-create-ticker" class="saito-input" type="text" autocomplete="off" />

        <label class="label" for="redemption-create-amount">Amount</label>
        <input id="redemption-create-amount" class="saito-input" type="text" inputmode="numeric" autocomplete="off" placeholder="base units" />

        <label class="label" for="redemption-create-confirmations">Number of confirmations</label>
        <input id="redemption-create-confirmations" class="saito-input" type="text" inputmode="numeric" autocomplete="off" value="${escape(confirmations)}" />

        <label class="label" for="redemption-create-server">Redemption server</label>
        <input id="redemption-create-server" class="saito-input" type="text" autocomplete="off" value="${escape(server)}" />

        <label class="label" for="redemption-create-collateral">Collateral id</label>
        <input id="redemption-create-collateral" class="saito-input" type="text" autocomplete="off" placeholder="reference for the deposited funds" />
      </div>
    `;
    fields.insertAdjacentHTML('afterbegin', html);
  }
}

module.exports = RedemptionMain;
