const SaitoOverlay = require('../../saito-overlay/saito-overlay');
const userMenuTemplate = require('./user-menu.template');

class UserMenu {
  constructor(app, publicKey, options = {}) {
    this.app = app;
    this.user_publickey = publicKey;
    this.options = options;
    this.overlay = new SaitoOverlay(app, null, true, true);
    this.callbacks = {};
  }

  async render() {
    let myPublicKey = await this.app.wallet.getPublicKey();

    if (!this.app.crypto.isPublicKey(this.user_publickey)) {
      console.warn('Invalid publicKey for User Menu!');
      return;
    }

    let thisobj = this;
    if (!document.querySelector('#saito-user-menu')) {
      this.overlay.show(userMenuTemplate(this.app, this.user_publickey));

      let mods = this.app.modules.mods;

      let index = 0;
      let contactActionAdded = false;
      for (const mod of mods) {
        let item = mod.respondTo('user-menu', {
          publicKey: this.user_publickey
        });
        if (item instanceof Array) {
          item.forEach((j) => {
            if (this.options.contactAction === 'delete' && j.text === 'Add Contact') {
              j = this.returnDeleteContactItem();
              contactActionAdded = true;
            }
            let id = `user_menu_item_${index}`;
            thisobj.callbacks[id] = j.callback;
            thisobj.addMenuItem(j, id);
            index++;
          });
        } else if (item != null) {
          if (this.options.contactAction === 'delete' && item.text === 'Add Contact') {
            item = this.returnDeleteContactItem();
            contactActionAdded = true;
          }
          let id = `user_menu_item_${index}`;
          thisobj.callbacks[id] = item.callback;
          thisobj.addMenuItem(item, id);
        }
        index++;
      }

      if (this.options.contactAction === 'delete' && !contactActionAdded) {
        let id = `user_menu_item_${index}`;
        let item = this.returnDeleteContactItem();
        thisobj.callbacks[id] = item.callback;
        thisobj.addMenuItem(item, id);
        index++;
      }

      /*************************
      commenting out third party send options, because we dont know the receiver 
      has activated third party cryptos & dont have their trx address
      **************************/
      // let ticker = this.app.wallet.returnPreferredCryptoTicker();
      // if (ticker !== "SAITO") {
      //   let id = `user_menu_item_${index}`;
      //
      //   thisobj.callbacks[id] = function (app, publicKey) {
      //     alert("Send 3rd Party Crypto");
      //   };
      //   thisobj.addMenuItem({ icon: "fas fa-money-check-dollar", text: `Send ${ticker}` }, id);
      //   index++;
      // } else {

      //
      //This is not in a respondTo????
      //

      if (this.user_publickey !== myPublicKey) {
        let id = `user_menu_item_${index}`;
        thisobj.callbacks[id] = function (app, publicKey) {
          thisobj.app.connection.emit('saito-crypto-withdraw-render-request', {
            address: publicKey,
            ticker: 'SAITO'
          });
        };
        thisobj.addMenuItem({ icon: 'fas fa-money-check-dollar', text: 'Send Crypto' }, id);
        index++;
      }

      //}
    }

    this.attachEvents();
  }

  attachEvents() {
    let thisobj = this;
    let pk = this.user_publickey;
    document.querySelectorAll('#saito-user-menu .saito-modal-menu-option').forEach((menu) => {
      let id = menu.getAttribute('id');
      let callback = thisobj.callbacks[id];
      menu.addEventListener('click', () => {
        callback(this.app, pk);
        thisobj.overlay.remove();
      });
    });
  }

  returnDeleteContactItem() {
    return {
      text: 'Delete Contact',
      icon: 'fa-solid fa-user-minus',
      callback: async (app, publicKey) => {
        const confirmed = await sconfirm('Delete this contact?');
        if (!confirmed) {
          return;
        }

        app.keychain.removeKey(publicKey);
        if (typeof this.options.onDelete === 'function') {
          this.options.onDelete(publicKey);
        }
      }
    };
  }

  addMenuItem(item, id) {
    const icon = item.image
      ? `<span class="saito-modal-menu-option-icon" style="--saito-menu-icon: url('${item.image}')" aria-hidden="true"></span>`
      : `<i class="${item.icon}" aria-hidden="true"></i>`;

    document.querySelector('#saito-user-menu .saito-modal-content').innerHTML += `
          <div id="${id}" class="saito-modal-menu-option">${icon}<div class="saito-modal-menu-option-label">${item.text}</div></div>
        `;
  }
}

module.exports = UserMenu;
