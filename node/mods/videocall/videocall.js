const saito = require('../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');
const CallLaunch = require('./lib/ui/main');
const VideoCallInterface = require('./lib/ui/video_call_interface');
const DialingInterface = require('./lib/ui/dialer');
const SaitoOverlay = require('../../lib/saito/ui/saito-overlay/saito-overlay');
const StreamManager = require('./lib/stream_manager');
const AppSettings = require('./lib/ui/settings');
const CallDiagnostics = require('./lib/diagnostics');
const HomePage = require('./index');
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');

class Videocall extends ModTemplate {
  constructor(app) {
    super(app);
    this.app = app;
    this.appname = 'Saito Talk';
    this.name = 'Videocall';
    this.slug = 'videocall';

    this.description = 'P2P Video & Audio Connection Module';
    this.categories = 'Utilities Communications';
    this.status = 'prod';
    this.class = 'app';
    this.icon = 'fa-solid fa-mobile-screen-button';
    this.request_no_interrupts = true; // Don't let chat popup inset into /videocall
    this.isRelayConnected = false;

    //
    // short URLS
    //
    this.shortlinks_enabled = 1;

    this.screen_share = false;

    this.styles = ['/videocall/style.css'];

    this.stun = null; //The stun API
    this.streams = null;
    this.diagnostics = new CallDiagnostics(app, this);
    this.dialer = new DialingInterface(app, this);

    this.layout = 'focus';

    this.have_joined_room = 0;

    this.social = this.buildSocial({
      twitter: '@SaitoOfficial',
      title: '🟥 Saito Talk',
      url: '/videocall/',
      description: 'Peer to peer voice and video calling with no middleman',
      image: '/videocall/img/video-call-og.png'
    });

    app.connection.on('stun-connection-close', (peerId) => {
      if (this?.streams?.active) {
        this.disconnect(peerId, ' has no connection');
        salert('STUN connection failure. Try refreshing and reconnecting');
      }
    });

    app.connection.on('stun-connection-connected', () => {
      this.onPeerConnected();
    });
  }

  // A sender cap attempted before negotiation can be rejected. Reapply from
  // the current call membership once the peer is connected. One attempt per
  // event; a permanent rejection is not scheduled again until policy changes.
  onPeerConnected() {
    this.applyCameraProfile();
  }

  /**
   * rendered on:
   *  - /videocall
   *  - Saito-header menu
   *  - Saito-user-menu
   *  - game-menu options
   *
   */
  async initialize(app) {
    await super.initialize(app);

    if (app.BROWSER) {
      if (!this.app.options?.stun?.settings) {
        this.app.options.stun = {
          settings: { privacy: 'all' }
        };
      }

      if (this.app.options.stun.settings?.layout) {
        this.layout = this.app.options.stun.settings?.layout;
      }

      this.initializeMediaSettings();

      if (app.browser.returnURLParameter('stun_video_chat')) {
        this.room_obj = JSON.parse(
          app.crypto.base64ToString(app.browser.returnURLParameter('stun_video_chat'))
        );

        // JOIN THE ROOM
        if (!this.browser_active) {
          this.renderInto('.saito-overlay');
        }
      }

      try {
        this.stun = app.modules.returnFirstRespondTo('peer-manager');
      } catch (err) {
        console.error('SaitoTalk: Videocall unavailable without Stun module installed!');
      }
    }
  }

  async onPeerServiceUp(app, peer, service) {
    if (app.BROWSER !== 1) {
      return;
    }
    if (service.service === 'relay') {
      this.isRelayConnected = true;
    }
  }

  async render() {
    if (this.browser_active) {
      this.header = new SaitoHeader(this.app, this);
      await this.header.initialize(this.app);
      this.addComponent(this.header);
      this.addComponent(new CallLaunch(this.app, this, 'body'));
      await super.render();
      this.app.connection.emit('videocall-opened');
    }
  }

  async renderInto(qs) {
    if (qs == '.saito-overlay') {
      if (!this.renderIntos[qs]) {
        this.renderIntos[qs] = [];
        this.renderIntos[qs].push(new CallLaunch(this.app, this, qs));
      }
      this.attachStyleSheets();
      this.renderIntos[qs].forEach((comp) => {
        comp.render();
      });
      this.app.connection.emit('videocall-opened');
    }
  }

  registerLauncher(launcher) {
    if (!this.launchers) this.launchers = [];
    this.launchers.push(launcher);
  }

