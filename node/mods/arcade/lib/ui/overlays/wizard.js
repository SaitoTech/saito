const GameWizardTemplate = require('./wizard.template.js');
const AdvancedOptionsTemplate = require('./advanced-options.template.js');
const CryptoStakingOverlay = require('./crypto-staking-overlay.js');
const ArcadeNftSelectionOverlay = require('./nft-selection.js');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay.js');

//
// {
//    game   : module_name
//    league : league_obj { id , name , mod }
// }
//

class GameWizard {
  constructor(app, mod, game_mod = null, obj = {}) {
    this.app = app;
    this.mod = mod;
    this.game_mod = game_mod;
    this.overlay = new SaitoOverlay(app, mod);
    this.crypto_staking_overlay = new CryptoStakingOverlay(app, mod);
    this.nft_selection_overlay = new ArcadeNftSelectionOverlay(app, mod);
    this.obj = obj;
    this.selected_nfts = [];
    this._invite_menu_closer = null;

    app.connection.on('arcade-launch-game-wizard', async (obj) => {
      if (obj?.game) {
        let game_mod = this.app.modules.returnModuleByName(obj.game);

        if (game_mod) {
          //
          // teasers
          //
          if (game_mod.is_teaser || game_mod.teaser === true) {
            this.app.connection.emit('arcade-teaser-install-render-request', {
              game_mod,
              title: game_mod.returnName ? game_mod.returnName() : game_mod.name,
              image: game_mod.img || '',
              link: game_mod.link || '',
              description: game_mod.description || ''
            });
            return;
          }

          //
          // We do a little check that if we already have a game in the options,
          // we prompt them to continue that one instead of creating a new game
          //
          if (game_mod.doWeHaveAnOngoingGame()) {
            if (obj.skip) {
              navigateWindow(`/${game_mod.returnSlug()}/`);
            } else {
              console.info('arcade-launch-game-wizard found existing game', game_mod.game);
              app.connection.emit('arcade-continue-game-from-options', game_mod);
            }
          } else {
            //Launch game wizard
            this.game_mod = game_mod;
            this.obj = obj;
            this.selected_nfts = [];
            this.render();
          }
        } else {
          console.error('arcade-launch-game-wizard -- game module not found!', obj);
        }
      }
    });
  }

  async render() {
    //
    // Create the game wizard overlay
    //  & set a callback to remove the advanced options overlay if we change our mind about creating a game
    //
    if (this.mod.debug) {
      console.debug('ARCADE: render game-wizard for: ', JSON.parse(JSON.stringify(this.obj)));
    }

    this.detachInviteMenuCloser();

    this.overlay.show(GameWizardTemplate(this.game_mod, this.obj), () => {
      this.detachInviteMenuCloser();
      if (this.meta_overlay) {
        this.meta_overlay.remove();
      }
      if (this.nft_selection_overlay?.overlay) {
        this.nft_selection_overlay.overlay.remove();
      }
    });
    this.overlay.setBackground(this.game_mod.respondTo('arcade-games').image);

    // Test if we should include Advanced Options
    let advancedOptionsHtml = this.game_mod.returnAdvancedOptions();
    if (!advancedOptionsHtml) {
      let advanced_btn = document.querySelector('.arcade-wizard .advanced-btn');
      if (advanced_btn) {
        advanced_btn.hidden = true;
      }
    } else {
      // Shared shell owns header / scroll body / Submit; game HTML is content only.
      // Closebox on; keep DOM on hide so selections survive reopen.
      this.meta_overlay = new SaitoOverlay(this.app, this.mod, true, false);
      this.meta_overlay.show(AdvancedOptionsTemplate(advancedOptionsHtml));
      this.meta_overlay.hide();
      // Bind while the controls are in the DOM, before the player opens the overlay,
      // so scenario defaults are submitted even if Advanced is never opened.
      if (typeof this.game_mod.attachAdvancedOptionsEventListeners === 'function') {
        this.game_mod.attachAdvancedOptionsEventListeners();
      }
    }

    //Hook for Crypto module (if installed) to add button to attach functionality
    await this.app.modules.renderInto('#arcade-advance-opt');
    this.attachCryptoHookEvents();
    await this.updateNftsButtonVisibility();

    this.attachEvents();

    if (this.obj?.skip) {
      if (this.game_mod.maxPlayers === 1) {
        if (!this.game_mod.returnSingularGameOption() && !advancedOptionsHtml) {
          let btn = document.querySelector('.arcade-wizard .game-invite-btn');
          if (btn) {
            btn.click();
          }
        }
      }
    }
  }

