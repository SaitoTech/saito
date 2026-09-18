const SaitoNFTCardTemplate = require('./saito-nft-card.template');
const SaitoNFT = require('./saito-nft');
const Transaction = require('../../transaction').default;

class SaitoNFTCard {
  constructor(app, mod, container = '', tx = null, data = null, callback = null) {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.nft = new SaitoNFT(app, mod, tx, data);
    this.template = SaitoNFTCardTemplate;
    this.my_qs = this.container + ` #nft-card-${this.nft.uuid}`;

    //
    // UI helpers
    //
    this.callback = callback;
    this.expires_timer = null;
  }

  async render() {
    let this_self = this;
    this.stopExpiresTimer();

    if (this.app?.browser?.addStylesheet) {
      this.app.browser.addStylesheet('/saito/css-imports/ui/saito-nft.css');
    }

    if (!document.querySelector(this.container)) {
      return;
    }

    //
    // if nft.slip1 is not there we cant render nft-card
    // nft.slip1.utxo_key is used as unique identifier for nft-card UI
    // first fetch nft tx, it will give us slip1 then render UI
    //
    if (!this.nft.slip2) {
      await this.nft.fetchTransaction();
    }

    //
    // render can be writing a NEW NFT Card or attempting to re-render
    // an existing one.
    //

    if (document.querySelector(this.my_qs)) {
      this.app.browser.replaceElementBySelector(
        this.template(this.app, this.mod, this.nft),
        this.my_qs
      );
    } else {
      this.app.browser.prependElementToSelector(
        this.template(this.app, this.mod, this.nft),
        this.container
      );
    }

    //
    // avoid re-fetching of nft tx
    //
    if (!this.nft.tx_fetched) {
      this.nft.fetchTransaction(function () {
        this_self.insertNFTDetails();
      });
    } else {
      if (this.nft?.tx) {
        this.insertNFTDetails();
      } else {
        console.warn('NFT-Card: No transaction..., cannot insert details...');
      }
    }

    // Ensure DOM is in place
    setTimeout(() => this.attachEvents(), 0);
  }

  async attachEvents() {
    const el = document.querySelector(this.my_qs);
    if (el) {
      el.onclick = async (e) => {
        const toggle = e.target.closest('.saito-nft-card-toggle');
        if (toggle) {
          e.stopPropagation();
          if (!(this.nft.css || this.nft.js || this.nft.returnType() === 'saito-app')) {
            return;
          }
          const option = e.target.closest('.saito-nft-card-toggle-option');
          if (option) {
            if (option.classList.contains('saito-nft-card-toggle-current')) {
              toggle.classList.remove('open');
              return;
            }
            if (!this.app.options.permissions) this.app.options.permissions = {};
            if (!this.app.options.permissions.nfts) this.app.options.permissions.nfts = [];

            if (this.app.options.permissions.nfts.includes(this.nft.tx_sig)) {
              if (this.nft.returnType() === 'saito-app') {
                try {
                  await this.app.storage.uninstallLocalApplication(null, this.nft.tx_sig);
                } catch (err) {
                  console.error('Error: ', err);
                  salert(
                    'An error occurred while uninstalling application. Check console for details.'
                  );
                  return;
                }
              }

              this.app.options.permissions.nfts = this.app.options.permissions.nfts.filter(
                (v) => v !== this.nft.tx_sig
              );
              this.app.connection.emit('saito-disable-nft', {
                nft_id: this.nft.id,
                nft_sig: this.nft.tx_sig
              });
              salert('NFT Disabled for Next Reload');
              this.app.storage.saveOptions();
            } else {
              if (this.nft.returnType() === 'saito-app') {
                try {
                  await this.nft.fetchTransaction();
                  const saito_text = this.nft.saito || this.nft.tx?.returnMessage()?.data?.saito;

                  if (!saito_text || typeof saito_text !== 'string') {
                    salert('Unable to load Saito Application');
                    return;
                  }

                  const newtx = new Transaction();
                  newtx.deserialize_from_web(this.app, saito_text);

                  const msg = newtx.returnMessage() || {};

                  if (!msg.bin || !(msg.name || msg.slug)) {
                    salert('Invalid .saito Application File');
                    return;
                  }

                  const mod = (msg.name || msg.slug).toLowerCase();

                  await this.app.storage.installLocalApplication(
                    mod,
                    msg.bin,
                    this.nft.id,
                    this.nft.tx_sig
                  );
                } catch (err) {
                  console.error('Error: ', err);
                  salert(
                    'An error occurred while installing application. Check console for details.'
                  );
                  return;
                }
              }

              this.app.options.permissions.nfts.push(this.nft.tx_sig);
              salert('NFT Activated for Next Reload');
              this.app.storage.saveOptions();
              this.app.connection.emit('saito-enable-nft', {
                nft_id: this.nft.id,
                nft_sig: this.nft.tx_sig
              });
            }

            const enabled = this.app.options.permissions.nfts.includes(this.nft.tx_sig);
            toggle.classList.toggle('enabled', enabled);
            toggle.classList.remove('open');
            toggle
              .querySelectorAll(
                '.saito-nft-card-toggle-face .saito-nft-card-toggle-dot, .saito-nft-card-toggle-current .saito-nft-card-toggle-dot'
              )
              .forEach((dot) => {
                dot.classList.toggle('enabled', enabled);
              });
            toggle
              .querySelectorAll(
                '.saito-nft-card-toggle-face .saito-nft-card-toggle-label, .saito-nft-card-toggle-current .saito-nft-card-toggle-label'
              )
              .forEach((label) => {
                label.textContent = enabled ? 'Enabled' : 'Disabled';
              });
            const alt = toggle.querySelector(
              '.saito-nft-card-toggle-option:not(.saito-nft-card-toggle-current)'
            );
            alt.querySelector('.saito-nft-card-toggle-dot').classList.toggle('enabled', !enabled);
            alt.querySelector('.saito-nft-card-toggle-label').textContent = enabled
              ? 'Disabled'
              : 'Enabled';
            return;
          }

          document.querySelectorAll('.saito-nft-card-toggle.open').forEach((openToggle) => {
            if (openToggle !== toggle) {
              openToggle.classList.remove('open');
            }
          });
          toggle.classList.toggle('open');
          if (toggle.classList.contains('open')) {
            setTimeout(() => {
              document.addEventListener(
                'click',
                () => {
                  toggle.classList.remove('open');
                },
                { once: true }
              );
            }, 0);
          }
          return;
        }

        if (this.callback) {
          this.callback(this.nft);
        } else {
          this.app.connection.emit('saito-nft-details-render-request', this.nft);
        }
      };
    }
  }