  closeLaunchers(rerender = false) {
    for (const launcher of this.launchers || []) {
      launcher.closePreview(rerender);
    }
  }

  initializeCallInterface(settings) {
    if (this.CallInterface) {
      console.warn('TALK: Already instatiated a video/audio call manager');
      return;
    }

    if (!this.streams || this.streams.detached) {
      console.debug('TALK: Instantiate StreamManager');
      this.streams = new StreamManager(this.app, this, settings);
    } else {
      this.streams.parseSettings(settings);
      this.streams.active = true;
    }

    console.debug('TALK [initializeCallInterface]: UI settings ', settings);

    // browser_active is 1 only when this page was loaded as /videocall.
    // Opening the Talk launcher over another app does not change it.
    // room_obj.ui remains video versus voice and is not a presentation choice.
    if (!this.browser_active) {
      this.attachStyleSheets();
    }
    this.CallInterface = new VideoCallInterface(
      this.app,
      this,
      this.browser_active ? 'meeting' : 'windows',
      settings?.container
    );

    this.saveCallToKeychain();
  }

  resetCall() {
    console.log('Reset Stun');
    this.room_obj = null;
    if (this.CallInterface) {
      this.CallInterface.destroy();
      this.CallInterface = null;
    }

    if (this.streams) {
      this.streams.detach();
      this.streams = null;
    }
    this.have_joined_room = 0;

    this.app.storage.saveOptions();
    this.diagnostics?.stop();

    const menu =
      typeof document !== 'undefined' && document.getElementById('start-group-video-chat');
    if (menu) {
      menu.classList.remove('disable-menu');
      menu.innerHTML = 'Start Call';
    }
  }

  receiveInGameCall(room_obj) {
    this.room_obj = room_obj;
    this.dialer.render('', false);
  }

  beginGameCall() {
    this.gameModule?.sendMetaMessage('CALL', this.room_obj);
    this.initializeCallInterface({
      ui: this.room_obj.ui,
      audio: true,
      video: this.room_obj.ui == 'video'
    });
    this.streams?.start();
  }

