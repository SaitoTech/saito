const UIModTemplate = require('./../../../templates/uimodtemplate');
const SaitoHeaderTemplate = require('./saito-header.template');
const FloatingMenu = require('./saito-floating-menu.template');
const SaitoOverlay = require('./../saito-overlay/saito-overlay');
const SaitoLoader = require('./../saito-loader/saito-loader');
const UserMenu = require('./../modals/user-menu/user-menu');
const SaitoBackup = require('./../modals/saito-backup/saito-backup');
const SelectNFT = require('./../saito-nft/overlays/select-nft-overlay');

//
// UIModTemplate
//
// The header derives from UIModTemplate -- this allows the component
// to be added to the list of modules that are actively running on Saito
// thus allowing them to receive transactions and update their UI just
// like any other modules.
//

//
// Note: inherits this.publicKey from modtemplate
//
class SaitoHeader extends UIModTemplate {
  constructor(app, mod) {
    super(app);

    //
    // UI components as modules allows them to respond
    // to events individually...
    //
    this.name = 'SaitoHeader UIComponent';
    this.slug = 'SaitoHeader';

    this.app = app;
    this.mod = mod;

    // employ non-standard css to spacing in header
    this.header_class = ''; // e.g. game, wide-screen, arcade

    // Header collects notifications to display a count on the hamburger icon
    this.notifications = {};

    // navigation for clicking on Saito logo in header
    this.header_location = '/' + mod.returnSlug();

    // Store the mod functions for when you click icon in the menu, e.g. "RedSquare"
    this.callbacks = {};

    this.web3_start_polling_timeout = null;
    this.can_update_header_msg = true;
    this.show_msg = true;
    this.back_button_callback = null;

    this.loader = new SaitoLoader(this.app, this.mod, '#qrcode');
    this.saito_backup = new SaitoBackup(app, mod);

    // listens for events
    this.select_nft_overlay = new SelectNFT(app, mod);

    console.log('Create Saito Header for ' + mod.name);
  }

