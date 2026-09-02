const GameWizardTemplate = require('./wizard.template.js');
const CryptoStakingOverlay = require('./crypto-staking-overlay.js');
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
    this.obj = obj;
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
    });
    this.overlay.setBackground(this.game_mod.respondTo('arcade-games').image);

    //Test if we should include Advanced Options
    let advancedOptions = this.game_mod.returnAdvancedOptions();
    if (!advancedOptions) {
      let advanced_btn = document.querySelector('.arcade-wizard .advanced-btn');
      if (advanced_btn) {
        advanced_btn.hidden = true;
      }
    } else {
      let accept_button = `<div id="game-wizard-advanced-return-btn" class="game-wizard-advanced-return-btn saito-button-primary">Accept</div>`;
      if (!advancedOptions.includes(accept_button)) {
        advancedOptions += accept_button;
      }
      advancedOptions = `<div id="advanced-options-overlay-container">${advancedOptions}</div>`;

      this.meta_overlay = new SaitoOverlay(this.app, this.mod, false, false); // Have to manually delete when done
      this.meta_overlay.show(advancedOptions);
      this.meta_overlay.hide();
    }

    //Hook for Crypto module (if installed) to add button to attach functionality
    await this.app.modules.renderInto('#arcade-advance-opt');
    this.attachCryptoHookEvents();

    this.attachEvents();

    if (this.obj?.skip) {
      if (this.game_mod.maxPlayers === 1) {
        if (!this.game_mod.returnSingularGameOption() && !advancedOptions) {
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
    if (advancedOptionsToggle) {
      advancedOptionsToggle.onclick = (e) => {
        this.meta_overlay.show();
        this.game_mod.attachAdvancedOptionsEventListeners();
        this.meta_overlay.blockClose('#game-wizard-advanced-return-btn');

        if (document.getElementById('game-wizard-advanced-return-btn')) {
          document.querySelector('.game-wizard-advanced-return-btn').onclick = (e) => {
            this.meta_overlay.hide();
          };
        }
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