  respondTo(type, obj) {
    let call_self = this;

    let app = this.app;
    if (type === 'user-menu') {
      //Don't provide a calling hook if in the video call app!
      // if (call_self.browser_active) {
      // 	return null;
      // }
      if (obj?.publicKey !== this.publicKey && this.streams?.active === true) {
        return [
          {
            text: 'Kick User From Call',
            icon: 'fa-solid fa-user-slash',
            callback: async (app, public_key) => {
              console.info('TALK: kicking user: ', public_key);
              this.CallInterface?.participantKicked?.(public_key);
              await this.sendKickTransaction(public_key);
              this.disconnect(public_key, 'was kicked out of the call');
            }
          }
        ];
      } else {
        if (obj?.publicKey !== this.publicKey) {
          this.attachStyleSheets();
          return [
            {
              text: 'Video/Audio Call',
              icon: 'fas fa-video',
              callback: function (app, public_key) {
                if (call_self?.room_obj) {
                  salert('Already in or establishing a call');
                  console.debug('SaitoTalk: ', call_self.room_obj);
                } else {
                  call_self.dialer.establishStunCallWithPeers([public_key]);
                }
              }
            }
          ];
        }
      }
    }

    if (type === 'saito-header') {
      if (!this.browser_active && !this.app.modules.returnActiveModule()?.disable_talk) {
        this.attachStyleSheets();

        return [
          {
            text: 'Saito Talk',
            icon: this.icon,
            type: 'quicklaunch',
            callback: function (app, id) {
              call_self.renderInto('.saito-overlay');
            },
            navigation: '/videocall'
          }
        ];
      }
    }

    //
    //Game-Menu passes the game_mod as the obj, so we can test if we even want to add the option
    //
    if (type == 'game-menu') {
      this.attachStyleSheets();

      if (!this.gameMenuListening) {
        this.gameMenuListening = true;
        this.app.connection.on('videocall-call-started', () => {
          document.getElementById('start-group-video-chat')?.classList.add('disable-menu');
        });
      }

      if (obj?.game?.players?.length > 1) {
        let menu_items = {
          id: 'game-social',
          text: 'Chat',
          submenus: [
            {
              parent: 'game-social',
              text: 'Start Call',
              id: 'start-group-video-chat',
              class: 'start-group-video-chat',
              callback: function (app, game_mod) {
                call_self.gameModule = game_mod;

                //Start Call
                game_mod.menu.hideSubMenus();

                if (game_mod?.room_obj && !call_self.room_obj) {
                  call_self.room_obj = Object.assign({}, game_mod.room_obj);
                }

                if (call_self?.room_obj) {
                  if (call_self.streams?.active) {
                    salert('Already in or establishing a call');
                    console.debug('SaitoTalk: ', call_self.room_obj);
                  } else {
                    call_self.initializeCallInterface({
                      ui: call_self.room_obj.ui,
                      audio: true,
                      video: call_self.room_obj.ui == 'video'
                    });
                    call_self.streams?.start();
                  }
                } else {
                  call_self.dialer.establishStunCallWithPeers(/*[...game_mod.game.players]*/);
                }
              }
            }
          ]
        };

        return menu_items;
      }
    }

    if (type === 'saito-link') {
      const urlParams = new URL(obj?.link).searchParams;
      const entries = urlParams.entries();
      for (const pair of entries) {
        if (pair[0] == 'stun_video_chat') {
          return {
            processLink: (link) => {
              this.room_obj = JSON.parse(this.app.crypto.base64ToString(pair[1]));
              this.renderInto('.saito-overlay');
            }
          };
        }
      }
    }

    if (type === 'chat-actions') {
      if (obj?.publicKey) {
        if (obj.publicKey !== this.publicKey) {
          this.attachStyleSheets();
          return [
            {
              text: 'Video/Audio Call',
              icon: 'fas fa-phone',
              callback: function (app, id) {
                if (call_self?.room_obj) {
                  salert('Already in or establishing a call');
                  console.debug('SaitoTalk: ', call_self.room_obj);
                } else {
                  call_self.dialer.establishStunCallWithPeers([obj.publicKey]);
                }
              }
            }
          ];
        }
      }
    }

    if (type === 'call-actions') {
      return [
        {
          text: 'Present',
          icon: 'fa-solid fa-display',
          hook: 'screen_share onair',
          prepend: true,
          callback: function (app) {
            //
            // screen_share === true when we present; a public key when a peer does
            //
            if (call_self.screen_share && call_self.screen_share !== true) {
              siteMessage(
                `${call_self.app.keychain.returnUsername(call_self.screen_share)} is presenting`,
                2000
              );
              return;
            }
            if (call_self.screen_share) {
              call_self.streams?.stopShareScreen();
            } else {
              call_self.streams?.beginShareScreen();
            }
          },
          event: function (id) {
            if (call_self.CallInterface) call_self.CallInterface.presentControlId = id;
          }
        },
        {
          text: 'Settings',
          icon: 'fa-solid fa-cog',
          prepend: true,
          callback: function () {
            call_self.CallInterface?.showSettings?.();
          }
        }
      ];
    }

    if (type === 'media-request') {
      if (this?.streams?.active) {
        return {
          localStream: this.streams.localStream,
          remoteStreams: this.streams.remoteStreams
        };
      } else {
        return null;
      }
    }

    return super.respondTo(type, obj);
  }

  hasSettings() {
    return true;
  }

  loadSettings(container = null) {
    let as = new AppSettings(this.app, this, container);
    as.render();
  }

  onConfirmation(blk, tx, conf) {
    if (tx == null) {
      return;
    }

    let message = tx.returnMessage();

    if (Number(conf) == 0) {
      if (message.module === 'Videocall') {
        if (this.app.BROWSER === 1) {
          let from = tx.from[0].publicKey;

          if (this.hasSeenTransaction(tx, blk)) return;

          if (!this.have_joined_room || tx.timestamp + 3000 < this.have_joined_room) {
            console.log(
              'STUN/TX Ignore (on chain) txs from before I joined the call',
              new Date(tx.timestamp).toTimeString(),
              new Date(this.have_joined_room).toTimeString()
            );
            return;
          }

          if (!tx.isFrom(this.publicKey)) {
            //Someone joined call room
            if (message.request === 'call-list-request') {
              console.info('TALK: [callListRequest -- onConfirmation] from ', from);

              this.receiveCallListRequestTransaction(this.app, tx);
            }
            //Someone in the room responds
            if (message.request === 'call-list-response') {
              console.info('TALK: [callListResponse -- onConfirmation] from ', from);
              this.receiveCallListResponseTransaction(this.app, tx);
            }
          }
        }
      }
    }
  }