  async initialize(app) {
    await super.initialize(app);

    //
    // initialized here because we need our publickey
    //
    this.userMenu = new UserMenu(app, this.publicKey);

    //
    // registry
    //
    app.connection.on('registry-update-identifier', (publicKey) => {
      if (publicKey === this.publicKey) {
        this.renderUsername();
      }
    });

    //
    // listen for inbound / outbound payments
    //
    app.connection.on('on-transaction-pending', async (obj = null) => {
      console.log('[header-mint-flash] on-transaction-pending received', {
        obj,
        installing_crypto: this.installing_crypto
      });
      if (!this.installing_crypto) {
        console.log('[header-mint-flash] on-transaction-pending -> renderCrypto()');
        this.renderCrypto(false, 'on-transaction-pending');
      } else {
        console.log(
          '[header-mint-flash] on-transaction-pending skipped renderCrypto (installing_crypto)'
        );
      }
    });

    app.connection.on('wallet-updated', async (obj = null) => {
      if (!this.installing_crypto) {
        this.renderCrypto();
      }
    });

    app.connection.on('on-payment-sent', async (obj = null) => {
      if (!this.installing_crypto) {
        this.renderCrypto();
      }
    });

    app.connection.on('on-payment-received', async (obj = null) => {
      if (!this.installing_crypto) {
        this.renderCrypto();
      }

      if (!obj) {
        console.debug('on-payment-received -- no object');
        return;
      }

      let amount = obj.amount;
      let ticker = obj.ticker;
      let sender = obj.sender;

      if (!amount || !ticker || !sender) {
        return;
      }
      if (sender === this.publicKey) {
        return;
      }

      siteMessage(
        `${amount} ${ticker} inbound from ${this.app.keychain.returnUsername(obj.sender)}`,
        3000
      );
    });

    app.connection.on('saito-header-update-message', (obj = {}) => {
      let msg = '';
      this.can_update_header_msg = true;

      if ('msg' in obj) {
        msg = obj.msg;
        this.can_update_header_msg = false;
      }

      let flash = false;
      let callback = null;
      let timeout = null;

      if (obj) {
        console.log('update header obj: ', obj);

        this.can_update_header_msg = true;
        if ('msg' in obj) {
          msg = obj.msg;
          this.can_update_header_msg = false;
        }

        if ('flash' in obj) {
          flash = obj.flash;
        }

        if ('callback' in obj) {
          callback = obj.callback;
        }

        if ('timeout' in obj) {
          timeout = obj.timeout;
        }
      }
      this.updateHeaderMessage(msg, flash, callback, timeout);
    });

    app.connection.on('saito-header-install-crypto', (ticker) => {
      console.log('install crypto');
      this.installing_crypto = ticker;
      try {
        document.querySelector('#qrcode').innerHTML = '';
        document.querySelector('.balance-amount').innerHTML = '';
        const addressContainer = document.querySelector('#profile-public-key');
        if (addressContainer) {
          addressContainer.dataset.add = '';
          addressContainer.innerHTML = '<div class="profile-public-key-text">generating keys...</div>';
          addressContainer.classList.add('generate-keys');
        }
        this.loader.show();
        siteMessage(`Installing ${ticker} in Saito Multiwallet...`, 2000);
      } catch (err) {
        console.error(err);
      }
    });

    app.connection.on('saito-crypto-activated', async (ticker) => {
      if (this.installing_crypto && this.installing_crypto == ticker) {
        const activated_mod = this.app.wallet.returnCryptoModuleByTicker(ticker);
        if (activated_mod?.categories === 'NFT') {
          this.installing_crypto = false;
        } else {
          setTimeout(() => {
            this.installing_crypto = false;
            this.app.connection.emit('saito-backup-render-request', {
              msg: `Your wallet has added new crypto keys for ${ticker}. Unless you backup your wallet, you may lose any deposits with those keys.`
            });
          }, 1500);
        }
      }
      await this.renderCrypto(true);
    });

    //
    // This allows us to replace the saito logo with a back arrow and a click event
    // In the future, we may want to parameterize what we replace the logo with
    //
    app.connection.on('saito-header-replace-logo', (callback = null) => {
      this.enableBackButton(callback);
    });

    app.connection.on('saito-header-change-location', (new_path) => {
      this.header_location = new_path;
    });

    app.connection.on('saito-header-render', () => {
      this.render();
    });

    app.connection.on('saito-header-reset-logo', () => {
      this.disableBackButton();
    });

    app.connection.on('saito-header-notification', (source_mod, unread) => {
      this.notifications[source_mod] = unread;
      let total = 0;
      for (let m in this.notifications) {
        total += this.notifications[m];
      }
      this.app.browser.addNotificationToId(total, 'saito-header-menu-toggle');
    });

    this.app.connection.on('saito-header-logo-change-request', (obj) => {
      this.disableBackButton();
    });

    const pendingListenerCount =
      typeof app.connection.listenerCount === 'function'
        ? app.connection.listenerCount('on-transaction-pending')
        : null;
    console.log('[header-mint-flash] SaitoHeader.initialize complete', {
      mod: this.mod?.name,
      on_transaction_pending_listener_count: pendingListenerCount
    });
  }

  resetHeaderLogo() {
    let logo = document.querySelector('.saito-header-logo-wrapper');
    if (logo) {
      logo.classList.remove('saito-header-logo-back');
      logo.innerHTML = this.app.browser.logoSVG();
      logo.onclick = (e) => {
        navigateWindow(this.header_location, 300);
      };
    }
  }

  enableBackButton(callback = null) {
    this.back_button_callback = typeof callback === 'function' ? callback : null;

    let logo = document.querySelector('.saito-header-logo-wrapper');

    if (logo) {
      logo.classList.add('saito-header-logo-back');
    }

    if (!document.querySelector('.saito-back-button')) {
      this.app.browser.addElementToSelector(
        `<i class="saito-back-button fa-solid fa-arrow-left"></i>`,
        '.saito-header-logo-wrapper'
      );
    }

    logo = document.querySelector('.saito-header-logo-wrapper');

    if (logo) {
      logo.onclick = (e) => {
        if (this.back_button_callback) {
          this.back_button_callback(e);
        }
      };
    }
  }

  disableBackButton() {
    this.back_button_callback = null;
    this.resetHeaderLogo();
  }

