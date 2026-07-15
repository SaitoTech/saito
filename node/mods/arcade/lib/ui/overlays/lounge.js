const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const LoungeOverlayTemplate = require('./lounge.template');
const jsonTree = require('json-tree-viewer');

/*
  General Interface for the Overlay that comes up when you click on a (game) "invite".
  There are several circumstances that affect what a user can do with the overlay, but because
  so much of the UI is identical it is better to have it all in one file instead of multiple
  files with the logic spread out across all the places where you might need to trigger the overlay.

  The basic purpose is to display the game details (results of game-selector/game-wizard) and allow a player to join/cance
*/

class LoungeOverlay {
  constructor(app, mod, invite) {
    this.app = app;
    this.mod = mod;
    this.invite = invite;
    this.game_id = null;
    this.overlay = new SaitoOverlay(app, mod, false, true); //No close button, auto-delete overlay

    app.connection.on('relay-is-online', async (pkey) => {
      if (this.invite && pkey == this.invite.originator) {
        if (document.getElementById(`invite-user-${pkey}`)) {
          document.getElementById(`invite-user-${pkey}`).classList.add('online');
        }
      }
    });

    app.connection.on('relay-is-busy', async (pkey) => {
      if (this.invite && pkey == this.invite.originator) {
        if (document.getElementById(`invite-user-${pkey}`)) {
          document.getElementById(`invite-user-${pkey}`).classList.add('online');
          document.getElementById(`invite-user-${pkey}`).classList.add('busy');
        }
      }
    });

    app.connection.on('arcade-close-game', (game_id) => {
      if (game_id == this?.game_id) {
        this.overlay.close();
        if (this.mod.browser_active && this.mod.ui) {
          this.mod.ui.render();
        }
      }
    });
  }

  render() {
    if (this.game_id != null && this.invite == null) {
      this._renderGameIdMode();
      return;
    }

    let game_mod = this.app.modules.returnModuleBySlug(this.invite.game_slug);

    if (this.mod.sudo) {
      this.overlay.show(
        `<div class="arcade-lounge debug_overlay"><button class="saito-button-primary" id="clear-invite">Delete</button></div>`
      );

      if (!this.mod.styles.includes('/saito/lib/jsonTree/jsonTree.css')) {
        this.mod.styles.push('/saito/lib/jsonTree/jsonTree.css');
        this.mod.attachStyleSheets();
      }

      let el = document.querySelector('.arcade-lounge');

      try {
        let optjson = JSON.parse(
          JSON.stringify(this.invite, (key, value) => (key == 'game_mod' ? 'game_mod' : value))
        );

        var tree = jsonTree.create(optjson, el);
      } catch (err) {
        console.error('ARCADE: [joinGame] error creating jsonTree: ', err);
      }
    } else {
      this.overlay.show(LoungeOverlayTemplate(this.app, this.mod, this.invite));
    }

    this.overlay.setBackground(game_mod.respondTo('arcade-games').image);
    this.attachEvents();
    this.app.connection.emit('add-league-identifier-to-dom');
  }

	_resolveGameIdContext() {
		let game = this.mod.returnGame(this.game_id);
		const state = game?.state;
		const txGame = game?.tx?.msg?.game;
		const stateModule = state?.module;
		let game_mod =
			this.app.modules.returnModule(txGame) ||
			this.app.modules.returnModuleBySlug(stateModule || txGame || 'arcade') ||
			this.app.modules.returnModule(stateModule);
		if (!game_mod && this.observer_game_module_slug) {
			game_mod = this.app.modules.returnModuleBySlug(this.observer_game_module_slug);
		}
		let slug =
			game_mod?.returnSlug?.() ||
			stateModule ||
			txGame ||
			this.observer_game_module_slug ||
			'arcade';
		let image = game_mod?.respondTo?.('arcade-games')?.image || '';
		let gameName = (game_mod && (game_mod.returnName?.() || game_mod.name)) || txGame || slug;
		return { game, state, game_mod, slug, image, gameName };
	}

	_getLoungeRoot() {
		if (!this.overlay?.visible) return null;
		const el = document.getElementById(`saito-overlay${this.overlay.ordinal}`);
		if (!el || el.style.display === 'none') return null;
		return el.querySelector('.arcade-lounge');
	}