  async handlePeerTransaction(app, tx = null, peer, mycallback) {
    if (tx == null) {
      return;
    }
    let txmsg = tx.returnMessage();

    if (this.app.BROWSER === 1) {
      if (tx.isTo(this.publicKey) && !tx.isFrom(this.publicKey)) {
        //
        // These messages are sent exclusively through Relay -- so unsigned
        // and not belonging to a module
        //
        if (txmsg.request?.includes('stun-connection')) {
          console.debug('TALK [HPT]: Stun-connection', txmsg.data);
          this.dialer.receiveStunCallMessageFromPeers(tx);
          return;
        }

        if (txmsg.module == 'Videocall' || txmsg.module == 'Stun') {
          if (!this.have_joined_room || tx.timestamp + 3000 < this.have_joined_room) {
            console.log(
              'STUN/TX Ignore (HPT) txs from before I joined the call (will wait for onchain...)',
              new Date(tx.timestamp).toTimeString(),
              new Date(this.have_joined_room).toTimeString()
            );
            console.log(txmsg);
            return;
          }

          if (this.hasSeenTransaction(tx)) return;

          // Allow processing from outside of room
          //
          let from = tx.from[0].publicKey;
          if (txmsg.request === 'call-list-request') {
            console.info('TALK: [callListRequest -- handlePeerTransaction] from ', from);

            this.receiveCallListRequestTransaction(this.app, tx);
            return;
          }

          // Only respond if this is a pertinent call
          if (
            !this?.room_obj?.call_id ||
            this.room_obj.call_id !== txmsg.call_id /*|| !this.streams*/
          ) {
            return;
          }

          if (txmsg.request !== 'call-list-response') {
            this.diagnostics?.record(from, `Received: ${txmsg.request}`);
          }
          console.debug('TALK [HPT]: ' + txmsg.request);

          if (txmsg.request === 'call-list-response') {
            console.info('TALK: [callListResponse -- HPT] from ', from);
            this.receiveCallListResponseTransaction(this.app, tx);
            return;
          }

          if (txmsg.request === 'peer-joined') {
            let from = tx.from[0].publicKey;

            console.debug('TALK [peer-joined]: ' + from);
            //Check if we have a broken stun connection
            /*if (!this.stun.hasConnection(from, true)) {
							console.info('TALK [peer-joined]: reset stun peer connection for new join ', from);
							this.stun.removePeerConnection(from);
						}*/

            this.CallInterface?.receiveRemoteStream?.(from, null);

            if (!this.room_obj.call_peers.includes(from)) {
              this.room_obj.call_peers.push(from);
              this.CallInterface?.updateRoomLink?.();
            }

            //Limbo Hook
            this.app.connection.emit('videocall-peer-joined', from);

            this.stun.createPeerConnection(from, false);
            this.applyCameraProfile();

            return;
          }

          if (txmsg.request === 'peer-left') {
            if (!tx.isFrom(this.publicKey)) {
              this.disconnect(tx.from[0].publicKey);
            }
          }

          if (txmsg.request === 'peer-kicked') {
            this.streams?.leaveCall();
            siteMessage(
              `${this.app.keychain.returnUsername(tx.from[0].publicKey)} kicked you out of the call`
            );
          }

          if (txmsg.request === 'peer-kick-broadcast') {
            const kicked = txmsg.data?.kicked_peer;
            if (kicked) {
              this.disconnect(kicked, 'was kicked out of the call');
            }
          }

          const peerMediaEvent = {
            'toggle-audio': 'videocall-peer-audio-changed',
            'toggle-video': 'videocall-peer-video-changed'
          }[txmsg.request];
          if (peerMediaEvent) {
            this.app.connection.emit(peerMediaEvent, txmsg.data);
          }

          if (
            txmsg.request === 'toggle-transcription' &&
            this.streams?.active &&
            this.room_obj.call_peers.includes(from) &&
            typeof txmsg.data?.enabled === 'boolean'
          ) {
            this.streams.updateTranscriptionStatus(from, txmsg.data.enabled);
          }

          if (txmsg.request === 'screen-share-start') {
            if (this.screen_share !== tx.from[0].publicKey) {
              this.screen_share = tx.from[0].publicKey;
              this.CallInterface?.receiveRemoteStream?.('presentation', null);
              this.CallInterface?.setPresenting?.(true, tx.from[0].publicKey);
              siteMessage(
                `${this.app.keychain.returnUsername(tx.from[0].publicKey)} started presenting`,
                2500
              );
            }
          }

          if (txmsg.request === 'screen-share-stop') {
            this.CallInterface?.presentationStopped?.();
            this.CallInterface?.switchLayout?.(
              this.app.options.stun.settings?.layout || this.layout
            );

            this.streams.remoteStreams.delete('presentation');
            this.screen_share = null;
            this.CallInterface?.setPresenting?.(false);
          }

          // Peer sharing connection state with people in the call...
          if (txmsg.request === 'broadcast-call-list') {
            this.receiveBroadcastListTransaction(this.app, tx);
          }
        }
      }
    }

    return super.handlePeerTransaction(app, tx, peer, mycallback);
  }