  async render() {
    if (this.mod == null || !document) {
      return;
    }

    //
    // add SaitoHeader to DOM if required
    //
    if (!document.getElementById('saito-header')) {
      this.app.browser.prependElementToDom(
        SaitoHeaderTemplate(this.app, this.mod, this.header_class)
      );
    } else {
      this.app.browser.replaceElementById(
        SaitoHeaderTemplate(this.app, this.mod, this.header_class),
        'saito-header'
      );
    }

    //
    // update header logo
    //
    this.resetHeaderLogo();

    //
    // add shortcut
    //
    if (this.mod?.use_floating_plus) {
      if (!document.getElementById('saito-floating-menu')) {
        this.app.browser.addElementToDom(FloatingMenu());
        this.addFloatingMenu();
      }
    }

    //
    // Process the respondTos for apps that install in the Hamburger menu
    //
    this.addHamburgerMenu();

    //
    // render QR code and cryptos
    //
    await this.renderCrypto(true);

    //
    // let modules render into .saito-header
    //
    await this.app.modules.renderInto('.saito-header');

    //
    // insert username
    //
    this.renderUsername();

    this.attachEvents();
  }

  /*******************************************
   *
   * Process and add floating plus menu items
   *
   ********************************************/
  addFloatingMenu() {
    let this_header = this;

    let index = 0;
    let menu_entries = [];

    //
    // collect menu items from respondTos
    //
    let mods = this.app.modules.respondTo('saito-floating-menu');
    for (const mod of mods) {
      let item = mod.respondTo('saito-floating-menu');

      if (item instanceof Array) {
        item.forEach((j) => {
          if (!j.rank) {
            j.rank = 100;
          }
          menu_entries.push(j);
        });
      }
    }

    // Sort menu items
    //
    let menu_sort = function (a, b) {
      if (a.rank < b.rank) {
        return 1;
      }
      if (a.rank > b.rank) {
        return -1;
      }
      return 0;
    };

    menu_entries = menu_entries.sort(menu_sort);

    // Check filters and add HTML
    //
    for (let i = 0; i < menu_entries.length; i++) {
      let j = menu_entries[i];
      let show_me = true;
      let active_mod = this.app.modules.returnActiveModule();
      if (typeof j.disallowed_mods != 'undefined') {
        if (j.disallowed_mods.includes(active_mod.slug)) {
          show_me = false;
        }
      }
      if (typeof j.allowed_mods != 'undefined') {
        show_me = false;
        if (j.allowed_mods.includes(active_mod.slug)) {
          show_me = true;
        }
      }
      if (show_me) {
        let id = `saito_floating_menu_item_${index}`;
        this_header.callbacks[index] = j.callback;
        this_header.addFloatingMenuItem(j, id, index);
        index++;
      }
    }
  }

  addFloatingMenuItem(item, id, index) {
    let html = `
          <div id="${id}" data-id="${index}" class="saito-floating-menu-item">
            <i class="${item.icon}"></i>
          </div>
        `;

    if (item?.is_active) {
      this.app.browser.addElementToSelector(html, '.saito-floating-item-container.main');
    } else {
      this.app.browser.addElementToSelector(html, '.saito-floating-item-container.alt');
    }
  }

  /*******************************************
   *
   * Process and add floating main menu items
   *
   ********************************************/
  addHamburgerMenu() {
    let mods = this.app.modules.respondTo('saito-header');

    let index = 0;
    let menu_entries = [];
    for (const mod1 of mods) {
      let item = mod1.respondTo('saito-header');
      if (item instanceof Array) {
        item.forEach((j) => {
          if (!j.rank) {
            j.rank = 100;
          }
          menu_entries.push(j);
        });
      }
    }

    let menu_sort = function (a, b) {
      if (a.rank < b.rank) {
        return -1;
      }
      if (a.rank > b.rank) {
        return 1;
      }
      return 0;
    };
    menu_entries = menu_entries.sort(menu_sort);

    for (let i = 0; i < menu_entries.length; i++) {
      let j = menu_entries[i];
      let show_me = true;
      let active_mod = this.app.modules.returnActiveModule();
      if (typeof j.disallowed_mods != 'undefined') {
        if (j.disallowed_mods.includes(active_mod.slug)) {
          show_me = false;
        }
      }
      if (typeof j.allowed_mods != 'undefined') {
        show_me = false;
        if (j.allowed_mods.includes(active_mod.slug)) {
          show_me = true;
        }
      }
      if (show_me) {
        let id = `saito_header_menu_item_${index}`;
        this.callbacks[id] = j.callback;
        this.addMenuItem(j, id);
        index++;

        if (j.event) {
          j.event(id);
        }
      }
    }

    Array.from(document.querySelectorAll('.saito-header-appspace-option.quicklaunch')).forEach(
      (elem) => {
        if (elem.dataset.navigation) {
          elem.oncontextmenu = (e) => {
            e.preventDefault();
            navigateWindow(elem.dataset.navigation);
          };
        }
      }
    );
  }

