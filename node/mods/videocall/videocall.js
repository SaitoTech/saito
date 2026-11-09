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
const SwarmcastViewer = require('./lib/ui/swarmcast');
const { SwarmcastPublication, syncSenders, trackMap } = require('./lib/swarmcast-publication');

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

    this.peerManager = null;
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
      if (this.broadcast?.viewers?.has(peerId)) {
        this.broadcast.viewers.delete(peerId);
        return;
      }
      if (this.swarmcastRoute && this.swarmcastView?.contact === peerId) {
        this.swarmcastView.interrupt();
        return;
      }
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
      this.swarmcastRoute = this.readSwarmcastRoute();

      if (!this.swarmcastRoute && app.browser.returnURLParameter('stun_video_chat')) {
        this.room_obj = JSON.parse(
          app.crypto.base64ToString(app.browser.returnURLParameter('stun_video_chat'))
        );

        // JOIN THE ROOM
        if (!this.browser_active) {
          this.renderInto('.saito-overlay');
        }
      }

      try {
        this.peerManager = app.modules.returnFirstRespondTo('peer-manager');
      } catch (err) {
        console.error('SaitoTalk: Videocall unavailable without Stun module installed!');
      }

      if (!this.streams) {
        this.streams = new StreamManager(this.app, this);
      }
    }
  }

  destroy(app) {
    this.stopBroadcast();
    this.swarmcastView?.destroy();
    this.swarmcastView = null;
    this.streams?.destroy();
    this.streams = null;
    super.destroy(app);
  }

  async onPeerServiceUp(app, peer, service) {
    if (app.BROWSER !== 1) {
      return;
    }
    if (service.service === 'relay') {
      this.isRelayConnected = true;
      this.swarmcastView?.noteRelay?.();
    }
  }

  async render() {
    if (this.browser_active) {
      this.header = new SaitoHeader(this.app, this);
      await this.header.initialize(this.app);
      this.addComponent(this.header);
      if (this.swarmcastRoute) {
        this.swarmcastView = new SwarmcastViewer(this.app, this, this.swarmcastRoute);
        this.addComponent(this.swarmcastView);
        await super.render();
        return;
      }
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

    if (!this.streams) {
      console.debug('TALK: Instantiate StreamManager');
      this.streams = new StreamManager(this.app, this, settings);
    } else {
      this.streams.parseSettings(settings);
    }
    this.streams.attach();
    this.streams.active = true;

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
    this.stopBroadcast();
    this.room_obj = null;
    if (this.CallInterface) {
      this.CallInterface.destroy();
      this.CallInterface = null;
    }

    this.streams?.releaseCall?.();
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
          text: 'Broadcast',
          icon: 'fa-solid fa-tower-broadcast',
          hook: 'swarmcast onair',
          prepend: true,
          callback: function () {
            call_self.toggleBroadcast();
          },
          event: function (id) {
            call_self.broadcastControlId = id;
            if (call_self.broadcast) call_self.setBroadcasting(true);
          }
        },
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

        if (
          txmsg.module == 'Videocall' &&
          String(txmsg.request || '').startsWith('video-call-swarmcast-')
        ) {
          if (this.hasSeenTransaction(tx)) return;
          await this.handleSwarmcastMessage(tx, txmsg);
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
            /*if (!this.peerManager.hasConnection(from, true)) {
							console.info('TALK [peer-joined]: reset stun peer connection for new join ', from);
							this.peerManager.removePeerConnection(from);
						}*/

            this.streams?.ensureRemote?.(from);

            if (!this.room_obj.call_peers.includes(from)) {
              this.room_obj.call_peers.push(from);
              this.CallInterface?.updateRoomLink?.();
            }

            //Limbo Hook
            this.app.connection.emit('videocall-peer-joined', from);

            this.peerManager.createPeerConnection(from, false);
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
              this.streams?.noteDisplay?.(tx.from[0].publicKey);
              this.CallInterface?.setPresenting?.(true, tx.from[0].publicKey);
              siteMessage(
                `${this.app.keychain.returnUsername(tx.from[0].publicKey)} started presenting`,
                2500
              );
            }
          }

          if (txmsg.request === 'screen-share-stop') {
            this.streams?.clearDisplay?.();
            this.CallInterface?.switchLayout?.(
              this.app.options.stun.settings?.layout || this.layout
            );

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
    this.peerManager?.removePeerConnection?.(peer);

    // Remote presentation only. Local display tracks stay with StreamManager.
    if (this.screen_share === peer) {
      this.screen_share = null;
      this.streams?.clearDisplay?.();
      this.CallInterface?.setPresenting?.(false);
      departed = true;
    }

    if (!departed) return;

    this.applyCameraProfile();
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
        const pc = this.peerManager.peers.get(peer);
        const localTracks = this.streams?.localStream?.getTracks() || [];
        const hasCallMedia = pc?.getSenders().some((sender) => localTracks.includes(sender.track));
        if (!this.peerManager.hasConnection(peer, true) || !hasCallMedia) {
          console.debug('TALK [callListResponse]: create connection with ', peer);
          this.peerManager.createPeerConnection(peer, (peerId) => {
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

    this.streams?.ensureRemote?.(publicKey);
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
        this.peerManager.removePeerConnection(peer);
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
    this.peerManager.removePeerConnection(peer);
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
            this.peerManager.createPeerConnection(peer, (peerId) => {
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
          void this.peerManager?.setCameraSenderBitrate?.(peerId, share);
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
      void this.peerManager?.setScreenSenderBitrate?.(peerId, maxBitrate);
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

  readSwarmcastRoute() {
    if (typeof window === 'undefined') return null;
    const parts = window.location.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'videocall' || parts[1] !== 'swarmcast' || !parts[2]) return null;
    const params = new URLSearchParams(window.location.search);
    return {
      publicationId: decodeURIComponent(parts[2]),
      broadcaster: params.get('broadcaster') || '',
      callId: params.get('call_id') || ''
    };
  }

  async sendSwarmcast(publicKey, request, data = {}) {
    const tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(publicKey);
    tx.msg = {
      module: 'Videocall',
      request,
      call_id: data.callId || this.broadcast?.callId || this.swarmcastRoute?.callId || this.room_obj?.call_id,
      data
    };
    await tx.sign();
    if (this.peerManager && this.peerManager.hasConnectionWithPeer(publicKey)) {
      this.peerManager.sendTransaction(publicKey, tx);
    } else {
      this.app.connection.emit('relay-transaction', tx);
    }
  }

  async toggleBroadcast() {
    if (this.broadcast) {
      this.stopBroadcast();
      siteMessage('Broadcast stopped', 1500);
      return;
    }
    await this.startBroadcast();
  }

  async startBroadcast() {
    if (this.broadcast || this.broadcastStarting) return;
    this.broadcastStarting = true;
    try {
      await this.openBroadcast();
    } finally {
      this.broadcastStarting = false;
    }
  }

  async openBroadcast() {
    if (!this.room_obj?.call_id || !this.streams?.active) {
      siteMessage('Join a call before broadcasting', 2000);
      return;
    }
    const local = this.streams.find({ kind: 'camera', origin: 'local', session: 'call' });
    if (!local?.mediaStream) {
      siteMessage('Turn on your camera before broadcasting', 2000);
      return;
    }
    const bytes = new Uint8Array(9);
    crypto.getRandomValues(bytes);
    const id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    this.broadcast = new SwarmcastPublication({
      id,
      callId: this.room_obj.call_id,
      broadcaster: this.publicKey
    });
    this.setBroadcasting(true);
    this.listenForBroadcastChanges();
    this.publishCallCameras();
    const url =
      `${window.location.origin}/videocall/swarmcast/${id}` +
      `?broadcaster=${encodeURIComponent(this.publicKey)}` +
      `&call_id=${encodeURIComponent(this.room_obj.call_id)}`;
    try {
      const link = await this.createShortLink(url);
      await navigator.clipboard.writeText(link);
      siteMessage('Broadcast link copied to clipboard', 1500);
    } catch (err) {
      console.error(err);
      siteMessage(url, 4000);
    }
    if (this.broadcast) this.bindBroadcastSources();
  }

  publishCallCameras() {
    const cameras = this.streams?.list({ kind: 'camera', session: 'call' }) || [];
    for (const entry of cameras) this.noteBroadcastCamera(entry);
  }

  listenForBroadcastChanges() {
    this._onBroadcastSignaling = (peerId, state) => {
      if (state !== 'stable') return;
      this.publishTrackMap(peerId);
    };
    this._onBroadcastStream = (entry) => this.noteBroadcastCamera(entry);
    this._onBroadcastStreamRemoved = (entry) => {
      if (!this.broadcast || entry?.kind !== 'camera' || entry.session !== 'call') return;
      const participant = entry.origin === 'local' ? this.publicKey : entry.peerId;
      if (!participant || !this.broadcast.removeParticipant(participant)) return;
      this.pushBroadcast();
    };
    this._onBroadcastChannelClose = (peerId) => {
      const publication = this.broadcast;
      if (!publication?.viewers.has(peerId) && !publication?.receivers?.has(peerId)) return;
      if (this.room_obj?.call_peers?.includes(peerId)) return;
      publication.viewers.delete(peerId);
      publication.receivers?.delete(peerId);
      this.peerManager?.removePeerConnection?.(peerId);
    };
    this._onBroadcastSourceTrack = () => this.syncBroadcastSources();
    this.app.connection.on('stun-signaling-state', this._onBroadcastSignaling);
    this.app.connection.on('stun-data-channel-close', this._onBroadcastChannelClose);
    this.app.connection.on('videocall-stream-added', this._onBroadcastStream);
    this.app.connection.on('videocall-stream-updated', this._onBroadcastStream);
    this.app.connection.on('videocall-stream-removed', this._onBroadcastStreamRemoved);
  }

  syncBroadcastSources() {
    if (!this.broadcast) return;
    for (const input of this.broadcast.inputs) {
      const entry = this.streams?.get?.(input.registryId);
      if (!entry?.mediaStream) continue;
      if (entry.kind === 'camera' && entry.session === 'call') this.noteBroadcastCamera(entry);
    }
  }

  bindBroadcastSources() {
    if (!this._onBroadcastSourceTrack) this._onBroadcastSourceTrack = () => this.syncBroadcastSources();
    const next = new Set();
    for (const input of this.broadcast?.inputs || []) {
      const stream = this.streams?.get?.(input.registryId)?.mediaStream;
      if (stream?.addEventListener) next.add(stream);
    }
    for (const stream of this._broadcastSources || []) {
      if (!next.has(stream)) stream.removeEventListener('addtrack', this._onBroadcastSourceTrack);
    }
    for (const stream of next) {
      if (!this._broadcastSources?.has(stream)) stream.addEventListener('addtrack', this._onBroadcastSourceTrack);
    }
    this._broadcastSources = next;
  }

  clearBroadcastSources() {
    for (const stream of this._broadcastSources || []) {
      stream.removeEventListener?.('addtrack', this._onBroadcastSourceTrack);
    }
    this._broadcastSources = null;
  }

  noteBroadcastCamera(entry) {
    if (!this.broadcast || entry?.kind !== 'camera' || entry.session !== 'call' || !entry.mediaStream) {
      return;
    }
    const tracks = entry.mediaStream.getTracks?.() || [];
    const live = tracks.some(
      (item) => (item.kind === 'audio' || item.kind === 'video') && item.readyState !== 'ended'
    );
    if (!live) return;
    const local = entry.origin === 'local';
    this.broadcast.addCamera({
      registryId: entry.id,
      participant: local ? this.publicKey : entry.peerId,
      label: local ? 'You' : this.app.keychain.returnUsername(entry.peerId)
    });
    this.bindBroadcastSources();
    this.pushBroadcast();
  }

  stopBroadcast() {
    const publication = this.broadcast;
    if (!publication) return;
    this.broadcast = null;
    this.setBroadcasting(false);
    this.clearBroadcastSources();
    const forget = (name, listener) => {
      if (listener) this.app.connection.removeListener?.(name, listener);
    };
    forget('stun-signaling-state', this._onBroadcastSignaling);
    forget('stun-data-channel-close', this._onBroadcastChannelClose);
    forget('videocall-stream-added', this._onBroadcastStream);
    forget('videocall-stream-updated', this._onBroadcastStream);
    forget('videocall-stream-removed', this._onBroadcastStreamRemoved);
    this._onBroadcastSignaling = null;
    const peers = new Set([
      ...publication.viewers.keys(),
      ...(publication.receivers || [])
    ]);
    for (const peerId of peers) {
      this.sendSwarmcast(peerId, 'video-call-swarmcast-ended', {
        publicationId: publication.id,
        callId: publication.callId
      })
        .catch((err) => console.error(err))
        .finally(() => {
          if (!this.room_obj?.call_peers?.includes(peerId)) {
            this.peerManager?.removePeerConnection?.(peerId);
          }
        });
    }
    publication.viewers.clear();
    publication.receivers?.clear();
  }

  setBroadcasting(active) {
    const control = typeof document !== 'undefined' && document.getElementById(this.broadcastControlId);
    if (!control) return;
    const label = control.querySelector('label');
    const icon = control.querySelector('i');
    control.classList.toggle('recording', active);
    icon?.classList.toggle('recording', active);
    control.title = active ? 'Stop broadcasting' : 'Broadcast this call';
    if (label) label.innerText = active ? 'Stop' : 'Broadcast';
  }

  watchBroadcastNegotiation(peerId, pc) {
    if (!pc || pc.swarmcastNegotiationWatched || typeof pc.addEventListener !== 'function') return;
    pc.swarmcastNegotiationWatched = true;
    pc.addEventListener('negotiationneeded', () => {
      const kinds =
        typeof pc.getSenders === 'function'
          ? pc.getSenders()
              .map((sender) => sender.track?.kind)
              .filter(Boolean)
              .join(',')
          : '';
      console.info(
        'SWARMCAST MEDIA TRACE',
        'negotiationneeded',
        peerId,
        'signaling',
        pc.signalingState,
        'tracks',
        kinds || 'none'
      );
    });
  }

  pushBroadcast() {
    if (!this.broadcast) return;
    for (const [peerId, viewer] of this.broadcast.viewers) {
      const pc = this.peerManager?.peers?.get(peerId);
      const outputIds = this.broadcast.outputs.map((output) => output.id).join(',');
      console.info(
        'SWARMCAST MEDIA TRACE',
        'pushBroadcast',
        peerId,
        'outputs',
        outputIds || 'none',
        'peer',
        pc ? 'yes' : 'no'
      );
      if (!pc) continue;
      this.watchBroadcastNegotiation(peerId, pc);
      syncSenders(pc, viewer.senders, this.broadcast.outputs, (output) =>
        this.broadcast.streamFor(output, this.streams)
      );
      this.publishTrackMap(peerId);
    }
  }

  publishTrackMap(peerId) {
    const viewer = this.broadcast?.viewers.get(peerId);
    const pc = this.peerManager?.peers?.get(peerId);
    if (!viewer || !pc) {
      console.info(
        'SWARMCAST MEDIA TRACE',
        'tracks withheld',
        peerId,
        !viewer ? 'no viewer' : 'no peer connection'
      );
      return;
    }
    if (pc.signalingState !== 'stable') {
      console.info('SWARMCAST MEDIA TRACE', 'tracks withheld', peerId, 'signaling', pc.signalingState);
      return;
    }
    const outputs = trackMap(viewer.senders, pc);
    if (!outputs) {
      console.info(
        'SWARMCAST MEDIA TRACE',
        'tracks withheld',
        peerId,
        'mids not ready',
        'senders',
        viewer.senders.length
      );
      return;
    }
    const data = {
      publicationId: this.broadcast.id,
      callId: this.broadcast.callId,
      publication: this.broadcast.document(),
      outputs
    };
    const encoded = JSON.stringify(data);
    if (viewer.lastMap === encoded) {
      console.info('SWARMCAST MEDIA TRACE', 'tracks withheld', peerId, 'unchanged');
      return;
    }
    const mids = outputs
      .map((output) => `${output.id}:${(output.mids || []).map((item) => item.mid).join('+')}`)
      .join(',');
    console.info('SWARMCAST MEDIA TRACE', 'tracks sent', peerId, 'outputs', outputs.length, 'mids', mids);
    viewer.lastMap = encoded;
    this.sendSwarmcast(peerId, 'video-call-swarmcast-tracks', data).catch((err) => {
      console.error(err);
      if (viewer.lastMap === encoded) viewer.lastMap = '';
    });
  }

  async handleSwarmcastMessage(tx, txmsg) {
    const from = tx.from[0].publicKey;
    const data = txmsg.data || {};
    if (txmsg.request === 'video-call-swarmcast-join-request') {
      await this.answerBroadcastJoin(from, data);
      return;
    }
    if (txmsg.request === 'video-call-swarmcast-join-response') {
      this.swarmcastView?.receiveJoin(data);
      return;
    }
    if (txmsg.request === 'video-call-swarmcast-subscribe') {
      const requested = Array.isArray(data.outputIds) ? data.outputIds.join(',') : '';
      console.info(
        'SWARMCAST MEDIA TRACE',
        'subscribe received',
        from,
        'publication',
        data.publicationId || '',
        'outputs',
        requested
      );
      this.acceptBroadcastSubscribe(from, data);
      return;
    }
    if (txmsg.request === 'video-call-swarmcast-tracks') {
      this.swarmcastView?.receiveTracks(data);
      return;
    }
    if (txmsg.request === 'video-call-swarmcast-ended') {
      this.swarmcastView?.receiveEnded(data);
    }
  }

  async answerBroadcastJoin(from, data) {
    const live = this.broadcast && data.publicationId === this.broadcast.id;
    const inCall = !!this.room_obj?.call_peers?.includes(from);
    if (live && !inCall && !this.peerManager?.peers?.get(from)) {
      const created = this.peerManager.createPeerConnection(from, false, true);
      if (created !== 0) this.broadcast.receivers.add(from);
    }
    const foreignPeer = !!(
      this.peerManager?.peers?.get(from) && !this.broadcast?.receivers?.has(from)
    );
    const occupied = !!(live && (inCall || foreignPeer));
    await this.sendSwarmcast(from, 'video-call-swarmcast-join-response', {
      publicationId: data.publicationId,
      callId: data.callId || this.broadcast?.callId,
      contact: this.publicKey,
      state: live && !occupied ? 'ready' : 'unavailable',
      reason: occupied ? 'existing-call-connection' : '',
      publication: live && !occupied ? this.broadcast.document() : null
    });
  }

  acceptBroadcastSubscribe(from, data) {
    const requested = Array.isArray(data.outputIds) ? data.outputIds.length : 0;
    if (!this.broadcast || data.publicationId !== this.broadcast.id) {
      console.info('SWARMCAST MEDIA TRACE', 'acceptBroadcastSubscribe', from, 'requested', requested, 'viewer', 'rejected');
      return;
    }
    if (this.room_obj?.call_peers?.includes(from)) {
      console.info('SWARMCAST MEDIA TRACE', 'acceptBroadcastSubscribe', from, 'requested', requested, 'viewer', 'call participant');
      return;
    }
    const pc = this.peerManager?.peers?.get(from);
    if (!pc) {
      console.info('SWARMCAST MEDIA TRACE', 'acceptBroadcastSubscribe', from, 'requested', requested, 'viewer', 'no peer connection');
      return;
    }
    let viewer = this.broadcast.viewers.get(from);
    const added = !viewer;
    if (!viewer) {
      viewer = { senders: [], lastMap: '' };
      this.broadcast.viewers.set(from, viewer);
    }
    console.info(
      'SWARMCAST MEDIA TRACE',
      'acceptBroadcastSubscribe',
      from,
      'requested',
      requested,
      'viewer',
      added ? 'added' : 'existing'
    );
    this.watchBroadcastNegotiation(from, pc);
    syncSenders(pc, viewer.senders, this.broadcast.outputs, (output) =>
      this.broadcast.streamFor(output, this.streams)
    );
    this.publishTrackMap(from);
  }

  webServer(app, expressapp, express) {
    let webdir = `${__dirname}/../../mods/${this.dirname}/web`;
    let mod_self = this;

    const servePage = async function (req, res) {
      let reqBaseURL = req.protocol + '://' + req.headers.host + '/';
      mod_self.social.url = reqBaseURL + encodeURI(mod_self.returnSlug());
      if (!res.finished) {
        res.setHeader('Content-type', 'text/html');
        res.charset = 'UTF-8';
        return res.send(HomePage(app, mod_self, app.build_number, mod_self.social));
      }
      return;
    };

    expressapp.get('/' + encodeURI(this.returnSlug()), servePage);
    expressapp.get('/' + encodeURI(this.returnSlug()) + '/swarmcast/:publicationId', servePage);
    expressapp.use('/' + encodeURI(this.returnSlug()), express.static(webdir));
  }
}

module.exports = Videocall;