  disconnect(peer, msg = 'left the meeting') {
    if (!peer) return;

    const members = this.room_obj?.call_peers;
    let departed = false;
    if (Array.isArray(members)) {
      const index = members.indexOf(peer);
      if (index !== -1) {
        members.splice(index, 1);
        departed = true;
        setTimeout(() => {
          this.CallInterface?.updateRoomLink?.();
          //wait to update because peer might come right back
        }, 300000);
      }
    }

    // Stun also removes on peer-left. Removing again is a no-op.
    this.stun?.removePeerConnection?.(peer);

    // Remote presentation only. Local display tracks stay with StreamManager.
    if (this.screen_share === peer) {
      this.screen_share = null;
      this.streams?.remoteStreams?.delete?.('presentation');
      this.CallInterface?.presentationStopped?.();
      this.CallInterface?.setPresenting?.(false);
      departed = true;
    }

    if (!departed) return;

    this.applyCameraProfile();
    this.CallInterface?.participantLeft?.(peer);
    this.streams?.removePeer?.(peer, msg);
  }

  // A convenience function to send metadata through the stun channel (if established) or over relay otherwise
  // but
  async sendOffChainMessage(request, data) {
    let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();

    for (let peer of this.room_obj.call_peers) {
      if (peer != this.publicKey) {
        newtx.addTo(peer);
      }
    }

    newtx.msg = {
      module: 'Videocall',
      request,
      call_id: this.room_obj.call_id,
      data
    };

    await newtx.sign();

    this.app.connection.emit('relay-transaction', newtx);
  }

  async sendCallEntryTransaction() {
    if (!this.room_obj) {
      console.error('TALK: No room object');
      return;
    }

    let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
      this.room_obj.call_id
    );

    if (this.room_obj?.host_public_key) {
      newtx.addTo(this.room_obj.host_public_key);
    }

    this.diagnostics?.record('local', 'Requesting participant list from room / host');

    // Fallback for saved calls when blocks aren't forming correctly
    let event = this.app.keychain.returnKey(this.room_obj.call_id, true);
    if (event?.profile?.participants) {
      for (let participant of event.profile.participants) {
        newtx.addTo(participant);
      }
    }

    newtx.msg.module = 'Videocall';
    newtx.msg.request = 'call-list-request';
    newtx.msg.call_id = this.room_obj.call_id;

    await newtx.sign();

    console.info(
      'TALK: Sending call entry: ',
      newtx.msg,
      event,
      this.room_obj,
      new Date(newtx.timestamp).toTimeString()
    );

    this.have_joined_room = newtx.timestamp;