  addMenuItem(item, id) {
    let keyword = item.type;
    if (!keyword) {
      console.warn('Unclassified responder to saito-header!');
      keyword = 'module';
    }
    if (item.type == 'navigation' || item.type == 'quicklaunch') {
      keyword = 'module';
    }

    const icon = this.renderMenuItemIcon(item, keyword);

    let html = `     
      <li id="${id}" data-id="${item.text}" class="saito-header-appspace-option ${item.type}" ${item?.navigation ? `data-navigation="${item.navigation}"` : ''}>
        ${icon}
        <span class="saito-menu-item-label">${item.text}</span></li>`;

    let menu = document.querySelector(`.saito-header-menu-section .${keyword}-menu > ul`);
    if (menu) {
      menu.innerHTML += html;
      menu.parentElement.classList.remove('empty-menu-section');
    }
  }

  renderMenuItemIcon(item, keyword) {
    if (keyword === 'module') {
      const icon_paths = this.returnModuleMenuIconPaths(item.text);
      if (icon_paths) {
        return `<span class="saito-module-menu-icon-wrap" aria-hidden="true">
          <img class="saito-module-menu-icon saito-module-menu-icon-outline" src="${icon_paths.outline}" alt="">
          <img class="saito-module-menu-icon saito-module-menu-icon-solid" src="${icon_paths.solid}" alt="">
        </span>`;
      }
    }

    return `<i class="${item.icon}"></i>`;
  }

  returnModuleMenuIconPaths(text = '') {
    const key = text.toLowerCase().replace(/[^a-z0-9]/g, '');
    const icons = {
      arcade: 'saito-arcade-icon',
      chat: 'saito-chat-icon',
      filetransfer: 'saito-filetransfer-icon',
      fileshare: 'saito-filetransfer-icon',
      games: 'saito-games-icon',
      redsquare: 'saito-redsquare-icon',
      saitotalk: 'saito-talk-icon',
      swarmcast: 'saito-swarmcast-icon',
      talk: 'saito-talk-icon',
      vault: 'saito-vault-icon',
      stack: 'saito-stack-icon',
      rustscript: 'saito-rustscript-icon'
    };

    if (!icons[key]) {
      return null;
    }

    return {
      outline: `/saito/icons/${icons[key]}-outline.svg`,
      solid: `/saito/icons/${icons[key]}-solid.svg`
    };
  }