  async userHasNoTokens() {
    let balances = await this.app.wallet.returnAvailableCryptosAssociativeArray();

    for (let ticker in balances) {
      if (parseFloat(balances[ticker].balance) > 0) {
        return false;
      }
    }

    return true;
  }

  walletHasSupportedNfts() {
    const supported = this.game_mod?.supported_nft_types;
    if (!Array.isArray(supported) || !supported.length) {
      return false;
    }

    const nft_list = this.app.options?.wallet?.nfts || [];
    for (const rec of nft_list) {
      let nft_type = '';
      try {
        nft_type = this.app.wallet.extractNFTType(rec?.slip3?.utxo_key || '') || '';
      } catch (_) {
        nft_type = '';
      }
      if (nft_type && supported.includes(nft_type)) {
        return true;
      }
    }

    return false;
  }

  async updateNftsButtonVisibility() {
    const btn = document.querySelector('.arcade-wizard .nfts-btn');
    if (!btn) {
      return;
    }

    const supported = this.game_mod?.supported_nft_types;
    if (!Array.isArray(supported) || !supported.length) {
      btn.hidden = true;
      return;
    }

    try {
      await this.app.wallet.updateNFTList();
    } catch (err) {
      console.error('ARCADE: failed to refresh wallet NFTs for wizard', err);
    }

    const show = this.walletHasSupportedNfts();
    btn.hidden = !show;
    btn.classList.toggle('has-selection', show && this.selected_nfts.length > 0);
  }

  attachCryptoHookEvents() {
    let hook = document.querySelector('.game-wizard-crypto-hook');
    if (!hook) {
      return;
    }

    let original_onclick = hook.onclick;

    hook.onclick = async (e) => {
      if (await this.userHasNoTokens()) {
        this.crypto_staking_overlay.render();
        return;
      }

      if (original_onclick) {
        original_onclick.call(hook, e);
      }
    };
  }

  detachInviteMenuCloser() {
    if (this._invite_menu_closer) {
      document.removeEventListener('click', this._invite_menu_closer, true);
      this._invite_menu_closer = null;
    }
  }