  insertNFTDetails() {
    if (!this.app.BROWSER) {
      return 0;
    }

    console.log('Insert fetched NFT details into CARD');

    const details = document.querySelector(this.my_qs + ' .saito-nft-card-details');
    if (
      details &&
      (this.nft.css || this.nft.js) &&
      !details.querySelector('.saito-nft-card-toggle')
    ) {
      if (!details.querySelector('.saito-nft-card-toggle')) {
        const enabled = (this.app.options?.permissions?.nfts || []).includes(this.nft.tx_sig);
        const toggle = document.createElement('div');
        toggle.className = enabled ? 'saito-nft-card-toggle enabled' : 'saito-nft-card-toggle';
        const current = enabled ? 'Enabled' : 'Disabled';
        const alt = enabled ? 'Disabled' : 'Enabled';
        toggle.innerHTML = `<div class="saito-nft-card-toggle-face"><span class="saito-nft-card-toggle-dot${
          enabled ? ' enabled' : ''
        }"></span><span class="saito-nft-card-toggle-label">${current}</span><i class="fa-solid fa-caret-down"></i></div><div class="saito-nft-card-toggle-menu"><div class="saito-nft-card-toggle-option saito-nft-card-toggle-current"><span class="saito-nft-card-toggle-dot${
          enabled ? ' enabled' : ''
        }"></span><span class="saito-nft-card-toggle-label">${current}</span><i class="fa-solid fa-caret-down"></i></div><div class="saito-nft-card-toggle-option"><span class="saito-nft-card-toggle-dot${
          enabled ? '' : ' enabled'
        }"></span><span class="saito-nft-card-toggle-label">${alt}</span></div></div>`;
        details.appendChild(toggle);
      }
    }

    if (this.nft.title) {
      try {
        let telm = document.querySelector(this.my_qs + ' .saito-nft-card-title');
        telm.textContent = this.nft.title;
      } catch (err) {}
    }

    let elm = document.querySelector(this.my_qs + ' .saito-nft-card-img');
    if (elm) {
      const display = this.nft.returnMediaDisplay();

      if (display.loading) {
        elm.innerHTML = `<div class="saito-spinner spinner"></div>`;
        elm.style.backgroundImage = '';
        return;
      }

      elm.innerHTML = display.innerHtml || '';
      if (this.app.browser.isSafeMediaUrl(display.backgroundImage)) {
        elm.style.backgroundImage = `url("${String(display.backgroundImage).replace(/"/g, '%22')}")`;
      } else {
        elm.style.backgroundImage = '';
      }
      this.startExpiresTimer();
    } else {
      console.warn('NFT Element not rendered --', this.my_qs);
    }
  }

  stopExpiresTimer() {
    if (this.expires_timer) {
      clearInterval(this.expires_timer);
      this.expires_timer = null;
    }
  }

  startExpiresTimer() {
    this.stopExpiresTimer();
    if (this.nft.expires_at == null || this.nft.expires_at === '') {
      return;
    }
    this.tickExpiresClock();
    this.expires_timer = setInterval(() => {
      if (!document.querySelector(this.my_qs)) {
        this.stopExpiresTimer();
        return;
      }
      this.tickExpiresClock();
    }, 1000);
  }

  tickExpiresClock() {
    const img = document.querySelector(this.my_qs + ' .saito-nft-card-img');
    if (!img) {
      this.stopExpiresTimer();
      return;
    }
    let clock = img.querySelector('.saito-nft-expires-clock');
    if (!clock) {
      clock = document.createElement('div');
      clock.className = 'saito-nft-expires-clock';
      img.appendChild(clock);
    }
    clock.textContent = this.nft.remainingExpiresLabel();
  }
}

module.exports = SaitoNFTCard;