  attachEvents() {
    let app = this.app;
    let mod = this.mod;
    let this_header = this;

    //
    // Open/close sidebar
    //

    if (document.querySelector('#saito-header-menu-toggle')) {
      document.querySelector('#saito-header-menu-toggle').addEventListener('click', () => {
        document.querySelector('.saito-header-hamburger-contents').classList.remove('show-wallet');
        this.toggleMenu();
      });
    }

    if (document.querySelector('.saito-header-backdrop')) {
      document.querySelector('.saito-header-backdrop').onclick = () => {
        document.querySelector('.saito-header-hamburger-contents').classList.remove('show-wallet');
        this.toggleMenu();
      };
    }

    //
    // default buttons
    //
    if (document.getElementById('wallet-btn-withdraw')) {
      document.getElementById('wallet-btn-withdraw').onclick = (e) => {
        document.querySelector('.saito-header-hamburger-contents').classList.remove('show-wallet');
        app.connection.emit('saito-crypto-withdraw-render-request');
        this.hideMenu();
      };
    }

    if (document.getElementById('wallet-btn-settings')) {
      document.getElementById('wallet-btn-settings').onclick = (e) => {
        document.querySelector('.saito-header-hamburger-contents').classList.remove('show-wallet');
        app.connection.emit('settings-overlay-render-request');
        this.hideMenu();
      };
    }

    if (document.getElementById('wallet-btn-details')) {
      document.getElementById('wallet-btn-details').onclick = (e) => {
        document.querySelector('.saito-header-hamburger-contents').classList.toggle('show-wallet');
        Array.from(e.currentTarget.children).forEach((c) => {
          c.classList.toggle('hideme');
        });
      };
    }

    if (document.getElementById('wallet-btn-nft')) {
      document.getElementById('wallet-btn-nft').onclick = (e) => {
        try {
          const kids = document.querySelectorAll('#wallet-btn-details > *');
          kids[0]?.classList.remove('hideme'); // wallet icon
          kids[1]?.classList.remove('hideme'); // "Wallet" span
          kids[2]?.classList.add('hideme'); // list icon
          kids[3]?.classList.add('hideme'); // "Back" span
        } catch (err) {}
        document.querySelector('.saito-header-hamburger-contents').classList.remove('show-wallet');
        this.app.connection.emit('saito-nft-list-render-request');
      };
    }

    if (document.querySelector('.pubkey-mobile-wrapper')) {
      document.querySelector('.pubkey-mobile-wrapper').onclick = (e) => {
        document.querySelector('.saito-header-hamburger-contents').classList.toggle('show-qr');
      };
    }

    document.querySelector('.pubkey-containter').onclick = async (e) => {
      let public_key = document.getElementById('profile-public-key').dataset.add;

      await navigator.clipboard.writeText(public_key);
      let icon_element = document.querySelector('.pubkey-containter i.fa-copy');
      icon_element.classList.toggle('fa-copy');
      icon_element.classList.toggle('fa-check');

      setTimeout(() => {
        icon_element.classList.toggle('fa-copy');
        icon_element.classList.toggle('fa-check');
      }, 800);
    };

    //
    // Change preferred (displayed) crypto currency
    //
    if (document.getElementById('wallet-select-crypto')) {
      document.getElementById('wallet-select-crypto').onchange = async (e) => {
        if (
          !this.app.options.crypto[e.target.value] ||
          !this.app.options.crypto[e.target.value].address
        ) {
          this.app.connection.emit('saito-header-install-crypto', e.target.value);
        }

        await app.wallet.setPreferredCrypto(e.target.value);

        console.log(
          'Change preferred crypto, restart polls on crypto balance and pending deposits'
        );
        clearTimeout(this.web3_start_polling_timeout);

        let preferred_crypto = this.app.wallet.returnPreferredCrypto();
        preferred_crypto.startPolling();
      };
    }

    //
    // Apps
    //
    document.querySelectorAll('.saito-header-appspace-option').forEach((menu) => {
      let id = menu.getAttribute('id');
      let data_id = menu.getAttribute('data-id');
      let callback = this_header.callbacks[id];

      menu.addEventListener('click', async (e) => {
        this.toggleMenu();
        e.preventDefault();
        callback(app, data_id);
      });
    });

    //
    // Mobile support
    //
    if (document.querySelector('#saito-floating-plus-btn')) {
      document.getElementById('saito-floating-plus-btn').onclick = (e) => {
        document.getElementById('saito-floating-menu').classList.toggle('activated');
      };
    }

    if (document.getElementById('saito-floating-menu-mask')) {
      document.getElementById('saito-floating-menu-mask').onclick = (e) => {
        let mask = e.currentTarget;

        document.getElementById('saito-floating-menu').classList.toggle('activated');
      };
    }

    document.querySelectorAll('.saito-floating-menu-item').forEach((menu) => {
      let id = menu.getAttribute('id');
      let data_id = menu.getAttribute('data-id');
      let callback = this_header.callbacks[data_id];

      menu.onclick = (e) => {
        e.preventDefault();
        callback(this_header.app, data_id);
        console.log('hi!');
        document.getElementById('saito-floating-menu').classList.toggle('activated');
      };
    });
  }

  toggleMenu() {
    if (
      document.querySelector('.saito-header-hamburger-contents').classList.contains('show-menu')
    ) {
      this.hideMenu();
    } else {
      this.openMenu();
    }
  }