  closeInviteMenu(control = null) {
    let root = control || document.querySelector('.arcade-wizard .invite-control');
    if (!root) {
      return;
    }
    let menu = root.querySelector('.invite-menu');
    let toggle = root.querySelector('.invite-toggle');
    if (menu) {
      menu.hidden = true;
    }
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
    }
  }

  //
  // Note: mod = Arcade
  //
  attachEvents() {
    let root = document.querySelector('.arcade-wizard');
    if (!root) {
      return;
    }

    let invite_control = root.querySelector('.invite-control');
    if (invite_control) {
      let toggle = invite_control.querySelector('.invite-toggle');
      let menu = invite_control.querySelector('.invite-menu');
      let primary = invite_control.querySelector('.invite-primary');

      if (toggle && menu) {
        toggle.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          let open = menu.hidden;
          menu.hidden = !open;
          toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        };

        this.detachInviteMenuCloser();
        this._invite_menu_closer = (e) => {
          if (!invite_control.contains(e.target)) {
            this.closeInviteMenu(invite_control);
          }
        };
        document.addEventListener('click', this._invite_menu_closer, true);

        root.querySelectorAll('.invite-option').forEach((opt) => {
          opt.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            let gameType = opt.getAttribute('data-type');
            this.closeInviteMenu(invite_control);
            await this.submitInvite(gameType);
          };
        });
      }

      if (primary) {
        primary.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await this.submitInvite(primary.getAttribute('data-type'));
        };
      }
    }

    //
    // Display Advanced Options Overlay
    //
    const advancedOptionsToggle = root.querySelector('.advanced-btn');
    if (advancedOptionsToggle && this.meta_overlay) {
      advancedOptionsToggle.onclick = (e) => {
        this.meta_overlay.show();
        this.game_mod.attachAdvancedOptionsEventListeners();
        // Backdrop click nudges Submit / closebox; neither creates the invite.
        this.meta_overlay.blockClose('#game-wizard-advanced-return-btn');

        let submit_btn = document.getElementById('game-wizard-advanced-return-btn');
        if (submit_btn) {
          submit_btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.meta_overlay.hide();
          };
        }
      };
    }

    //
    // Display NFT Selection Overlay
    //
    const nftsOptionsToggle = root.querySelector('.nfts-btn');
    if (nftsOptionsToggle) {
      nftsOptionsToggle.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.nft_selection_overlay.render({
          supported_nft_types: this.game_mod.supported_nft_types || [],
          initially_selected: this.selected_nfts,
          owner: this.mod.publicKey,
          onConfirm: (records) => {
            this.selected_nfts = Array.isArray(records) ? records : [];
            nftsOptionsToggle.classList.toggle('has-selection', this.selected_nfts.length > 0);
          }
        });
      };
    }

    //
    // Display Rules Overlay
    //
    if (document.getElementById('game-rules-btn')) {
      document.getElementById('game-rules-btn').onclick = () => {
        let rules_overlay = new SaitoOverlay(this.app, this.mod);
        rules_overlay.show(this.game_mod.returnGameRulesHTML());
      };
    }

    //
    // Single-player Play button
    //
    let play_btn = root.querySelector('.game-invite-btn[data-type="single"]');
    if (play_btn) {
      play_btn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this.submitInvite('single');
      };
    }
  }

  async submitInvite(gameType = 'open') {
    let options = this.getOptions();

    this.detachInviteMenuCloser();
    this.overlay.remove();

    if (gameType == 'private') {
    } else if (gameType == 'single') {
      if (typeof this.game_mod.launchFromArcadeWizard === 'function') {
        this.game_mod.launchFromArcadeWizard(options, this.obj);
        return;
      }
      this.mod.makeGameInvite(options, 'private', this.obj);
      return;
    } else if (gameType == 'direct') {
    } else if (gameType == 'async') {
      if (options['game-wizard-players-select'] > 2) {
        salert(
          'Asynchronous game creation is experimental and assumes there are only two players!'
        );
        return;
      }
      options.async_dealing = 1;
      gameType = 'private';
    } else {
    }

    this.mod.makeGameInvite(options, gameType, this.obj);
  }

  getOptions() {
    let options = {};
    document
      .querySelectorAll(
        '#advanced-options-overlay-container input, #advanced-options-overlay-container select, .arcade-wizard input, .arcade-wizard select'
      )
      .forEach((element) => {
        if (element.name) {
          if (element.type == 'checkbox') {
            if (element.checked) {
              options[element.name] = 1;
            }
          } else if (element.type == 'radio') {
            if (element.checked) {
              options[element.name] = element.value;
            }
          } else {
            options[element.name] = element.value;
          }
        }
      });

    if (document.querySelector('.game-wizard-crypto-hook')) {
      let hook = document.querySelector('.game-wizard-crypto-hook');
      if (hook.dataset?.ticker && hook.dataset?.amount) {
        options['crypto'] = hook.dataset.ticker;
        options['stake'] = hook.dataset.amount;

        if (hook.dataset.match != undefined) {
          options['stake'] = {
            min: parseFloat(hook.dataset.match)
          };
          options['stake'][this.mod.publicKey] = parseFloat(hook.dataset.amount);
        }
      }
    }

    if (this.selected_nfts?.length) {
      options.nfts = this.selected_nfts.map((rec) => ({
        title: rec.title || '',
        id: String(rec.id),
        owner: rec.owner || this.mod.publicKey,
        nft_type: rec.nft_type || ''
      }));
    }

    if (this.mod.debug) {
      console.debug(
        'ARCADE game-wizard -- reading options from HTML: ',
        JSON.parse(JSON.stringify(options))
      );
    }

    if (this.meta_overlay) {
      this.meta_overlay.remove();
    }

    // Check for open table here
    if (options['game-wizard-players-select'] == 'open-table') {
      options['open-table'] = 1;
      options['game-wizard-players-select'] = 2;
      options['game-wizard-players-select-max'] = 6;
    }

    return options;
  }
}

module.exports = GameWizard;
