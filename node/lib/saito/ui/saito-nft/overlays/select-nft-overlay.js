const SelectNFTTemplate = require('./select-nft-overlay.template');
const NFTCard = require('./../saito-nft-card');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');
const SaitoUser = require('./../../saito-user/saito-user');
const CreateNFT = require('./create-overlay');
const NFTOverlay = require('./nft-overlay');

class SelectNFT {
  constructor(app, mod, attach_events = true) {
    this.app = app;
    this.mod = mod;
    if (app?.browser?.addStylesheet) {
      app.browser.addStylesheet('/saito/ui/saito-nft.css');
    }
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.create_nft_overlay = new CreateNFT(this.app, this.mod);
    this.nft_overlay = new NFTOverlay(this.app, this.mod);

    this.card_list = [];

    this.callback = null;

    if (attach_events) {
      this.app.connection.on(
        'saito-nft-list-render-request',
        (title = '', callback = null, filter = null) => {
          this.title = title;
          this.callback = callback;
          this.render(filter);
        }
      );

      this.app.connection.on('saito-nft-list-close-request', () => {
        this.overlay.close();
      });

      app.connection.on('wallet-updated', async () => {
        const { updated, rebroadcast, persisted } = await this.app.wallet.updateNFTList();

        if (persisted) {
          siteMessage(`NFT updated in wallet`, 3000);
        }

        // re-render send-nft overlay if its open
        if (this.overlay.visible) {
          //  this doesn't seem to trigger when NFT is just newly created by wallet
          //  if (this.overlay.visible && (updated.length > 0 || persisted)) {
          this.render();
        } else {
          this.updateCardList();
        }
      });
    }
  }

  async render(filter = null) {
    this.overlay.show(SelectNFTTemplate(this));

    await this.renderNFTList(filter);

    setTimeout(() => {
      this.attachEvents();
    }, 25);
  }

  async updateCardList() {
    await this.app.wallet.updateNFTList();
    let nft_list = this.app.options.wallet.nfts || [];

    // We want to avoid recreating the cards every time we look launch the overlay
    // but we need to check if we have added *or* removed an nft and adjust as needed
    this.card_list.forEach((x) => (x.delete_me = true));

    for (const rec of nft_list) {
      // To capture split nfts... i think
      let already_rendered = false;
      for (let i = 0; i < this.card_list.length; i++) {
        if (rec.id == this.card_list[i].nft.id) {
          this.card_list[i].callback = this.callback;
          delete this.card_list[i].delete_me;

          already_rendered = true;
          break;
        }
      }

      if (!already_rendered) {
        this.card_list.push(
          new NFTCard(this.app, this.mod, '.send-nft-list', null, rec, this.callback)
        );
      }
    }

    for (let j = this.card_list.length - 1; j >= 0; j--) {
      if (this.card_list[j].delete_me) {
        this.card_list.splice(j, 1);
      }
    }
  }

  async renderNFTList(filter) {
    const container = document.querySelector('#nft-list');
    const instructionsEl = document.querySelector(
      '.saito-nft-list #nft-list-instructions'
    );

    if (!container) {
      console.warn('Missing NFT-list container!');
      return;
    }

    await this.updateCardList();

    if (!this.card_list?.length) {
      container.innerHTML = '<div class="send-nft-list"></div>';
      if (instructionsEl) {
        instructionsEl.innerHTML = `
          <div class="instructions">
            You do not have any NFTs in your wallet.
            If you have just created or been sent one, please wait a few minutes
            for the network to confirm it.
          </div>
        `;
      }
      return;
    } else {
      if (instructionsEl) {
        instructionsEl.innerHTML = '';
      }

      // if nft-list contains nft
      let html = '<div class="send-nft-list"></div>';
      container.innerHTML = html;

      for (let card of this.card_list) {
        if (!card.callback) {
          card.callback = (nft) => {
            this.nft_overlay.render(nft);
          };
        }
        if (!filter || filter == card.nft.returnType()) {
          await card.render();
        }
      }
    }
  }

  attachEvents() {
    let newNFTButton = document.getElementById('create-nft');
    if (newNFTButton) {
      newNFTButton.onclick = (e) => {
        this.overlay.close();
        this.create_nft_overlay.render();
      };
    }
  }
}

module.exports = SelectNFT;