  openMenu() {
    if (
      !document.querySelector('.saito-header-hamburger-contents').classList.contains('show-menu')
    ) {
      document.querySelector('.saito-header-hamburger-contents').classList.add('show-menu');
      document.querySelector('.saito-header-backdrop').classList.add('menu-visible');

      //
      // start polling web3 crypto
      //
      if (this.web3_start_polling_timeout) {
        clearTimeout(this.web3_start_polling_timeout);
        this.web3_start_polling_timeout = null;
      }

      //
      // after 10 seconds, query to update web3 balance if active
      //
      this.web3_start_polling_timeout = setTimeout(() => {
        this.web3_start_polling_timeout = null;
        if (
          !document
            .querySelector('.saito-header-hamburger-contents')
            ?.classList.contains('show-menu')
        ) {
          return;
        }
        let c = this.app.wallet.returnPreferredCrypto();
        if (c.categories === 'NFT') {
          return;
        }
        c.startPolling();
      }, 10000);
    }
  }

  hideMenu() {
    try {
      const kids = document.querySelectorAll('#wallet-btn-details > *');
      kids[0]?.classList.remove('hideme'); // wallet icon
      kids[1]?.classList.remove('hideme'); // "Wallet" span
      kids[2]?.classList.add('hideme'); // list icon
      kids[3]?.classList.add('hideme'); // "Back" span
    } catch (err) {}

    if (
      document.querySelector('.saito-header-hamburger-contents').classList.contains('show-menu')
    ) {
      document.querySelector('.saito-header-hamburger-contents').classList.remove('show-menu');
      document.querySelector('.saito-header-backdrop').classList.remove('menu-visible');
    }

    //
    // clear web3 polling if active
    //
    if (this.web3_start_polling_timeout) {
      clearTimeout(this.web3_start_polling_timeout);
      this.web3_start_polling_timeout = null;
    }
    let c = this.app.wallet.returnPreferredCrypto();
    c.stopPolling();
  }

  /****************************************************
   *
   * A pair of functions to update the user name field in the header
   * and attach click functionality.
   *
   ***************************************************/
  updateHeaderMessage(text = '', flash = false, callback = null, timeout = 0) {
    let this_self = this;
    let el = document.getElementById('header-msg');

    if (text == '') {
      this.renderUsername();
    } else {
      el.innerHTML = text;
    }

    if (flash) {
      el.classList.add('flash');
    } else {
      el.classList.remove('flash');
    }

    if (callback != null) {
      if (timeout) {
        console.log('timeout: //////////', timeout);
        setTimeout(function () {
          console.log('Clear flashing reminder from saito-header/updateHeaderMessage');
          this_self.updateHeaderMessage();
        }, timeout);
      }

      //
      // Always click once to clear...
      //
      el.onclick = () => {
        delete this.app.options.wallet.backup_required;
        this.updateHeaderMessage();
        callback();
      };
    }
  }

  renderUsername() {
    let header_self = this;

    let key = this.app.keychain.returnKey(this.publicKey);
    let username = key?.identifier
      ? key.identifier
      : this.app.keychain.returnIdentifierByPublicKey(this.publicKey, true);

    if (username == '' || username == this.publicKey) {
      if (this.app.browser.isMobileBrowser()) {
        username = 'Anonymous';
      } else {
        username = 'Anonymous Account';
      }
      if (key?.has_registered_username) {
        username = 'registering...';
      }
    }

    let el = document.getElementById('header-msg');
    if (!el) {
      return;
    }

    //Update name
    el.innerHTML = sanitize(username);
    el.classList.remove('flash');

    //Differential behavior
    if (username === 'Anonymous Account' || username === 'Anonymous') {
      el.onclick = (e) => {
        header_self.app.connection.emit('register-username-or-login', {
          // this gets saved to be called *not* when we submit the name, but when we receive
          // the onchain confirmation
          success_callback: (desired_identifier) => {
            header_self.app.connection.emit('saito-backup-render-request', {
              msg: `'${desired_identifier}' succesfully registered, back up now to protect your account`
            });
          }
        });
      };
    } else if (username == 'registering...') {
      el.onclick = null;
    } else {
      if (key?.email) {
        //Launch profile
        el.onclick = (e) => {
          header_self.userMenu.render();
        };
      } else {
        //Prompt email registration
        el.onclick = (e) => {
          header_self.app.connection.emit('recovery-backup-overlay-render-request');
        };
      }
    }

    console.log(
      'Saito-header renderUsername backup_required? ',
      this.app.options.wallet?.backup_required
    );
    if (this.app.options.wallet?.backup_required) {
      // Display the (updated) user name for a few seconds before restoring the flashing warning
      setTimeout(() => {
        // Make sure still neeeded!
        if (this.app.options.wallet?.backup_required) {
          // Backwards compatibility
          if (this.app.options.wallet.backup_required == 1) {
            this.app.options.wallet.backup_required = `Have you backed up your wallet recently? Keep your keys and account safe by backing up`;
          }

          console.log('Restore flashing reminder from saito-header');
          this.updateHeaderMessage('wallet backup required', true, () => {
            this.app.connection.emit('saito-backup-render-request', {
              msg: this.app.options.wallet.backup_required,
              title: 'BACKUP YOUR WALLET'
            });
          });
        }
      }, 4500);
    }
  }

