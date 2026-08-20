const Transaction = require('../../../lib/saito/transaction').default;
const JSON = require('json-bigint');
const Invite = require('./ui/invite');
const SaitoOverlay = require('../../../lib/saito/ui/saito-overlay/saito-overlay');
const GameInvitationLink = require('../../../lib/saito/ui/modals/saito-link/saito-link');

module.exports = {
  async createPseudoTransaction(game) {
    let game_tx = await this.app.wallet.createUnsignedTransaction(
      this.publicKey,
      BigInt(0),
      BigInt(0)
    );

    if (game.accepted) {
      game.accepted.forEach((player) => {
        game_tx.addTo(player);
        game_tx.addFrom(player);
      });
    } else {
      game_tx.addFrom(this.publicKey);
      game_tx.addTo(this.publicKey);
    }

    let msg = {
      //ts
      module: 'Arcade',
      request: 'loaded', //will be overwritten as "active" when added
      game: game.module,
      options: game.options,
      players_needed: game.players_needed,
      players: game.accepted,
      players_sigs: [], //Only used to verify cryptology when initializing the game
      originator: game.originator,
      //winner: game.winner,
      step: game?.step?.game,
      timestamp: game?.timestamp
    };

    game_tx.signature = game.id;
    game_tx.msg = msg;

    return game_tx;
  },


  async onPeerHandshakeComplete(app, peer) {
    if (!app.BROWSER) {
      let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
      newtx.msg = {
        module: 'Arcade',
        request: 'arcade update peer status',
        data: {
          publickey: peer.publicKey,
          status: 'online'
        }
      };
      await newtx.sign();
      this.notifyPeers(newtx);

      for (let id in this.invites) {
        let record = this.invites[id];
        if (record.tx.from[0].publicKey == peer.publicKey) {
          record.is_sender_reachable = true;
        }
      }

      return;
    }
  },

  async onPeerServiceUp(app, peer, service = {}) {
    let arcade_self = this;

    if (service.service == 'arcade') {
      this.app.network.sendRequestAsTransaction('arcade invite list', {}, async (txs) => {
        if (txs?.length > 0) {
          for (let serial_tx of txs) {
            let game_tx = new Transaction();
            game_tx.deserialize_from_web(app, serial_tx);
            let status = game_tx?.msg?.request;

            if (arcade_self.isMyGame(game_tx)) {
              let exists_locally = arcade_self.app.options?.games?.find(
                (g) => g.id === game_tx.signature
              );
              if (!exists_locally) {
                //
                // Same window as purge() INVITE_CUTOFF — keep my open invites
                // visible for as long as others see them.
                //
                let msg = game_tx.returnMessage();
                if (Date.now() - msg.timestamp > 2000000) {
                  continue;
                }
              }
            }

            let game_added = arcade_self.addInviteRecord(game_tx);

            //Game is marked as "active" but we didn't already add it from our app.options file...
            if (status == 'active' && game_added && arcade_self.isMyGame(game_tx)) {
              game_tx.msg.game_id = game_tx.signature;
              arcade_self.receiveAcceptTransaction(game_tx);
            }
          }
        }

        //
        // For processing direct link to game invite
        //
        if (arcade_self.app.browser.returnURLParameter('game_id')) {
          let game_id = arcade_self.app.browser.returnURLParameter('game_id');
          try {
            game_id = decodeURIComponent(game_id);
          } catch (_) {}
          const game_module_slug = arcade_self.app.browser.returnURLParameter('game');
          const { game_tx, from_archive } = await arcade_self.returnGameInvite(
            game_id,
            game_module_slug
          );
          if (
            game_tx &&
            !from_archive &&
            game_tx.msg.request !== 'cancel' &&
            game_tx.msg.request !== 'closed'
          ) {
            arcade_self.addInviteRecord(game_tx);
            if (arcade_self.isAvailableGame(game_tx)) {
              game_tx.msg.options.desired_opponent_publickey = arcade_self.publicKey;
              arcade_self.removeInviteRecord(game_tx.signature);
              arcade_self.addInviteRecord(game_tx);
            }
            const invite = new Invite(
              arcade_self.app,
              arcade_self,
              null,
              null,
              game_tx,
              arcade_self.publicKey
            );
            arcade_self.render('lounge_overlay', { invite_data: invite.invite_data });
          } else {
            arcade_self.render('lounge_overlay', {
              game_id,
              observer_has_archive_data: !!game_tx,
              game_module_slug: game_module_slug || null
            });
          }
          window.history.replaceState('', '', `/arcade/`);
        }
        this.renderInvites();
        app.connection.emit('arcade-data-loaded');
      });
    }

    //
    // I am going to comment this out for a bit, because I don't know if we still need it
    // It was "broken" and so not working for... a while
    // The idea is to query the last 10 moves of all your saved games in case you didn't get them
    // on/off chain and then rerun them
    // I think it might be essential for asynchronous gaming since we don't know that we will
    // get lite blocks going back too far
    //
    if (service.service === 'archive') {
      /*for (let game of this.app.options.games) {
        if (game?.over) {
          continue;
        }

        let game_mod = this.app.modules.returnModule(game.module);

        if (!game_mod) {
          continue;
        }

        this.app.storage.loadTransactions(
          {
            field1: game.module,
            field4: game.id
          },
          async (txs) => {
            if (txs?.length > 0) {
              for (let i = txs.length - 1; i >= 0; i--) {
                // arcade
                await this.onConfirmation(-1, txs[i], 0);

                // game mod
                await game_mod.onConfirmation(-1, txs[i], 0);
              }
            }
          },
          peer
        );
      }*/
    }
  },

  async returnGameInvite(game_id, game_module) {
    try {
      game_id = decodeURIComponent(game_id);
    } catch (_) {}

    let game_tx = this.invites[game_id]?.tx ?? null;
    let from_archive = false;

    if (!game_tx && this.app.options?.games?.length) {
      const opt = this.app.options.games.find((g) => g.id === game_id);
      if (opt) {
        game_tx = await this.createPseudoTransaction(opt);
      }
    }

    if (!game_tx && game_module) {
      game_tx = await new Promise((resolve) => {
        this.app.storage.loadTransactions(
          {
            field1: game_module,
            field4: game_id,
            order_by: 'field5',
            order: 'ASC',
            limit: 1
          },
          (txs) => {
            const tx = txs && txs.length ? txs[0] : null;
            resolve(tx || null);
          }
        );
      });
      if (game_tx) {
        from_archive = true;
      }
    }

    return { game_tx, from_archive };
  },

  async onConfirmation(blk, tx, conf) {
    let txmsg = tx.returnMessage();
    let arcade_self = this.app.modules.returnModule('Arcade');

    if (Number(conf) == 0) {
      try {
        if (txmsg.module === 'Arcade') {
          if (this.hasSeenTransaction(tx, blk)) {
            return;
          }

          //
          // public & private invites processed the same way
          //
          if (txmsg.request === 'open' || txmsg.request === 'private') {
            await arcade_self.receiveOpenTransaction(tx, blk);
          }

          //
          // Add a player to the game invite
          //
          if (txmsg.request == 'join') {
            await arcade_self.receiveJoinTransaction(tx);
          }

          // Remove player from ongoing game
          if (txmsg.request == 'leave') {
            await arcade_self.receiveLeaveTransaction(tx);
          }

          //
          // cancel a join transaction / Remove a player from the game invite
          //
          if (txmsg.request == 'cancel') {
            await arcade_self.receiveCancelTransaction(tx);
          }

          //
          // kick off game initialization
          //
          if (txmsg.request === 'accept') {
            await arcade_self.receiveAcceptTransaction(tx);
          }
        } else {
          // console.log("ARCADE PROCESSING GAME MOVE: ");
          // console.log(tx.returnMessage());
          if (txmsg.request === 'stopgame') {
            await arcade_self.receiveCloseTransaction(tx);
          }

          if (txmsg.request === 'gameover') {
            await arcade_self.receiveGameOverTransaction(tx);
          }

          if (txmsg.request === 'game') {
            await arcade_self.receiveGameStepTransaction(tx);
          }

          if (txmsg.request === 'JOIN' || txmsg.request === 'LEAVE' || txmsg.request === 'CANCEL') {
            arcade_self.receiveGametableMeta(tx);
          }

          //
          // Archive game overs for async / observer mode to work
          //
          if (!this.app.BROWSER) {
            let step = txmsg?.step?.game || txmsg.step || null;
            if (step) {
              step = String(step).padStart(5, '0');
            }
            await this.app.storage.saveTransaction(
              tx,
              { field4: txmsg.game_id, field5: step, field5_sort: 1 },
              'localhost'
            );
          }
        }

        //
        // only servers notify lite-clients
        // Added this so cross-network onChain messages can duplicate quickly
        //
        if (this.app.BROWSER == 0 && this.app.SPVMODE == 0) {
          this.notifyPeers(tx);
        }
      } catch (err) {
        // console.error('ERROR in arcade onconfirmation block: ', err);
      }
    }
  },

  /////////////////////////////
  // HANDLE PEER TRANSACTION //
  /////////////////////////////
  //
  // handles off-chain transactions, packaged as data by Relay module

  async handlePeerTransaction(app, newtx = null, peer, mycallback = null) {
    if (newtx == null) {
      return 0;
    }
    let message = newtx.returnMessage();
    let requester = peer.publicKey;

    if (message.request === 'arcade invite list') {
      this.purge();

      let txs = [];
      let peers = await app.network.getPeers();

      for (let id in this.invites) {
        let record = this.invites[id];
        if (record.is_sender_reachable !== true && requester != record.tx.from[0].publicKey) {
          continue;
        }
        if (record.status === 'closed' || record.status === 'over') {
          continue;
        }
        let g = record.tx;
        txs.push(g.serialize_to_web(this.app));
      }

      if (mycallback) {
        mycallback(txs);
        return 1;
      }
    }

    if (message.request === 'arcade clear invite') {
      this.removeInviteRecord(message.data.game_id);
      return 1;
    }

    //
    // this code doubles onConfirmation
    //
    if (message?.data && message?.request === 'arcade spv update') {
      let tx = new Transaction(undefined, message.data);

      this.hasSeenTransaction(tx);

      let txmsg = tx.returnMessage();

      if (txmsg.module === 'Arcade') {
        //
        // public & private invites processed the same way
        //
        if (txmsg.request === 'open' || txmsg.request === 'private') {
          await this.receiveOpenTransaction(tx);
        }

        //
        // Add a player to the game invite
        //
        if (txmsg.request == 'join') {
          await this.receiveJoinTransaction(tx);
        }

        //
        // Remove player from ongoing game
        //
        if (txmsg.request == 'leave') {
          await this.receiveLeaveTransaction(tx);
        }

        //
        // cancel a join transaction / Remove a player from the game invite
        //
        if (txmsg.request == 'cancel') {
          await this.receiveCancelTransaction(tx);
        }

        //
        // kick off game initialization
        //
        if (txmsg.request === 'accept') {
          await this.receiveAcceptTransaction(tx);
        }


        if (txmsg.request === 'arcade update peer status') {
          await this.receivePeerStatusUpdateTransaction(tx);
        }
      } else {
        if (txmsg.request === 'stopgame') {
          await this.receiveCloseTransaction(tx);
        }
        if (txmsg.request === 'gameover') {
          await this.receiveGameOverTransaction(tx);
        }
        if (this.app.BROWSER) {
          if (txmsg.request === 'game') {
            await this.receiveGameStepTransaction(tx);
          }
        }
        if (txmsg.request === 'JOIN' || txmsg.request === 'LEAVE' || txmsg.request === 'CANCEL') {
          this.receiveGametableMeta(tx);
        }
      }

      //
      // only servers notify lite-clients
      //
      if (app.BROWSER == 0 && app.SPVMODE == 0) {
        this.notifyPeers(tx);
      }

      return 1;
    }

    return super.handlePeerTransaction(app, newtx, peer, mycallback);
  },

  async onConnectionUnstable(app, publicKey) {
    if (this.app.BROWSER == 1) {
      return;
    }

    let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
    newtx.msg = {
      module: 'Arcade',
      request: 'arcade update peer status',
      data: {
        publickey: publicKey,
        status: 'offline'
      }
    };
    await newtx.sign();
    this.notifyPeers(newtx);

    for (let id in this.invites) {
      let record = this.invites[id];
      if (record.tx.from[0].publicKey === publicKey) {
        record.is_sender_reachable = false;
      }
    }
  },

  //
  // send TX to our SPV peers

  async notifyPeers(tx) {
    if (this.app.BROWSER == 1) {
      return;
    }
    let peers = await this.app.network.getPeers();

    for (let peer of peers) {
      if (peer.synctype == 'lite' && peer?.status !== 'disconnected') {
        //
        // fwd tx to peer
        //
        let message = {};
        message.request = 'arcade spv update';
        message.data = tx.toJson();

        this.app.network.sendRequestAsTransaction(
          message.request,
          message.data,
          null,
          peer.publicKey
        );
      }
    }
  },

  async createOpenTransaction(gamedata) {
    let sendto = this.publicKey;
    let moduletype = 'Arcade';

    let { ts, name, options, players_needed, invitation_type } = gamedata;

    console.log('GAMEDATA: ' + JSON.stringify(gamedata));

    let accept_sig = await this.app.crypto.signMessage(
      `invite_game_${ts}`,
      await this.app.wallet.getPrivateKey()
    );

    let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
    newtx.addTo(this.publicKey);
    if (options?.desired_opponent_publickey) {
      newtx.addTo(options.desired_opponent_publickey);
    }

    newtx.msg = {
      timestamp: ts,
      module: moduletype,
      request: invitation_type,
      game: name,
      options: options,
      players_needed: parseInt(players_needed),
      players: [this.publicKey],
      players_sigs: [accept_sig],
      originator: this.publicKey
    };

    await newtx.sign();

    return newtx;
  },

  async receiveOpenTransaction(tx, blk = null) {
    let txmsg = tx.returnMessage();

    // add to games list == open or private
    this.addInviteRecord(tx);
    this.renderInvites();

    if (tx.isFrom(this.publicKey)) {
      clearTimeout(this.game_timeout);
      if (this.app.browser.isMobileBrowser(navigator.userAgent) && !this.browser_active) {
        siteMessage('Game invite created', 1000);
      } else {
        if (txmsg.request == 'private') {
          this.showShareLink(tx.signature);
        }
      }
      return;
    }

    if (txmsg?.options?.desired_opponent_publickey == this.publicKey) {
      siteMessage(`You were invited to play ${txmsg.game}`, 5000);
    }
  },

  async createCancelTransaction(orig_tx) {
    let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();

    for (let player of orig_tx.msg.players) {
      newtx.addTo(player);
    }
    newtx.addTo(this.publicKey);

    let msg = {
      request: 'cancel',
      module: 'Arcade',
      game_id: orig_tx.signature
    };
    newtx.msg = msg;
    await newtx.sign();

    return newtx;
  },

  async receiveCancelTransaction(tx) {
    let txmsg = tx.returnMessage();
    let game = this.returnGame(txmsg.game_id);

    if (!game || !game.tx?.msg) {
      return;
    }

    if (game.tx.msg.players.includes(tx.from[0].publicKey)) {
      if (tx.from[0].publicKey == game.tx.msg.originator) {
        this.changeGameStatus(txmsg.game_id, 'closed');
      } else {
        let p_index = game.tx.msg.players.indexOf(tx.from[0].publicKey);
        game.tx.msg.players.splice(p_index, 1);
        //Make sure player_sigs array exists and add invite_sig
        if (game.tx.msg.players_sigs && game.tx.msg.players_sigs.length > p_index) {
          game.tx.msg.players_sigs.splice(p_index, 1);
        }
      }
    } else if (
      game.tx.msg.options?.desired_opponent_publickey &&
      tx.isFrom(game.tx.msg.options.desired_opponent_publickey)
    ) {
      if (this.publicKey == game.tx.msg.originator) {
        siteMessage('Your game invite was declined', 5000);
      }
      this.changeGameStatus(txmsg.game_id, 'closed');
    }

    this.app.connection.emit('arcade-close-game', txmsg.game_id);
    this.renderInvites();
  },

  async sendCancelTransaction(game_id) {
    let game = this.returnGame(game_id);

    if (!game || !game.tx?.msg) {
      return;
    }

    let close_tx = await this.createCancelTransaction(game.tx);
    this.app.network.propagateTransaction(close_tx);

    this.app.connection.emit('relay-send-message', {
      recipient: game.tx.msg.players,
      request: 'arcade spv update',
      data: close_tx.toJson()
    });

    this.app.connection.emit('relay-send-message', {
      recipient: 'PEERS',
      request: 'arcade spv update',
      data: close_tx.toJson()
    });
  },

  changeGameStatus(game_id, newStatus) {
    let game = this.returnGame(game_id);

    //Move game to different list
    if (game) {
      if (this.sudo) {
        console.debug(
          `ARCADE: Change game (${game_id.substring(0, 10)}...) status from ${game.tx.msg.request} to ${newStatus}`
        );
      }

      if (!this?.sudo) {
        if (game.tx?.msg?.request == 'over' || game.tx?.msg?.request == 'closed') {
          return;
        }
      }

      this.removeInviteRecord(game_id);
      this.addInviteRecord(game.tx, newStatus);
    }

    this.renderInvites();
  },

  async receiveGameOverTransaction(tx) {
    let txmsg = tx.returnMessage();

    let game = this.returnGame(txmsg.game_id);

    //In case we arrive at gameover without close game
    this.app.connection.emit('arcade-close-game', txmsg.game_id);
    this.changeGameStatus(txmsg.game_id, 'over');

    let winner = txmsg.winner || null;

    if (game?.tx?.msg) {
      //Store the results locally
      game.tx.msg.winner = winner;
      game.tx.msg.method = txmsg.reason;
      game.tx.msg.time_finished = txmsg.timestamp;
    } else {
      console.warn("Game not found, arcade can't process gameover tx");
    }
  },

  async receiveCloseTransaction(tx) {
    let txmsg = tx.returnMessage();

    // Mark game as closed, unless it is a player leaving an open table...
    if (txmsg.reason !== 'withdraw') {
      this.app.connection.emit('arcade-close-game', txmsg.game_id);
      this.changeGameStatus(txmsg.game_id, 'closed');
    }
  },

  async receiveGameStepTransaction(tx) {
    let txmsg = tx.returnMessage();
    let game = this.returnGame(txmsg.game_id);
    if (game?.tx?.msg) {
      game.tx.msg.step = txmsg.step.game;
      game.tx.msg.timestamp = txmsg.step.timestamp;
    }
  },

  ///////////////
  // JOIN GAME //
  ///////////////
  //
  // join is the act of adding yourself to a game that does not have enough
  // players. technically, you're providing a signature that -- when returned
  // as part of a valid game, will trigger your browser to start initializing
  // the game.

  async createJoinTransaction(orig_tx, option_update = null) {
    if (!orig_tx || !orig_tx.signature) {
      console.error('ARCADE: Invalid Game Invite TX, cannot Join');
      return;
    }

    let txmsg = orig_tx.returnMessage();

    let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
    for (let player of txmsg.players) {
      newtx.addTo(player);
    }
    newtx.addTo(this.publicKey);

    newtx.msg = JSON.parse(JSON.stringify(txmsg));
    newtx.msg.module = 'Arcade';
    newtx.msg.request = 'join';
    newtx.msg.game_id = orig_tx.signature;
    if (option_update) {
      newtx.msg.options = orig_tx.msg.options[option_update];
      newtx.msg.update_options = option_update;
    }

    newtx.msg.invite_sig = await this.app.crypto.signMessage(
      'invite_game_' + orig_tx.msg.timestamp,
      await this.app.wallet.getPrivateKey()
    );

    await newtx.sign();

    return newtx;
  },

  async sendJoinTransaction(invite, update_options = '') {
    //
    // Create Transaction
    //
    let newtx = await this.createJoinTransaction(invite.tx, update_options);

    //
    // send it on-chain and off-chain
    //
    this.app.network.propagateTransaction(newtx);

    this.app.connection.emit('relay-send-message', {
      recipient: 'PEERS',
      request: 'arcade spv update',
      data: newtx.toJson()
    });

    this.renderInvites();
  },

  async receiveJoinTransaction(tx) {
    if (!tx || !tx.signature) {
      return;
    }

    let txmsg = tx.returnMessage();

    //Transaction must be signed
    if (!txmsg.invite_sig) {
      return;
    }

    //
    // game is the record (tx + state); game.tx is the original invite creation TX.
    //
    let game = this.returnGame(txmsg.game_id);

    //
    // If we don't find it, or we have already marked the game as active, stop processing
    //
    if (!game) {
      return;
    }

    if (game.state) {
      return;
    }

    //
    // Don't add the same player twice!
    //
    if (!game.tx.msg.players.includes(tx.from[0].publicKey)) {
      if (this.isAvailableGame(game.tx)) {
        if (txmsg.update_options) {
          console.info(
            `ARCADE: Join TX updates the invite options -- ${txmsg.update_options}!`,
            game.tx.msg.options,
            txmsg.options
          );
          Object.assign(game.tx.msg.options[txmsg.update_options], txmsg.options);
        }

        //
        // add player to game
        //
        game.tx.msg.players.push(tx.from[0].publicKey);
        game.tx.msg.players_sigs.push(txmsg.invite_sig);

        // Move player from tentatitive to full on...
        this.clearTentative(txmsg.game_id, tx.from[0].publicKey);
        this.removeInviteRecord(txmsg.game_id);
        this.addInviteRecord(game.tx);
        this.renderInvites();
      } else {
        if (tx.isFrom(this.publicKey)) {
          salert('Game not available right now...');
          return;
        }
      }
    }

    // If this is an already initialized table game... stop
    if (game.tx.msg.request == 'active' || game.tx.msg.request == 'over') {
      return;
    }

    if (game.state) {
      return;
    }

    //
    // Do we have enough players?
    //
    if (
      game.tx.msg.players.length >= game.tx.msg.players_needed &&
      game.tx.msg.request !== 'accepted' &&
      game.tx.msg.request !== 'active'
    ) {
      //
      // Temporarily change it so we don't process additional joins
      //
      game.tx.msg.request = 'accepted';

      //
      // First player (originator) sends the accept message
      //
      if (
        game.tx.msg.originator == this.publicKey ||
        (tx.isFrom(this.publicKey) && game.tx.msg.options?.async_dealing)
      ) {
        let newtx = await this.createAcceptTransaction(game.tx);
        if (!newtx) {
          console.warn(
            'ARCADE: createAcceptTransaction returned nothing; skipping propagate and lounge overlay'
          );
          return;
        }
        this.app.network.propagateTransaction(newtx);
        this.app.connection.emit('relay-send-message', {
          recipient: 'PEERS',
          request: 'arcade spv update',
          data: newtx.toJson()
        });

        //Start Spinner now instead of waiting for accept transaction to arrive
        this.render('lounge_overlay', { game_id: txmsg.game_id });
      }
    }
  },

  async sendLeaveTransaction(invite_tx, data) {
    let txmsg = invite_tx.returnMessage();

    let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
    for (let player of txmsg.players) {
      newtx.addTo(player);
    }

    newtx.addTo(this.publicKey);

    newtx.msg = JSON.parse(JSON.stringify(txmsg));
    newtx.msg.module = 'Arcade';
    newtx.msg.request = 'leave';
    newtx.msg.game_id = invite_tx.signature;
    newtx.msg.data = data;

    await newtx.sign();

    this.app.network.propagateTransaction(newtx);

    this.app.connection.emit('relay-send-message', {
      recipient: 'PEERS',
      request: 'arcade spv update',
      data: newtx.toJson()
    });

    this.renderInvites();
  },

  async receiveLeaveTransaction(tx) {
    if (!tx || !tx.signature) {
      return;
    }

    let txmsg = tx.returnMessage();

    //
    // game is the record (tx + status + state) for the invite.
    //
    let game = this.returnGame(txmsg.game_id);

    //
    // If we don't find it, or we have already marked the game as active, stop processing
    //
    if (!game) {
      return;
    }

    //
    // Don't remove the same player twice!
    //
    if (game.tx.msg.players.includes(tx.from[0].publicKey)) {
      let index = game.tx.msg.players.indexOf(tx.from[0].publicKey);
      game.tx.msg.players.splice(index, 1);
      game.tx.msg.players_sigs.splice(index, 1);

      if (!game.tx.msg.options?.eliminated) {
        game.tx.msg.options.eliminated = {};
      }

      game.tx.msg.options.eliminated[tx.from[0].publicKey] = txmsg.data;

      this.clearTentative(txmsg.game_id, tx.from[0].publicKey);
      this.removeInviteRecord(txmsg.game_id);
      this.addInviteRecord(game.tx);
      this.renderInvites();
    }
  },

  /////////////////
  // ACCEPT GAME //
  /////////////////
  //
  // this transaction should be a valid game that has signatures from everyone
  // and is capable of initializing a game. if this TX is valid and has our
  // signature we will auto-accept it, kicking off the game.

  async createAcceptTransaction(orig_tx) {
    if (!orig_tx || !orig_tx.signature) {
      console.error('ARCADE: Invalid Game Invite TX, cannot Accept');
      return;
    }

    // Use returnMessage() so we get the full message even if tx was deserialized (lazy .msg)
    let txmsg = orig_tx.returnMessage();
    if (!txmsg || !txmsg.players || txmsg.players.length === 0) {
      console.error(
        'ARCADE: createAcceptTransaction -- invalid or empty message from orig_tx',
        orig_tx.signature
      );
      return;
    }
    // Provide originator if missing: open-invite creator is always the first player
    if (txmsg.originator == null || txmsg.originator === '') {
      txmsg.originator = txmsg.players[0];
    }

    let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
    for (let i = 0; i < txmsg.players.length; i++) {
      newtx.addTo(txmsg.players[i]);
    }

    newtx.msg = JSON.parse(JSON.stringify(txmsg));
    newtx.msg.module = 'Arcade';
    newtx.msg.game_id = orig_tx.signature;
    newtx.msg.request = 'accept';

    await newtx.sign();

    return newtx;
  },

  async receiveAcceptTransaction(tx) {
    //Must be valid tx
    if (!tx) {
      console.error('ARCADE: Invalid Accept tx');
      return;
    }
    let txmsg = tx.returnMessage();

    if (!txmsg) {
      console.error(
        'ARCADE: receiveAcceptTransaction -- tx.returnMessage() is null; cannot initialize',
        tx?.signature
      );
      return;
    }
    if (txmsg.originator == null || txmsg.originator === '') {
      console.error(
        'ARCADE: receiveAcceptTransaction -- originator missing in accept tx; refusing to pass to game engine',
        txmsg.game_id
      );
      return;
    }

    //
    // Must have game module installed
    // We call the game-initialization function directly on gamemod further down
    //
    let gamemod = this.app.modules.returnModule(txmsg.game);

    // I guess this safety catch should be further up the processing chain, like we shouldn't even display an invite/join a game we don't have installed
    if (!gamemod) {
      console.error('ARCADE Error Initializing! Game Module not Installed -- ' + txmsg.game);
      return;
    }

    let game = this.returnGame(txmsg.game_id);

    // Must be an available invite
    if (!game || (!this.isAvailableGame(game.tx, 'accepted') && !txmsg.options?.async_dealing)) {
      // console.warn('ARCADE: game not available to accept', game, txmsg);
      return;
    }

    // do not re-accept game already in my local storage (a consequence of game initialization)
    for (let i = 0; i < this.app?.options?.games?.length; i++) {
      if (this.app.options.games[i].id === txmsg.game_id) {
        console.debug('ARCADE: [receiveAcceptTX] game already accepted and in my options');
        return;
      }
    }

    if (game.state) {
      return;
    }

    //
    // Mark the game as accept, i.e. active
    //
    this.changeGameStatus(txmsg.game_id, 'active');

    //
    // If I am a player in the game, let's start it initializing
    //
    if (txmsg.players.includes(this.publicKey)) {
      if (!this.app.options.arcade[txmsg.game]) {
        this.app.options.arcade[txmsg.game] = 0;
      }
      this.app.options.arcade[txmsg.game]++;

      this.app.options.arcade.last_game = txmsg.game;

      if (this.browser_active) {
        this.render('lounge_overlay', { game_id: txmsg.game_id });
      } else if (this.app.BROWSER == 1 && txmsg.players.length > 1) {
        siteMessage(txmsg.game + ' initializing', 5000);
      }

      let game_engine_id = await gamemod.initializeGameFromAcceptTransaction(tx);

      if (!game_engine_id || game_engine_id !== txmsg.game_id) {
        salert('Something went wrong with the game initialization: ' + game_engine_id);
      }
    }
  },

  async receivePeerStatusUpdateTransaction(tx) {
    let txmsg = tx.returnMessage();
    let pk = txmsg.data?.publickey;
    let status = txmsg.data?.status;
    if (!pk || !status) {
      return 0;
    }

    for (let id in this.invites) {
      let record = this.invites[id];
      if (record.tx.from[0].publicKey === pk) {
        record.is_sender_reachable = status === 'online';
      }
    }
    if (this.app.BROWSER) {
      this.renderInvites();
    }
    return 0;
  },

  ///////////////////////////////
  // "LOAD"ING AND RUNNING GAMES //
  ///////////////////////////////
  //
  // single player game

  addInviteRecord(tx, list = null) {
    if (!tx || !tx.msg || !tx.signature) {
      // console.error("ARCADE: [addGame] Invalid Game TX, won't add to list", tx);
      return false;
    }

    if (this.invites[tx.signature]) {
      return false;
    }

    if (list) {
      // status from caller
    } else {
      list = tx.msg?.request || 'open';
    }

    if (list !== 'over' && !list.includes('close')) {
      if (this.isMyGame(tx)) {
        list = 'mine';
      } else {
        if (tx.msg.players_needed <= tx.msg.players.length) {
          list = 'active';
        }
      }
    }

    this.invites[tx.signature] = {
      tx,
      status: list,
      updated_at: Date.now(),
      is_sender_reachable: true
    };

    return true;
  },

  removeInviteRecord(game_id) {
    delete this.invites[game_id];
  },

  returnGame(game_id) {
    const record = this.invites[game_id] || null;
    if (!record) return null;
    const engineState = this.app.options?.games?.find((g) => g.id === game_id) || null;
    return {
      ...record,
      state: engineState
    };
  },

  //
  // tentative roster lives ON the invite tx message so it survives
  // serialization to clients that fetch the invite list cold (needed to gate
  // the "join" button on table capacity)

  returnTentative(game_id) {
    let record = this.invites[game_id];
    if (!record?.tx?.msg) {
      return { join: [], leave: [] };
    }
    if (!record.tx.msg.tentative) {
      record.tx.msg.tentative = { join: [], leave: [] };
    }
    return record.tx.msg.tentative;
  },

  //
  // record intent to join/leave an open table (from the game's JOIN/LEAVE
  // metas), so the lounge can show pending players before the roster is
  // finalized on-chain

  receiveGametableMeta(tx) {
    let txmsg = tx.returnMessage();
    let game_id = txmsg.game_id;
    if (!game_id || !this.invites[game_id]) {
      return;
    }

    let t = this.returnTentative(game_id);
    let roster = this.invites[game_id].tx.msg.players || [];

    if (txmsg.request === 'JOIN') {
      // the joiner is data.pkey (JOIN metas are rebroadcast by each signer)
      let pkey = txmsg.data?.pkey;
      if (pkey && !t.join.includes(pkey) && !roster.includes(pkey)) {
        t.join.push(pkey);
        this.renderInvites();
      }
    } else if (txmsg.request === 'LEAVE') {
      let pkey = txmsg.my_key;
      if (pkey && !t.leave.includes(pkey)) {
        t.leave.push(pkey);
        this.renderInvites();
      }
    } else if (txmsg.request === 'CANCEL') {
      let pkey = txmsg.my_key;
      let before = t.join.length + t.leave.length;
      t.join = t.join.filter((k) => k !== pkey);
      t.leave = t.leave.filter((k) => k !== pkey);
      if (t.join.length + t.leave.length !== before) {
        this.renderInvites();
      }
    }
  },

  clearTentative(game_id, pkey) {
    let record = this.invites[game_id];
    let t = record?.tx?.msg?.tentative;
    if (!t) {
      return;
    }
    t.join = t.join.filter((k) => k !== pkey);
    t.leave = t.leave.filter((k) => k !== pkey);
  },

  returnGameTransaction(game_id) {
    let record = this.returnGame(game_id);
    if (record.tx) {
      return record.tx;
    }
    return null;
  },

  returnGamesWithFilter(filterObject) {
    return Object.values(this.invites).filter((record) => {
      for (let key in filterObject) {
        if (record[key] !== filterObject[key]) return false;
      }
      return true;
    });
  },

  purge() {
    const INVITE_CUTOFF = 2000000; // 30 minutes
    const GAME_CUTOFF = 600000000;

    const now = new Date().getTime();
    let walletModified = false;

    // --- Expire open/mine to closed (previous setInterval logic) ---
    for (let id of Object.keys(this.invites)) {
      let record = this.invites[id];
      let g = record.tx;
      if (
        (record.status === 'mine' || record.status === 'open') &&
        g.timestamp < now - INVITE_CUTOFF
      ) {
        this.removeInviteRecord(g.signature);
        this.addInviteRecord(g, 'closed');
      }
    }

    // --- Purge this.invites by age ---
    for (let id of Object.keys(this.invites)) {
      let record = this.invites[id];
      let cutoff = now - INVITE_CUTOFF;
      if (record.status === 'active' || record.status === 'over' || record.status === 'mine') {
        cutoff = now - GAME_CUTOFF;
      }
      if (record.tx.timestamp <= cutoff) {
        delete this.invites[id];
      }
    }

    if (this.app.BROWSER) {
      // Second pass: expire my invites that are not available
      let cutoff = now - INVITE_CUTOFF;
      for (let id of Object.keys(this.invites)) {
        let record = this.invites[id];
        if (record.status !== 'mine') continue;
        if (!this.isAvailableGame(record.tx) && record.tx.timestamp < cutoff) {
          siteMessage('Game invite timed out...', 4000);
          delete this.invites[id];
        }
      }
    }

    // --- Purge malformed wallet games (from purgeBadGamesFromWallet) ---
    if (this.app.options.games) {
      for (let i = this.app.options.games.length - 1; i >= 0; i--) {
        if (this.app.options.games[i].module === '' && this.app.options.games[i].id.length < 25) {
          this.app.options.games.splice(i, 1);
          walletModified = true;
        } else if (this.app.options.games[i].players_set == 0) {
          //This will be games created but not fully initialized for whatever reason
          this.app.options.games.splice(i, 1);
          walletModified = true;
        }
      }
    }

    // --- Purge completed/old wallet games (from purgeOldGamesFromWallet) ---
    if (this.app.options.games) {
      for (let i = this.app.options.games.length - 1; i >= 0; i--) {
        let g = this.app.options.games[i];
        if (g.over >= 1) {
          if (g.timestamp < now - 240000) {
            // after 1 hour
            this.app.options.games.splice(i, 1);
            walletModified = true;
          }
        }
      }
    }

    if (walletModified) {
      this.app.storage.saveOptions();
      this.renderInvites();
    }
  },

  saveOptions() {
    if (!this.app.BROWSER) {
      return;
    }

    if (!this.app.options.arcade) {
      this.app.options.arcade = {};
    }

    this.app.options.arcade['show-splash'] = this.show_splash;
    this.app.storage.saveOptions();
  },

  removeGameFromWallet(game_id) {
    this.removeInviteRecord(game_id);
    if (this.app.options.games) {
      for (let i = 0; i < this.app.options.games.length; i++) {
        if (this.app.options.games[i].id === game_id) {
          this.app.options.games.splice(i, 1);
          break;
        }
      }
    }
    this.app.storage.saveOptions();
    this.renderInvites();
  },

  isAvailableGame(game_tx, additional_status = '') {
    if (game_tx.msg.request == 'open' || game_tx.msg.request == 'private') {
      return true;
    }
    if (game_tx.msg.request == 'active' && game_tx.msg.options['open-table']) {
      return true;
    }
    if (additional_status && additional_status === game_tx.msg.request) {
      return true;
    }
    return false;
  },

  //
  // Determines whether the user is in any way associated with the game
  // Either they sent the invite, they have clicked join, or someone specifically invited them by key

  isMyGame(tx) {
    for (let i = 0; i < tx.to.length; i++) {
      if (tx.to[i].publicKey == this.publicKey) {
        return true;
      }
    }
    for (let i = 0; i < tx.msg.players.length; i++) {
      if (tx.msg.players[i] == this.publicKey) {
        return true;
      }
    }
    if (tx.msg.options) {
      if (tx.msg.options.desired_opponent_publickey) {
        if (tx.msg.options.desired_opponent_publickey == this.publicKey) {
          return true;
        }
      }
    }
    return false;
  },

  returnOpenInvites() {
    return Object.values(this.invites)
      .filter(
        (r) =>
          r.status === 'mine' && this.isAvailableGame(r.tx) && this.publicKey == r.tx.msg.originator
      )
      .map((r) => r.tx.signature);
  },

  shouldAffixCallbackToModule(modname) {
    if (modname == 'Arcade') {
      return 1;
    }
    for (let i = 0; i < this.affix_callbacks_to.length; i++) {
      if (this.affix_callbacks_to[i] == modname) {
        return 1;
      }
    }
    return 0;
  },

  isSlug(slug) {
    if (slug == this.returnSlug()) {
      return true;
    }
    return false;
  },


  _handleGameReadyNotification(game_details) {
    if (!game_details?.id) return;

    const game_id = game_details.id;

    this._closeReadyPopup();

    this._notifyGameReady(game_details);

    if (this._loungeOverlayOpenForGame(game_id)) {
      if (!this.lounge_overlay.showGameReadyState()) {
        this.render('lounge_overlay', { game_id });
      }
      return;
    }

    if (this.browser_active) {
      this.render('lounge_overlay', { game_id });
      return;
    }

    this._showReadyPopup(game_details);
  },

  _loungeOverlayOpenForGame(game_id) {
    if (!game_id || !this.lounge_overlay) return false;
    if (this.lounge_overlay.invite != null) return false;
    if (this.lounge_overlay.game_id !== game_id) return false;
    const ov = this.lounge_overlay.overlay;
    if (!ov?.visible) return false;
    const el = document.getElementById(`saito-overlay${ov.ordinal}`);
    return !!(el && el.style.display !== 'none' && el.querySelector('.arcade-lounge'));
  },

  _closeReadyPopup() {
    if (this.ready_popup_overlay?.visible) {
      this.ready_popup_overlay.close();
    }
  },

  _notifyGameReady(game_details) {
    if (!this.app.BROWSER || !this.main) return;
    let game_mod = this.app.modules.returnModuleBySlug(game_details?.slug);
    if (game_mod && !(game_mod.maxPlayers === 1 || this.app.browser.isMobileBrowser())) {
      this.app.browser.createTabNotification('Game ready!', game_details?.name || '');
      //siteMessage(`${game_details?.name || 'Game'} ready to play!`);
      try {
        let chime = new Audio('/saito/sound/Jinja.mp3');
        chime.play();
      } catch (e) {}
    }
  },

  _showReadyPopup(game_details) {
    if (!this.app.BROWSER) return;
    if (!this.ready_popup_overlay) {
      this.ready_popup_overlay = new SaitoOverlay(this.app, this, true, true, false);
      this.ready_popup_overlay.class = 'saito-overlay arcade-ready-overlay';
      this.ready_popup_overlay.clickBackdropToClose = false;
    }
    const slug = game_details?.slug || 'arcade';
    const name = game_details?.name || 'Game';
    const game_mod = this.app.modules.returnModuleBySlug(slug);
    const image = game_mod?.respondTo?.('arcade-games')?.image || '';
    const headerImageStyle = image ? ` style="background-image: url('${image}')"` : '';
    const html = `
            <div class="arcade-lounge arcade-lounge--ready-popup">
              <div class="arcade-lounge-header">
                <div class="arcade-lounge-header-image"${headerImageStyle}></div>
                <div class="arcade-lounge-header-title">${name}</div>
                <div class="arcade-lounge-header-desc">Game Ready</div>
              </div>
              <div class="arcade-lounge-body">
                <p class="arcade-lounge-message">Your table is set. Start when you are ready.</p>
              </div>
              <button type="button" class="fat saito-button-primary arcade-ready-popup-start" data-slug="${slug}">Start Game</button>
            </div>`;
    this.ready_popup_overlay.show(html);

    const startBtn = document.querySelector('.arcade-ready-popup-start');
    if (startBtn) {
      startBtn.onclick = () => {
        this.ready_popup_overlay.close();
        navigateWindow(`/${slug}`, 200);
      };
    }
  },

  showShareLink(game_sig, show = true) {
    let data = {};
    let accepted_game_tx = null;
    let accepted_game_msg = null;

    //Add more information about the game
    let game = this.returnGame(game_sig);
    if (game) {
      accepted_game_tx = game.tx;
    }

    if (accepted_game_tx) {
      accepted_game_msg = accepted_game_tx.msg;
      const game_mod =
        this.app.modules.returnModule(accepted_game_msg.game) ||
        this.app.modules.returnModuleBySlug(accepted_game_msg.game);

      data.game = game_mod?.returnSlug?.() ?? accepted_game_msg.game;
      data.game_id = game_sig;
      data.path = '/arcade/';
      data.invite = 1;
      if (accepted_game_msg?.options?.crypto) {
        data.crypto = accepted_game_msg.options.crypto;
      }

      // This is not a meaningful safety catch... the sharelink button is only available for available games...
      if (accepted_game_msg.players_needed > 1) {
        let game_invitation_link = new GameInvitationLink(this.app, this, data);
        game_invitation_link.render(show);
      } else {
        console.error('no players needed');
      }
    } else {
      console.error('Game not available');
    }
  },

  async makeGameInvite(options, gameType = 'open', invite_obj = {}) {
    let game = options.game;
    let game_mod = this.app.modules.returnModule(game);
    let players_needed = options['game-wizard-players-select'];

    //
    // add league_id to options if this is a league game
    //
    if (invite_obj.league) {
      //The important piece of information
      options.league_id = invite_obj.league.id;
      //For convenience sake when making the join overlay
      options.league_name = invite_obj.league.name;
    }
    if (invite_obj.publicKey) {
      options.desired_opponent_publickey = invite_obj.publicKey;
      gameType = 'direct';
    }
    if (invite_obj.gameobj) {
      options.gameobj = invite_obj.gameobj;
      gameType = 'import';
    }

    if (!players_needed) {
      console.error('ARCADE: [makeGameInvite] error, missing players_needed', options);
      return;
    }

    let gamedata = {
      ts: new Date().getTime(),
      name: game,
      slug: game_mod.returnSlug(),
      options: options,
      players_needed: players_needed,
      invitation_type: gameType
    };

    // Poker Validation
    if (options['open-table']) {
      if (options.stake && typeof options.stake === 'object') {
        await salert('Uneven staking is not allowed in cash games');
        options.stake = options.stake[this.publicKey].toString();
      }
    }

    if (parseInt(players_needed) === 1 || gameType === 'single' || game_mod.maxPlayers === 1) {
      if (typeof game_mod.launchFromArcadeWizard === 'function') {
        game_mod.launchFromArcadeWizard(options, invite_obj);
        return;
      }
      if (!this.app.options.arcade) {
        this.app.options.arcade = {};
      }
      this.app.options.arcade[game_mod.name] = (this.app.options.arcade[game_mod.name] || 0) + 1;
      this.app.options.arcade.last_game = game_mod.name;
      this.app.storage.saveOptions();
      navigateWindow(`/${game_mod.returnSlug()}/`);
      return;
    } else {
      let open_invites = this.returnOpenInvites();
      if (open_invites.length > 0) {
        let c = await sconfirm(
          'You already have an open invite. Are you sure you want to create a new one?'
        );
        if (!c) {
          return;
        } else {
          c = await sconfirm('Would you like to close the other invites?');
          if (c) {
            for (let game_id of open_invites) {
              this.sendCancelTransaction(game_id);
            }
          }
        }
      }

      if (gameType == 'direct') {
        if (gamedata.players_needed > 2) {
          gamedata.invitation_type = 'open';
        } else {
          gamedata.invitation_type = 'private';
        }
      }

      let newtx = await this.createOpenTransaction(gamedata);

      if (gameType == 'import') {
        this.app.connection.emit('arcade-launch-game-import', newtx);
        return;
      }

      await this.app.network.propagateTransaction(newtx);
      this.app.connection.emit('relay-send-message', {
        recipient: 'PEERS',
        request: 'arcade spv update',
        data: newtx.toJson()
      });

      if (this.app.browser.isMobileBrowser(navigator.userAgent) && !this.browser_active) {
        siteMessage('creating game invite...', 1500);
      }

      this.game_timeout = setTimeout(() => {
        salert(
          'Your browser may have broadcast that invite, but network seems unstable. Please refresh to confirm!'
        );
      }, 10000);
    }
  },


};