	/**
	 * Transition an open initializing lounge to the ready state without re-showing the overlay.
	 */
	showGameReadyState() {
		if (this.game_id == null || this.invite != null) return false;
		const root = this._getLoungeRoot();
		if (!root) return false;

		const { game, state, game_mod, gameName } = this._resolveGameIdContext();
		const stateLabel = 'Game Ready';
		const bodyHtml = this._buildReadyBody(game, state, game_mod);
		const controlsHtml = `
	  <div id="arcade-game-controls-start-game" class="fat saito-button-primary">Start Game</div>
	  <div id="arcade-game-controls-close-game" class="fat saito-button-secondary">Cancel</div>`;

		const descEl = root.querySelector('.arcade-lounge-header-desc');
		const bodyEl = root.querySelector('.arcade-lounge-body');
		const controlsEl = root.querySelector('.arcade-lounge-controls');
		const titleEl = root.querySelector('.arcade-lounge-header-title');
		if (!descEl || !bodyEl || !controlsEl) return false;

		if (titleEl) titleEl.textContent = gameName;
		descEl.textContent = stateLabel;
		bodyEl.innerHTML = bodyHtml;
		controlsEl.innerHTML = controlsHtml;
		this.attachEvents();
		this.app.connection.emit('add-league-identifier-to-dom');
		return true;
	}

	_renderGameIdMode() {
		const { game, state, game_mod, image, gameName } = this._resolveGameIdContext();

    let derivedState;
    if (state && state.initializing === 1) {
      derivedState = 'INITIALIZING';
    } else if (state && state.initializing === 0 && !state.over) {
      derivedState = 'READY';
    } else if (state && state.over === 1) {
      derivedState = 'COMPLETED';
    } else {
      derivedState = 'INITIALIZING';
    }

    let stateLabel, bodyHtml, controlsHtml;
    const headerImageStyle = image ? ` style="background-image: url('${image}')"` : '';

    //
    // No local metadata for this game_id – show observer overlay.
    // If archive has game data: enable Watch Game. Otherwise: show message and disable button.
    //
    if (!game) {
      stateLabel = 'Observer Mode';
      const hasArchive = this.observer_has_archive_data === true;
      const message = hasArchive
        ? 'You can watch this game.'
        : 'This server does not yet have game data for this match.';
      bodyHtml = `
	  <div class="arcade-lounge-section arcade-lounge-section-game-id-message">
		  <div class="arcade-lounge-message arcade-lounge-message-game-id">${message}</div>
	  </div>`;
      controlsHtml = hasArchive
        ? `<button id="arcade-game-controls-watch-game" class="fat saito-button-primary">Watch Game</button>`
        : `<button id="arcade-game-controls-watch-game" class="fat saito-button-primary" disabled>Watch Game</button>`;
    } else if (derivedState === 'INITIALIZING') {
      stateLabel = 'Initializing Game';
      bodyHtml = `
	  <div class="arcade-lounge-section">
		  <div id="game-loader-spinner" class="arcade-lounge-loader game-loader-spinner"></div>
		  <div class="arcade-lounge-message">Setting up your game...</div>
	  </div>`;
      controlsHtml = '';
    } else if (derivedState === 'READY') {
      stateLabel = 'Game Ready';
      bodyHtml = this._buildReadyBody(game, state, game_mod);
      controlsHtml = `
	  <div id="arcade-game-controls-start-game" class="fat saito-button-primary">Start Game</div>
	  <div id="arcade-game-controls-close-game" class="fat saito-button-secondary">Cancel</div>`;
    } else {
      stateLabel = 'Game completed';
      bodyHtml = '';
      controlsHtml = `
	  <div id="arcade-game-controls-continue-game" class="fat saito-button-primary">View game</div>`;
    }

    // Unified layout: same header (thumbnail + title + subtitle), body, chat, controls for all states
    let html = `
  <div class="arcade-lounge">
  <div class="arcade-lounge-header">
	  <div class="arcade-lounge-header-image"${headerImageStyle}></div>
	  <div class="arcade-lounge-header-title">${gameName}</div>
	  <div class="arcade-lounge-header-desc">${stateLabel}</div>
  </div>
  <div class="arcade-lounge-body">
	  ${bodyHtml}
  </div>
  <div class="arcade-lounge-chat"></div>
  <div class="arcade-lounge-controls">${controlsHtml}
  </div>
</div>`;

    this.overlay.show(html);
    this.overlay.setBackground(image);
    this.attachEvents();
    this.app.connection.emit('add-league-identifier-to-dom');
  }