  /********************************************************
   * ******************************************************
   *
   * Integrate Saito MultiWallet
   *
   * *******************************************************
   *
   * We need to be very careful about what goes in here because this is called * A LOT *
   *
   * on-transaction-pending / on-payment-sent / on-payment-received
   *
   * (previously, on-wallet-update)
   *
   * So if there is something in here that awaits a remote API call, it can be very costly
   *
   * *******************************************************/
  async renderCrypto(force = false, flashDebugTrigger = null) {
    const flashDebug = flashDebugTrigger === 'on-transaction-pending';
    if (flashDebug) {
      console.log('[header-mint-flash] renderCrypto begin', { force, flashDebugTrigger });
    }

    let available_cryptos = this.app.wallet.returnInstalledCryptos();
    let preferred_crypto = this.app.wallet.returnPreferredCrypto();
    let add = preferred_crypto.returnAddress();

    try {
      //
      // insert address and qrcode
      //
      const addressContainer = document.querySelector('#profile-public-key');
      if (add && addressContainer) {
        if (addressContainer.dataset?.add != add || force) {
          if (addressContainer.classList.contains('generate-keys')) {
            addressContainer.classList.remove('generate-keys');
          }

          addressContainer.dataset.add = add;
          addressContainer.innerHTML = `${add.slice(0, 8)}...${add.slice(-8)}`;

          document.querySelector('#qrcode').style.visibility = 'hidden';
          document.querySelector('#qrcode').style.opacity = '0';

          document.querySelector('#qrcode').innerHTML = '';
          this.app.browser.generateQRCode(add, 'qrcode');
          setTimeout(() => {
            document.querySelector('#qrcode').removeAttribute('style');
          }, 100);
        }
      }

      //
      // dropdown crypto options
      //
      document.querySelector('.wallet-select-crypto').innerHTML = '';
      for (let crypto_mod of available_cryptos) {
        let options_html = `<option ${crypto_mod.name == preferred_crypto.name ? 'selected' : ``} id="crypto-option-${crypto_mod.name}" value="${crypto_mod.ticker}">${crypto_mod.ticker}</option>`;
        this.app.browser.addElementToSelector(options_html, '.wallet-select-crypto');
      }

      let b_elm = document.querySelector('.balance-amount');
      const cached_balance = preferred_crypto.balance;
      b_elm.innerHTML = this.app.browser.returnBalanceHTML(cached_balance);

      if (flashDebug) {
        console.log('[header-mint-flash] renderCrypto painted cached balance first', {
          ticker: preferred_crypto.ticker,
          cached_balance,
          categories: preferred_crypto.categories,
          pending_balance_field: preferred_crypto.pending_balance,
          last_balance_field: preferred_crypto.last_balance
        });
      }

      let ab = await preferred_crypto.getAvailableBalance();
      let pb = await preferred_crypto.getPendingBalance();

      console.log('****** CHECKING BALANCES SAITO HEADER ******');
      console.log('available balance: ' + ab);
      console.log('pending balance: ' + pb);

      //
      // insert crypto balance
      //
      try {
        if (preferred_crypto.isActivated()) {
          console.log(
            '@@@ RenderCrypto -- ',
            preferred_crypto.ticker,
            preferred_crypto.balance,
            ab,
            pb,
            preferred_crypto.pending_balance,
            preferred_crypto.last_balance
          );

          const strict_pending_diff = pb !== ab;
          const numeric_pending_diff = Number(pb) !== Number(ab);
          let flash_branch = 'none';

          if (preferred_crypto.categories === 'NFT') {
            if (pb !== ab) {
              flash_branch = 'nft-pending-flash-on';
              b_elm.classList.add('pending');
              b_elm.innerHTML = `<span class="balance-amount-whole">${pb}</span>`;
            } else {
              flash_branch = 'nft-pending-flash-off';
              b_elm.classList.remove('pending');
              b_elm.innerHTML = `<span class="balance-amount-whole">${ab}</span>`;
            }
          } else if (pb !== ab) {
            flash_branch = 'saito-pending-flash-on';
            b_elm.classList.add('pending');
            b_elm.innerHTML = this.app.browser.returnBalanceHTML(pb);
          } else {
            flash_branch = 'saito-pending-flash-off';
            b_elm.classList.remove('pending');
            b_elm.innerHTML = this.app.browser.returnBalanceHTML(ab);
          }

          if (flashDebug) {
            console.log('[header-mint-flash] renderCrypto balance decision', {
              ticker: preferred_crypto.ticker,
              categories: preferred_crypto.categories,
              available_balance: ab,
              pending_balance: pb,
              strict_pending_diff,
              numeric_pending_diff,
              flash_branch,
              has_pending_class: b_elm.classList.contains('pending'),
              displayed_html: b_elm.innerHTML
            });
          }
        } else if (flashDebug) {
          console.log(
            '[header-mint-flash] renderCrypto skipped flash logic (crypto not activated)',
            {
              ticker: preferred_crypto.ticker
            }
          );
        }
      } catch (err) {
        console.error('Error rendering crypto balance: ' + err);
        if (flashDebug) {
          console.error('[header-mint-flash] renderCrypto balance decision error', err);
        }
      }

      let menu_html = '';
      for (let i = 0; i < available_cryptos.length; i++) {
        //
        // get cryptos available
        //
        let crypto_mod = available_cryptos[i];

        //
        // mixin handles logos
        //
        let rtn_val = crypto_mod.returnLogos();
        let logo_src = rtn_val.img;
        let sublogo_src = rtn_val.sub_logo;

        if (crypto_mod.ticker) {
          if (crypto_mod.isActivated()) {
            pb = await crypto_mod.getPendingBalance();
            ab = await crypto_mod.getAvailableBalance();
          } else {
            pb = ab = '0';
          }

          menu_html += `<div class="saito-header-crypto ${crypto_mod.isActivated() ? 'active' : 'unactive'}" data-ticker="${crypto_mod.ticker}">`;
          menu_html += `<div class="crypto-logo-container"><img class="crypto-logo" src="${logo_src}">`;
          if (sublogo_src) {
            menu_html += `<img class="chain-logo" src="${sublogo_src}">`;
          }
          menu_html += `</div><div class="header-crypto-balance">${this.app.browser.formatDecimals(ab)} ${crypto_mod.ticker}</div>`;

          if (crypto_mod.isActivated() && Number(pb) != Number(ab)) {
            menu_html += `<div class="header-crypto-pending">${this.app.browser.formatDecimals(pb)} pending </div>`;
          } else {
            menu_html += '<div></div>';
          }

          menu_html += `</div>`;
        }
      }

      this.app.browser.replaceElementBySelector(
        `<div class="saito-header-wallet-menu saito-menu-select-subtle">${menu_html}</div>`,
        '.saito-header-wallet-menu'
      );
    } catch (err) {
      console.error('Error rendering crypto selector: ' + err);
    }

    //
    //
    //
    Array.from(document.querySelectorAll('.saito-header-crypto')).forEach((c) => {
      c.onclick = (e) => {
        this.app.connection.emit(
          'saito-crypto-details-render-request',
          e.currentTarget.dataset.ticker
        );
        this.hideMenu();
      };
    });

    if (document.querySelector('.balance-amount')) {
      document.querySelector('.balance-amount').onclick = (e) => {
        this.app.connection.emit(
          'saito-crypto-details-render-request',
          this.app.wallet.returnPreferredCryptoTicker()
        );
        this.hideMenu();
      };
    }

    console.log('done wallet update...' + preferred_crypto.ticker);

    if (flashDebug) {
      const b_done = document.querySelector('.balance-amount');
      console.log('[header-mint-flash] renderCrypto complete', {
        ticker: preferred_crypto.ticker,
        has_pending_class: b_done?.classList?.contains('pending') ?? null,
        displayed_html: b_done?.innerHTML ?? null
      });
    }
  }
}

module.exports = SaitoHeader;
