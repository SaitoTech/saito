const SelectNFTTemplate = require('./select-nft-overlay.template');
const NFTCard = require('./../saito-nft-card');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');
const SaitoUser = require('./../../saito-user/saito-user');
const CreateNFT = require('./create-overlay');
const NFTOverlay = require('./nft-overlay');

const NFT_LIST_TYPES = new Set(['image', 'css', 'js', 'vault-nft-key']);

class SelectNFT {
  constructor(app, mod, attach_events = true, type = '') {
    this.app = app;
    this.mod = mod;
    if (app?.browser?.addStylesheet) {
      app.browser.addStylesheet('/saito/css-imports/ui/saito-nft.css');
    }
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.create_nft_overlay = new CreateNFT(this.app, this.mod);
    this.nft_overlay = new NFTOverlay(this.app, this.mod);

    this.card_list = [];

    this.callback = null;
    this.type = this.normalizeType(type);

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

      // Prefer wallet-updated (not on-nft-sent/received): options.wallet.nfts
      // is only fresh after updateNFTList. Await sync before re-render so we
      // don't race the Wallet module's own async listener.
      app.connection.on('wallet-updated', async () => {
        if (typeof this.app.wallet?.updateNFTList === 'function') {
          await this.app.wallet.updateNFTList();
        }
        if (this.overlay.visible) {
          await this.render();
        } else {
          await this.updateCardList();
        }
      });
    }
  }

  normalizeType(type = '') {
    if (type == null || type === '' || type === 'all') {
      return '';
    }
    return NFT_LIST_TYPES.has(String(type)) ? String(type) : '';
  }

  async render(filter = null) {
    if (arguments.length >= 1) {
      this.type = this.normalizeType(filter);
    }

    this.overlay.show(SelectNFTTemplate(this));

    await this.renderNFTList(this.type || null);

    setTimeout(() => {
      this.attachEvents();
    }, 25);
  }

  async updateCardList() {
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
    const instructionsEl = document.querySelector('.saito-nft-list #nft-list-instructions');

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
            You do not yet have any NFTs in your wallet.
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

    const typeWrap = document.getElementById('nft-list-type');
    if (typeWrap) {
      const button = typeWrap.querySelector('.nft-list-type-button');
      const menu = typeWrap.querySelector('.nft-list-type-menu');
      const label = typeWrap.querySelector('.nft-list-type-label');

      const closeMenu = () => {
        if (menu) {
          menu.hidden = true;
        }
        if (button) {
          button.setAttribute('aria-expanded', 'false');
        }
        typeWrap.classList.remove('is-open');
      };

      const openMenu = () => {
        if (menu) {
          menu.hidden = false;
        }
        if (button) {
          button.setAttribute('aria-expanded', 'true');
        }
        typeWrap.classList.add('is-open');
      };

      button.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (menu?.hidden) {
          openMenu();
        } else {
          closeMenu();
        }
      };

      menu?.querySelectorAll('.nft-list-type-option').forEach((option) => {
        option.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const value = this.normalizeType(option.getAttribute('data-value') || '');
          this.type = value;
          menu.querySelectorAll('.nft-list-type-option').forEach((item) => {
            item.setAttribute(
              'aria-selected',
              item.getAttribute('data-value') === value ? 'true' : 'false'
            );
          });
          if (label) {
            label.textContent = option.textContent;
          }
          closeMenu();
          void this.renderNFTList(this.type || null);
        };
      });

      if (this._nftTypeMenuCloser) {
        document.removeEventListener('mousedown', this._nftTypeMenuCloser, true);
      }
      this._nftTypeMenuCloser = (e) => {
        if (!typeWrap.contains(e.target)) {
          closeMenu();
        }
      };
      document.addEventListener('mousedown', this._nftTypeMenuCloser, true);
    }
  }
}

module.exports = SelectNFT;