  _buildReadyBody(record, state, game_mod) {
    const players = state?.players || record?.tx?.msg?.players || [];
    const options = state?.options || record?.tx?.msg?.options || {};
    let optsHtml = '';
    if (game_mod && typeof game_mod.returnShortGameOptionsArray === 'function') {
      const sgoa = game_mod.returnShortGameOptionsArray(options);
      for (let key in sgoa) {
        if (sgoa[key] != null) {
          optsHtml += `<div class="saito-table-row"><div class="arcade-lounge-key">${String(key).replace(/_/g, ' ')}</div><div class="arcade-lounge-value">${sgoa[key]}</div></div>`;
        }
      }
    }
    let playersHtml = '';
    for (let i = 0; i < players.length; i++) {
      const pkey = players[i];
      playersHtml += `
		  <div class="arcade-lounge-playerbox saito-table-row" id="invite-user-${pkey}">
		    <div class="saito-identicon-box"><img class="saito-identicon" src="${this.app.keychain.returnIdenticon(pkey)}"></div>
		    ${this.app.browser.returnAddressHTML(pkey)}
		    <div class="online-status-indicator"></div>
		  </div>`;
    }
    return `
	  <div class="arcade-lounge-section hide-scrollbar">
	    <div class="arcade-lounge-players">${playersHtml}
	    </div>
	    <div class="saito-table"><div class="saito-table-body">${optsHtml}</div></div>
	  </div>`;
  }

  //
  // If the invite carries a crypto stake, route through the stake-consent
  // overlay and run accept_callback (with the confirmed stake input) on
  // approval; otherwise run it directly.
  //
  confirmStakeThen(game_mod, accept_callback) {
    const opts = this.invite.options;
    if (opts.crypto && (parseFloat(opts.stake) > 0 || parseFloat(opts.stake?.min) >= 0)) {
      this.app.connection.emit('accept-game-stake', {
        game_mod,
        ticker: opts.crypto,
        stake: opts.stake,
        accept_callback
      });
    } else {
      accept_callback();
    }
  }