    this.app.connection.emit('relay-transaction', newtx);
    this.app.network.propagateTransaction(newtx);
    this.addCallParticipant(this.room_obj.call_id, this.publicKey);
  }

  async receiveCallListRequestTransaction(app, tx) {
    let txmsg = tx.returnMessage();

    let from = tx.from[0].publicKey;

    //Update calendar event
    this.addCallParticipant(txmsg.call_id, from);

    console.log('TALK [receiveCallListRequest]: ', from);

    //We are getting a tx for the call we are in
    if (this?.room_obj?.call_id === txmsg.call_id) {
      this.diagnostics?.record(from, 'Received: call-list-request');
      let call_list = [];

      if (this.room_obj.call_peers) {
        this.room_obj.call_peers.forEach((key) => {
          if (!call_list.includes(key)) {
            call_list.push(key);
          }
        });
      }

      if (!call_list.includes(this.publicKey)) {
        call_list.push(this.publicKey);
      }

      this.CallInterface?.updateRoomLink?.();

      if (!tx.isFrom(this.publicKey)) {
        setTimeout(
          () => {
            console.log('Send response');
            this.sendCallListResponseTransaction(from, call_list);
          },
          250 + Math.max(0, tx.timestamp - Date.now())
        );
      }

      return;
    }

    // Process if we saved event but are not in the call!
    let event = this.app.keychain.returnKey(txmsg.call_id, true);

    if (event && !event.ended) {
      console.info('TALK EVENT!!!', event);
      // I am in a different call
      if (this.room_obj?.call_id) {
        siteMessage(`${this.app.keychain.returnUsername(from)} joined ${event.identifier}`);
      } else {
        let c = await sconfirm(
          `${this.app.keychain.returnUsername(from)} ready for ${event.identifier}, join now?`
        );
        if (c) {
          if (event?.link) {
            let processed = false;
            this.app.modules
              .getRespondTos('saito-link', { link: event.link })
              .forEach((modResponse) => {
                processed = true;
                modResponse.processLink(event.link);
              });

            if (!processed) {
              navigateWindow(event.link);
            }
          } else {
            salert('No saved link');
          }
        }
      }
    }
  }

  async sendCallListResponseTransaction(public_key, call_list) {
    let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(public_key);

    newtx.msg = {
      module: 'Videocall',
      request: 'call-list-response',
      call_list,
      public_key,
      call_id: this.room_obj.call_id
    };

    await newtx.sign();

    console.debug('TALK: send callListResponse: to ' + public_key, call_list);

    this.app.connection.emit('relay-transaction', newtx);
    this.app.network.propagateTransaction(newtx);
  }

  receiveCallListResponseTransaction(app, tx) {
    let txmsg = tx.returnMessage();

    if (txmsg.public_key !== this.publicKey) {
      console.warn(`TALK received callListResponse for ${txmsg.public_key}`);
    }

    this.diagnostics?.record(tx.from[0].publicKey, 'Received: call-list-response');
    let call_list = txmsg.call_list;
    // remove my own key
    call_list = call_list.filter((key) => this.publicKey !== key);

    //
    // Create a connection with everyone
    //
    console.debug(
      'TALK [callListResponse]: My peer list: ',
      this.room_obj.call_peers,
      'Received list: ',
      call_list
    );

    for (let peer of call_list) {
      // update keychain
      this.addCallParticipant(txmsg.call_id, peer);
      if (peer !== this.publicKey) {
        if (!this.room_obj?.call_peers.includes(peer)) {
          this.room_obj?.call_peers.push(peer);
          console.debug('TALK [callListResponse]: add peer to room obj');
        }

        // A pre-existing Saito data channel still needs the call join message
        // and the media-attachment event supplied by createPeerConnection.
        const pc = this.stun.peers.get(peer);
        const localTracks = this.streams?.localStream?.getTracks() || [];
        const hasCallMedia = pc?.getSenders().some((sender) => localTracks.includes(sender.track));
        if (!this.stun.hasConnection(peer, true) || !hasCallMedia) {
          console.debug('TALK [callListResponse]: create connection with ', peer);
          this.stun.createPeerConnection(peer, (peerId) => {
            console.debug('TALK [callListResponse]: ready for STUN connection with ' + peerId);
            this.sendCallJoinTransaction(peerId);
          });
        } else {
          console.debug('TALK [callListResponse]: DONT create connection with ', peer);
        }
      }
    }

    this.CallInterface?.updateRoomLink?.();
    this.applyCameraProfile();
    this.app.storage.saveOptions();
  }

  //
  // Videocall and stun both need a join connection, but we need videocall to process first so that the
  // key is added to the white list and the stun connection can be treated as a call entry (as opposed to
  // someone else establising a stun connection for other purposes)
  //
  async sendCallJoinTransaction(publicKey) {
    this.diagnostics?.record(publicKey, 'Preparing call join message');
    let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(publicKey);

    newtx.msg = {
      module: 'Videocall',
      request: 'peer-joined',
      call_id: this.room_obj.call_id
    };

    await newtx.sign();

    console.debug('TALK [sendCallJoinTransaction]: kicking of stun protocol');

    this.app.connection.emit('relay-transaction', newtx);
    this.app.network.propagateTransaction(newtx);

    this.CallInterface?.receiveRemoteStream?.(publicKey, null);
  }

  async sendCallDisconnectTransaction() {
    if (!this?.room_obj) {
      console.error('TALK [callDisconnect]: No room object!');
      return;
    }

    console.info('TALK [callDisconnect] (hang up):', this.room_obj);

    let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();

    for (let peer of this.room_obj.call_peers) {
      if (peer != this.publicKey) {
        newtx.addTo(peer);
      }
    }

    newtx.msg = {
      module: 'Stun',
      request: 'peer-left',
      call_id: this.room_obj.call_id
    };

    await newtx.sign();

    this.app.connection.emit('relay-transaction', newtx);

    //
    // Allow us to use stun connection to send tx before disconnecting!
    //
    for (let peer of this.room_obj.call_peers) {
      if (peer != this.publicKey) {
        //Disconnect stun on our end
        // the send tx will tell (former) peers to do the same
        this.stun.removePeerConnection(peer);
      }
    }
  }
  async sendKickTransaction(peer) {
    if (!this?.room_obj) {
      console.error('TALK [sendKick]: No room object!');
      return;
    }

    console.debug('TALK: Send kick message:', this.room_obj, peer);

    let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(peer);

    newtx.msg = {
      module: 'Stun',
      request: 'peer-kicked',
      call_id: this.room_obj.call_id
    };

    await newtx.sign();

    this.app.connection.emit('relay-transaction', newtx);

    //
    // Allow us to use stun connection to send tx before disconnecting!
    //
    this.stun.removePeerConnection(peer);
    this.sendKickBroadcastMessageTransaction(peer);
  }

  async sendKickBroadcastMessageTransaction(peer_id) {
    if (!this?.room_obj) {
      console.error('TALK [sendKickBroadcast]: No room object!');
      return;
    }

    let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();

    for (let peer of this.room_obj.call_peers) {
      if (peer != this.publicKey && peer !== peer_id) {
        newtx.addTo(peer);
      }
    }

    newtx.msg = {
      module: 'Stun',
      request: 'peer-kick-broadcast',
      data: {
        kicked_peer: peer_id
      },
      call_id: this.room_obj.call_id
    };

    console.debug('TALK [sendKickBroadcast]:', this.room_obj, newtx.msg);

    await newtx.sign();

    this.app.connection.emit('relay-transaction', newtx);
  }

  async receiveBroadcastListTransaction(app, tx) {
    const txmsg = tx.returnMessage();
    let sender = tx.from[0].publicKey;

    // Need code here to process keys that aren't otherwise in our call list
    // retrigger stun connections

    let call_list = [];

    for (let peer in txmsg.data) {
      if (txmsg.data[peer] == 'connected') {
        if (peer !== this.publicKey) {
          if (!this.room_obj.call_peers.includes(peer)) {
            this.room_obj.call_peers.push(peer);

            console.warn(
              'TALK [broadcastList]: post hoc peer list member, attempt connection with ',
              peer
            );
            this.stun.createPeerConnection(peer, (peerId) => {
              this.sendCallJoinTransaction(peerId);
            });
          }
        }
      }
    }

    //Update display of videoboxes
    this.app.connection.emit('peer-list', sender, txmsg.data);
    this.applyCameraProfile();
  }

  // Persist the media mode under the wallet options. Default is the only
  // mode implemented; automatic and unlimited can use the same field later.
  initializeMediaSettings() {
    if (!this.app.options.videocall) this.app.options.videocall = {};
    if (!this.app.options.videocall.settings) this.app.options.videocall.settings = {};
    if (!this.app.options.videocall.settings.mode) {
      this.app.options.videocall.settings.mode = 'default';
      this.app.storage?.saveOptions?.();
    }
  }

  // Only default is implemented. A missing, unknown, or not-yet-supported
  // stored mode uses that profile rather than leaving capture uncapped.
  mediaMode() {
    return 'default';
  }

  // Zero remote peers uses the one-to-one capture size. Callers must not
  // divide cameraBitrateBudget by zero or configure senders in that case.
  cameraProfile(remotePeerCount) {
    if (remotePeerCount <= 1) {
      return { width: 1280, height: 720, frameRate: 24, cameraBitrateBudget: 1500000 };
    }
    if (remotePeerCount <= 4) {
      return { width: 640, height: 360, frameRate: 15, cameraBitrateBudget: 1600000 };
    }
    return { width: 320, height: 180, frameRate: 10, cameraBitrateBudget: 1200000 };
  }

  applyCameraProfile() {
    if (this.mediaMode() !== 'default' || !this.room_obj?.call_peers) return;

    const remotePeerCount = this.room_obj.call_peers.length;
    const profile = this.cameraProfile(remotePeerCount);
    const generation = (this.cameraProfileGeneration = (this.cameraProfileGeneration || 0) + 1);
    const peers = this.room_obj.call_peers.slice();
    const share =
      remotePeerCount > 0 ? Math.floor(profile.cameraBitrateBudget / remotePeerCount) : 0;

    const finish = () => {
      if (generation !== this.cameraProfileGeneration) return;
      if (share > 0) {
        for (const peerId of peers) {
          void this.stun?.setCameraSenderBitrate?.(peerId, share);
        }
      }
      this.applyScreenShareBitrate();
    };

    const pending = this.streams?.setCameraCapture?.({
      width: profile.width,
      height: profile.height,
      frameRate: profile.frameRate
    });
    if (pending && typeof pending.then === 'function') {
      return pending.then(finish, finish);
    }
    finish();
  }

  // Screen video is a separate sender. 1,500,000 bps is the total for every
  // remote peer, not the cap on each sender.
  applyScreenShareBitrate() {
    if (this.mediaMode() !== 'default' || this.screen_share !== true) return;
    const remotePeerCount = this.room_obj?.call_peers?.length || 0;
    if (remotePeerCount < 1) return;
    const maxBitrate = Math.floor(1500000 / remotePeerCount);
    for (const peerId of this.room_obj.call_peers) {
      void this.stun?.setScreenSenderBitrate?.(peerId, maxBitrate);
    }
  }

  addCallParticipant(call_id, publicKey) {
    let event = this.app.keychain.returnKey(call_id, true);
    // We will add this key as a call participant...
    if (event) {
      if (!event?.profile) {
        event.profile = {};
      }
      if (!event.profile?.participants) {
        event.profile.participants = [];
      }

      if (!event.profile.participants.includes(publicKey)) {
        event.profile.participants.push(publicKey);
        this.app.keychain.saveKeys();
      }
    }
  }

  saveCallToKeychain() {
    let call_link = this.generateCallLink();
    let name = 'Video Call';

    if (this.room_obj?.ui) {
      name = 'Private Call';
    }

    if (this.room_obj?.host_public_key) {
      name += ' ' + this.app.keychain.returnUsername(this.room_obj.host_public_key);
    }
    if ((!this.app.keychain.returnKey(this.room_obj.call_id), true)) {
      this.app.keychain.addKey(this.room_obj.call_id, {
        identifier: name,
        type: 'event',
        mod: 'videocall',
        startTime: Date.now(),
        link: call_link
      });
    }

    console.debug('TALK: save call to keychain', this.room_obj);

    this.app.keychain.addWatchedPublicKey(this.room_obj.call_id);
  }

  createRoom(identifier = 'my video call') {
    let call_id = this.generateRoomId();
    this.room_obj = {
      call_id,
      host_public_key: this.publicKey,
      call_peers: []
    };

    let link = this.generateCallLink(this.room_obj);
    this.app.keychain.addKey(call_id, {
      identifier,
      link
    });

    return link;
  }

  generateRoomId() {
    let pk = this.app.crypto.generateKeys();
    let id = this.app.crypto.generatePublicKey(pk);
    this.app.keychain.addKey(id, {
      identifier: id,
      privateKey: pk,
      type: 'event',
      mod: 'videocall',
      startTime: Date.now(),
      watched: true
    });
    return id;
  }

  generateCallLink(room_obj = this.room_obj) {
    let base64obj = this.app.crypto.stringToBase64(JSON.stringify(room_obj));

    let call_link = window.location.origin + '/videocall/';
    call_link = `${call_link}?stun_video_chat=${base64obj}`;

    return call_link;
  }

  async copyInviteLink() {
    //alert("copy invite link!");
    const link = await this.createShortLink(this.generateCallLink());
    //alert("link is: " + link);
    await navigator.clipboard.writeText(link);
    siteMessage('Invite link copied to clipboard', 1500);
  }

  webServer(app, expressapp, express) {
    let webdir = `${__dirname}/../../mods/${this.dirname}/web`;
    let mod_self = this;

    expressapp.get('/' + encodeURI(this.returnSlug()), async function (req, res) {
      let reqBaseURL = req.protocol + '://' + req.headers.host + '/';

      mod_self.social.url = reqBaseURL + encodeURI(mod_self.returnSlug());

      if (!res.finished) {
        res.setHeader('Content-type', 'text/html');
        res.charset = 'UTF-8';
        return res.send(HomePage(app, mod_self, app.build_number, mod_self.social));
      }
      return;
    });

    expressapp.use('/' + encodeURI(this.returnSlug()), express.static(webdir));
  }
}

module.exports = Videocall;