  attachEvents() {
    let startBtn = document.getElementById('arcade-game-controls-start-game');
    if (startBtn && this.game_id != null) {
      startBtn.onclick = (e) => {
        let game = this.mod.returnGame(this.game_id);
        const gameName = game?.tx?.msg?.game || game?.state?.module;
        const mod = gameName ? this.app.modules.returnModule(gameName) : null;
        let slug = mod?.returnSlug?.() || mod?.slug || gameName || 'arcade';
        let am = this.app.modules.returnActiveModule()?.returnName() || 'Arcade';
        this.app.options.homeModule = am;
        this.app.storage.saveOptions();
        navigateWindow(`/${slug}`, 200);
      };
    }

    if (document.getElementById('arcade-game-controls-join-game')) {
      //This is a joinable game
      this.app.connection.emit('relay-send-message', {
        recipient: [this.invite.originator],
        request: 'ping',
        data: {}
      });

      document.getElementById('arcade-game-controls-join-game').onclick = async (e) => {
        let open_invites = this.mod.returnOpenInvites();

        if (open_invites.length > 0) {
          let c = await sconfirm(
            'You have an open invite. Would you like to close it to join this game?'
          );
          if (c) {
            for (let game_id of open_invites) {
              this.mod.sendCancelTransaction(game_id);
            }
          }
        }

        this.overlay.remove();

        if (
          this.invite.options.crypto &&
          (parseFloat(this.invite.options.stake) > 0 ||
            parseFloat(this.invite.options.stake?.min) >= 0)
        ) {
          try {
            let game_mod = this.app.modules.returnModuleBySlug(this.invite.game_slug);

            this.app.connection.emit('accept-game-stake', {
              game_mod,
              ticker: this.invite.options.crypto,
              stake: this.invite.options.stake,
              accept_callback: (input = null) => {
                let update_options =
                  input !== null && typeof this.invite.options.stake == 'object' ? 'stake' : '';
                if (update_options) {
                  this.invite.options.stake[this.mod.publicKey] = input;
                }
                this.mod.sendJoinTransaction(this.invite, update_options);
              }
            });
          } catch (err) {
            console.error('ARCADE [joinGame] ERROR checking crypto: ', err);
            return false;
          }
        } else {
          this.mod.sendJoinTransaction(this.invite);
        }
      };
    }

    if (document.getElementById('arcade-game-controls-continue-game')) {
      document.getElementById('arcade-game-controls-continue-game').onclick = (e) => {
        let slug, gameId, name;
        if (this.invite) {
          slug = this.invite.game_slug;
          gameId = this.invite.game_id;
          name = this.invite.game_mod?.name;
        } else if (this.game_id != null) {
          let game = this.mod.returnGame(this.game_id);
          const gameName = game?.tx?.msg?.game || game?.state?.module;
          const mod = gameName ? this.app.modules.returnModule(gameName) : null;
          slug = mod?.returnSlug?.() || mod?.slug || gameName || 'arcade';
          gameId = this.game_id;
          name = mod?.returnName?.() || mod?.name;
        }
        if (slug != null && gameId != null) {
          navigateWindow(`/${slug}/#gid=${encodeURIComponent(gameId)}`);
        }
      };
    }

    if (document.getElementById('arcade-game-controls-close-game')) {
      document.getElementById('arcade-game-controls-close-game').onclick = async (e) => {
        if (this.invite) {
          this.overlay.remove();
          let c = await sconfirm('Are you sure you want to end the game?');
          if (c) {
            this.app.connection.emit(
              'arcade-stop-game',
              this.invite.game_mod?.name,
              this.invite.game_id,
              'cancellation'
            );
          }
        } else if (this.game_id != null) {
          this.overlay.remove();
        }
      };
    }

    //
    // This is a little complicated because an initialized game will persist in the
    // app.options and keep getting added back to the arcade list because it didn't
    // reach a gameover. So, we send a game over request through the game, but if the opponent
    // isn't online it doesn't process, so we need an additional fallback just to make
    // sure we aren't annoyed by being unable to close a game.
    // Of course, forfeiting a game might hurt one's leaderboard standings, but the leaderboard
    // and game engine have checks to prevent that in most cases where a game breaks early on
    //
    if (document.getElementById('arcade-game-controls-forfeit-game')) {
      document.getElementById('arcade-game-controls-forfeit-game').onclick = async (e) => {
        this.overlay.remove();

        let c = await sconfirm('Are you sure you want to end the game and take a loss?');

        if (c) {
          this.app.connection.emit(
            'arcade-stop-game',
            this.invite.game_mod?.name,
            this.invite.game_id,
            'forfeit'
          );
        }
      };
    }

    if (document.getElementById('arcade-game-controls-cancel-join')) {
      document.getElementById('arcade-game-controls-cancel-join').onclick = (e) => {
        this.mod.sendCancelTransaction(this.invite.game_id);
        this.overlay.remove();
      };
    }

    if (document.getElementById('arcade-game-controls-invite-join')) {
      document.getElementById('arcade-game-controls-invite-join').onclick = (e) => {
        this.mod.showShareLink(this.invite.game_id);
      };
    }

    //
    // join an in-progress open table: request a seat via the game module's
    // FOLLOW/SHARE/JOIN flow (no observer involved)
    //
    if (document.getElementById('arcade-game-controls-join-table')) {
      document.getElementById('arcade-game-controls-join-table').onclick = async (e) => {
        let game_mod = this.app.modules.returnModuleBySlug(this.invite.game_slug);
        let game_tx = this.mod.returnGameTransaction(this.invite.game_id);

        if (!game_mod?.opengame || !game_tx || typeof game_mod.requestSeatAtTable !== 'function') {
          console.warn('ARCADE: cannot join table -- module or game tx unavailable');
          return;
        }

        this.overlay.remove();

        const requestSeat = async () => {
          let r = await game_mod.requestSeatAtTable(game_tx);
          if (r === 'already-playing') {
            navigateWindow(`/${this.invite.game_slug}`, 200);
            return;
          }
          //
          // show the initializing-game lounge (spinner); it transitions to
          // "Game Ready / Start Game" when all players have signed us in
          //
          this.mod.render('lounge_overlay', { game_id: this.invite.game_id });
        };

        this.confirmStakeThen(game_mod, requestSeat);
      };
    }

    if (document.getElementById('arcade-game-controls-watch-game')) {
      document.getElementById('arcade-game-controls-watch-game').onclick = (e) => {
        const gid = this.invite?.game_id ?? this.game_id;
        if (!gid) return;
        this.app.connection.emit('league-overlay-remove-request');
        this.mod.observeGame(gid, true, this.observer_game_module_slug || undefined);
        this.overlay.remove();
      };
    }

    if (document.getElementById('arcade-game-controls-review-game')) {
      document.getElementById('arcade-game-controls-review-game').onclick = (e) => {
        this.app.connection.emit('league-overlay-remove-request');
        this.mod.observeGame(this.invite.game_id);
        this.overlay.remove();
      };
    }

    if (document.getElementById('arcade-game-controls-clear-game')) {
      document.getElementById('arcade-game-controls-clear-game').onclick = (e) => {
        this.mod.removeGameFromWallet(this.invite.game_id);
        this.overlay.remove();
      };
    }

    /*Array.from(document.querySelectorAll('.available_slot')).forEach((emptySlot) => {
			emptySlot.onclick = () => {
				this.mod.showShareLink(this.invite.game_id, false);
				this.overlay.remove();
			};
		});*/

    if (document.getElementById('clear-invite')) {
      document.getElementById('clear-invite').onclick = (e) => {
        this.app.network.sendRequestAsTransaction(
          'arcade clear invite',
          { game_id: this.invite.game_id },
          () => {
            window.location.reload();
          }
        );
      };
    }
  }
}

module.exports = LoungeOverlay;
