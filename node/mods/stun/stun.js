const Transaction = require('../../lib/saito/transaction').default;
const ModTemplate = require('../../lib/templates/modtemplate');
const PeerService = require('saito-js/lib/peer_service').default;

// Negotiation watchdog. Progress resets the deadline; it does not cancel it.
const WATCH_SIGNAL_MS = 15000;
const WATCH_CHECK_MS = 30000;
const WATCH_CHANNEL_MS = 10000;

/***
 *  A generic utility for creating stun connections that other modules can use
 *  API is a combination of respondTo and event space
 *
 * Will emit (with publicKey of peer):
 *  'stun-new-peer-connection'
 *
 * 	'stun-connection-connected' --- when you have created the basic stun connection (for media streaming)
 *  'stun-connection-failed'
 *  'stun-data-channel-open'
 *  'stun-data-channel-close'
 *  'stun-update-connection-message'
 *
 *  'stun-track-event'
 *
 * 	Your modules can set a listener for these and process accordingly
 */

class Stun extends ModTemplate {
  constructor(app) {
    super(app);
    this.app = app;
    this.name = 'Stun';
    this.slug = 'stun';
    this.description = 'P2P Connection Module';
    this.categories = 'Utilities Communications';
    this.class = 'utility';
    this.status = 'prod';
    this.servers = [
      {
        urls: 'turn:stun-sf.saito.io:3478',
        username: 'guest',
        credential: 'somepassword'
      },
      {
        urls: 'turn:stun-sg.saito.io:3478',
        username: 'guest',
        credential: 'somepassword'
      },
      {
        urls: 'turn:stun-de.saito.io:3478',
        username: 'guest',
        credential: 'somepassword'
      }

      // Firefox gives a warning if you provide more than two servers and
      // throws an error if you use 5 or more.
      // is it redundant to have both turn and stun on the same server, since
      //
      // " TURN (Traversal Using Relay NAT) is the more advanced solution that incorporates
      // the STUN protocols and most commercial WebRTC based services use a TURN server
      // for establishing connections between peers. "

      /*{
        urls: "stun:stun-sf.saito.io:3478",
      },
      {
        urls: "stun:stun-sg.saito.io:3478",
      },
      {
        urls: "stun:stun-de.saito.io:3478",
      },*/
    ];

    this.peers = new Map();
    // SDP and ICE can arrive before peer-joined has created the RTCPeerConnection.
    this.earlySignals = new Map();

    this.noloop = []; // array of failed/timedout peer publickeys, so we don't repeat ad infinitum

    // app.connection.on("stun-data-channel-open", async (publicKey) => {

    // 	 await this.app.network.addStunPeer(publicKey, this.peers.get(publicKey))

    // });

    app.connection.on('stun-connection-connected', (publicKey) => {
      //await this.app.network.addStunPeer(publicKey, this.peers.get(publicKey))
      siteMessage(`Opened stun connection with ${app.keychain.returnUsername(publicKey)}`, 2000);
    });

    app.connection.on('stun-data-channel-close', (publicKey) => {
      siteMessage(`Closed stun connection with ${app.keychain.returnUsername(publicKey)}`, 2000);
    });

    app.connection.on('stun-connection-failed', async (peerId, callback) => {
      let c = await sconfirm(
        `STUN: connection failed -- ${app.keychain.returnUsername(peerId)}. Keep trying?`
      );
      if (c) {
        this.createPeerConnection(peerId, callback);
      } else {
        // Notify the module UI that we have given up connecting
        app.connection.emit('stun-connection-close', peerId);
        console.error('STUN: failed connections-- ', this.noloop);
      }
    });

    app.connection.on('stun-connection-timeout', async (peerId, delay, callback) => {
      console.warn('STUN: connection timeout', peerId);
      let peerConnection = this.peers.get(peerId);
      let c = null;
      if (peerConnection) {
        // Quietly give up — do not prompt the user on timeout.
        // c = await sconfirm(
        //   `STUN: connection timed out -- ${app.keychain.returnUsername(peerId)} might not be online. Keep waiting?`
        // );
      }
      if (c) {
        this.createPeerConnection(peerId, callback);
        delay *= 2;
        peerConnection.timer = setTimeout(() => {
          if (!this.hasConnectionWithPeer(peerId)) {
            app.connection.emit('stun-connection-timeout', peerId, delay, callback);
          } else {
            console.warn('Stun: peerConnection timer expired but we have a connection...');
          }
        }, delay);
      } else {
        // Notify the module UI that we have given up connecting
        app.connection.emit('stun-connection-close', peerId);
        console.error('STUN: failed connections-- ', this.noloop);
      }
    });
  }

  respondTo(type, obj) {
    let stun_self = this;

    if (type === 'peer-manager') {
      return {
        hasConnection: (peerId, any_status = false) => {
          if (any_status) {
            if (this.peers.has(peerId)) {
              let pc = this.peers.get(peerId);
              if (pc.connectionState == 'failed' || pc.connectionState == 'disconnected') {
                return false;
              }
              return true;
            }
          } else {
            return this.hasConnection(peerId);
          }
          return false;
        },
        hasConnectionWithPeer: (peerId) => this.hasConnectionWithPeer(peerId),
        sendJoinTransaction: (peerId) => this.sendJoinTransaction(peerId),
        sendTransaction: (peerId, tx) => {
          this.sendTransaction(peerId, tx);
        },

        // For the API, it isn't enough for one party to create a peer connection, so if you don't
        // provide a callback, it uses the sendJoinTransaction to message your peer and have them
        // create a peer connection on their end, it is akin to texting your friend to say call me.
        // This is good for most data channel set ups, but if you need more control over who messages
        // who when you can get around this by setting the callback deliberately to false. (i.e. my friend
        // has texted me and it is on me to call them)
        createPeerConnection: (peerId, callback = null, answerOnly = false) => {
          //
          // send ready message to peer, so if they want to create the channel, we are receptive
          //
          if (callback == null) {
            console.debug('STUN API: Create dummy callback for joinTransaction');
            callback = (peerId) => {
              this.sendJoinTransaction(peerId);
            };
          } else if (!callback) {
            console.debug(
              'STUN API: We are intentionally not setting a callback in the stun connection API'
            );
          }

          if (Array.isArray(peerId)) {
            peerId.forEach((peer) => this.createPeerConnection(peer, callback, answerOnly));
          } else {
            this.createPeerConnection(peerId, callback, answerOnly);
          }
        },
        removePeerConnection: (peerId) => {
          this.removePeerConnection(peerId);
        },
        peers: this.peers
      };
    }

    // Temporarily disabled — Upgrade / Downgrade Connection user-menu entries.
    // if (type === 'user-menu') {
    //   if (!obj?.publicKey || obj.publicKey == this.publicKey) {
    //     return null;
    //   }
    //
    //   if (!this.hasConnectionWithPeer(obj.publicKey)) {
    //     return {
    //       text: 'Upgrade Connection',
    //       icon: 'fa-solid fa-bolt-lightning',
    //       callback: function (app, public_key) {
    //         stun_self.createPeerConnection(public_key, () => {
    //           stun_self.sendJoinTransaction(public_key);
    //         });
    //       }
    //     };
    //   } else {
    //     return {
    //       text: 'Downgrade Connection',
    //       icon: 'fa-solid fa-shield-cat',
    //       callback: async function (app, public_key) {
    //         let newtx = await app.wallet.createUnsignedTransactionWithDefaultFee(public_key);
    //
    //         newtx.msg = {
    //           module: 'Stun',
    //           request: 'peer-left'
    //         };
    //
    //         await newtx.sign();
    //
    //         app.connection.emit('relay-transaction', newtx);
    //
    //         setTimeout(() => {
    //           stun_self.removePeerConnection(public_key);
    //         }, 500);
    //       }
    //     };
    //   }
    // }

    return null;
  }

  // Dummy functions for testing stun-data-channel upgrade to PEER object
  returnServices() {
    let services = [];
    if (this.app.BROWSER == 1) {
      services.push(new PeerService(null, 'stun-test'));
    }
    return services;
  }

  async onPeerServiceUp(app, peer, service = {}) {
    if (service.service === 'stun-test') {
      if (this.hasConnection(peer.publicKey)) {
        console.info('STUN PEER UPGRADE SUCCESS!!!! ' + peer.publicKey);
        app.keychain.addKey(peer.publicKey, { lastUpdate: Date.now() });
      }
    }
  }

  hasConnection(peerId) {
    if (Array.isArray(peerId)) {
      if (peerId.length == 0) {
        return false;
      }
      let answer = true;
      for (let peer of peerId) {
        if (!this.hasConnectionWithPeer(peer)) {
          return false;
        }
      }
      return answer;
    } else {
      return this.hasConnectionWithPeer(peerId);
    }
  }

  hasConnectionWithPeer(peerId) {
    let peerConnection = this.peers.get(peerId);
    if (peerConnection) {
      if (peerConnection?.dc) {
        if (peerConnection.connectionState == 'connected') {
          if (peerConnection.dc.readyState == 'open') {
            return true;
          }
        }
      }
    }

    return false;
  }

  watchdogDelay(peerConnection) {
    const ice = peerConnection.iceConnectionState;
    if (
      ice === 'connected' ||
      ice === 'completed' ||
      peerConnection.connectionState === 'connected'
    ) {
      return WATCH_CHANNEL_MS;
    }
    if (ice === 'checking') return WATCH_CHECK_MS;
    return WATCH_SIGNAL_MS;
  }

  armNegotiationWatchdog(peerId, peerConnection) {
    if (!peerConnection || peerConnection.watchdogArmed) return;
    if (peerConnection.signalingState === 'closed') return;
    if (this.hasConnectionWithPeer(peerId)) return;
    if (
      peerConnection.connectionState === 'failed' ||
      peerConnection.connectionState === 'disconnected' ||
      peerConnection.iceConnectionState === 'failed' ||
      peerConnection.iceConnectionState === 'disconnected'
    ) {
      return;
    }
    peerConnection.watchdogArmed = true;
    peerConnection.watchSignaling = peerConnection.signalingState;
    peerConnection.watchIce = peerConnection.iceConnectionState;
    this.scheduleWatchdog(peerId, peerConnection, 'arm');
  }

  scheduleWatchdog(peerId, peerConnection, reason) {
    peerConnection.watchdogGeneration = (peerConnection.watchdogGeneration || 0) + 1;
    const generation = peerConnection.watchdogGeneration;
    const delay = this.watchdogDelay(peerConnection);
    clearTimeout(peerConnection.watchdog);
    peerConnection.watchdog = setTimeout(() => {
      this.expireNegotiationWatchdog(peerId, peerConnection, generation);
    }, delay);
    peerConnection.watchdog.unref?.();
    console.info(
      'STUN TRACE watchdog',
      reason,
      peerId,
      'generation',
      generation,
      'delay',
      delay,
      'signaling',
      peerConnection.signalingState,
      'ice',
      peerConnection.iceConnectionState,
      'connection',
      peerConnection.connectionState
    );
  }

  cancelNegotiationWatchdog(peerConnection, reason = '') {
    if (!peerConnection) return;
    clearTimeout(peerConnection.watchdog);
    peerConnection.watchdog = null;
    peerConnection.watchdogArmed = false;
    peerConnection.watchdogGeneration = (peerConnection.watchdogGeneration || 0) + 1;
    console.info(
      'STUN TRACE watchdog cancel',
      reason,
      'generation',
      peerConnection.watchdogGeneration,
      'signaling',
      peerConnection.signalingState,
      'ice',
      peerConnection.iceConnectionState,
      'connection',
      peerConnection.connectionState
    );
  }

  noteWatchdogProgress(peerId, peerConnection, kind, value) {
    if (!peerConnection?.watchdogArmed) return;
    if (this.peers.get(peerId) !== peerConnection) return;
    if (peerConnection.signalingState === 'closed') return;
    if (this.hasConnectionWithPeer(peerId)) {
      this.cancelNegotiationWatchdog(peerConnection, 'connection open');
      return;
    }
    const previous = kind === 'signaling' ? peerConnection.watchSignaling : peerConnection.watchIce;
    if (previous === value) return;
    if (kind === 'signaling') peerConnection.watchSignaling = value;
    else peerConnection.watchIce = value;
    if (
      peerConnection.connectionState === 'failed' ||
      peerConnection.connectionState === 'disconnected' ||
      value === 'failed' ||
      value === 'disconnected'
    ) {
      this.cancelNegotiationWatchdog(peerConnection, 'failed or disconnected');
      return;
    }
    const progressed =
      (kind === 'signaling' &&
        (value === 'have-local-offer' || value === 'have-remote-offer' || value === 'stable')) ||
      (kind === 'ice' && (value === 'checking' || value === 'connected' || value === 'completed'));
    if (!progressed) return;
    this.scheduleWatchdog(peerId, peerConnection, `reset ${kind} ${value}`);
  }

  expireNegotiationWatchdog(peerId, peerConnection, generation) {
    if (this.peers.get(peerId) !== peerConnection) return;
    if (peerConnection.watchdogGeneration !== generation) return;
    if (peerConnection.signalingState === 'closed') return;
    if (this.hasConnectionWithPeer(peerId)) {
      this.cancelNegotiationWatchdog(peerConnection, 'connected before expiry');
      return;
    }
    peerConnection.watchdogArmed = false;
    peerConnection.watchdog = null;
    this.diagnostic(peerId, 'Negotiation watchdog expired');
    console.warn(
      'STUN TRACE watchdog expired',
      peerId,
      'generation',
      generation,
      'signaling',
      peerConnection.signalingState,
      'ice',
      peerConnection.iceConnectionState,
      'connection',
      peerConnection.connectionState
    );
    this.app.connection.emit('stun-connection-close', peerId);
  }

  sendTransaction(peerId, tx) {
    if (!this.hasConnectionWithPeer(peerId)) {
      console.warn('Stun: cannot send transaction over stun');
      return;
    }

    try {
      let peerConnection = this.peers.get(peerId);
      peerConnection.dc.send(tx.serialize_to_web(this.app));
    } catch (err) {
      console.error('Stun sendTransaction ERROR:', err);
    }
  }

  async onConfirmation(blk, tx, conf) {
    if (tx == null) {
      return;
    }

    let message = tx.returnMessage();

    if (Number(conf) == 0) {
      if (message.module === 'Stun') {
        if (this.app.BROWSER === 1) {
          if (tx.isTo(this.publicKey) && !tx.isFrom(this.publicKey)) {
            if (this.hasSeenTransaction(tx, blk)) return;
            await this.handleSignalingMessage(tx.from[0].publicKey, message.request, message);
          }

          if (message.request == 'peer-joined') {
            if (tx.isFrom(this.publicKey)) {
              console.log('STUN: onConfirmation', message);
              let peerId = tx.to[0].publicKey;
              let peerConnection = this.peers.get(peerId);
              if (peerConnection && !this.hasConnectionWithPeer(peerId)) {
                console.log(
                  'STUN: arming negotiation watchdog after peer-joined confirmation'
                );
                this.armNegotiationWatchdog(peerId, peerConnection);
              }
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

    if (txmsg.module !== this.name) {
      return;
    }

    if (this.app.BROWSER === 1) {
      if (tx.isTo(this.publicKey) && !tx.isFrom(this.publicKey)) {
        if (this.hasSeenTransaction(tx)) return;

        await this.handleSignalingMessage(tx.from[0].publicKey, txmsg.request, txmsg);
      }
    }

    return super.handlePeerTransaction(app, tx, peer, mycallback);
  }

  // Observational local event for call diagnostics; no wire payloads are retained.
  diagnostic(peer, message) {
    this.app?.connection.emit('stun-diagnostic', peer, message);
  }

  async handleSignalingMessage(sender, request, data) {
    if (
      request === 'peer-joined' ||
      request === 'peer-left' ||
      request === 'peer-kicked' ||
      request === 'peer-description'
    ) {
      console.info(
        'STUN TRACE signal',
        request,
        data?.description?.type || '',
        'from',
        sender,
        'connection',
        this.peers.get(sender)?.connectionState || 'none',
        'signaling',
        this.peers.get(sender)?.signalingState || 'none'
      );
    }
    this.diagnostic(sender, `Received ${request}${data.description?.type ? ` (${data.description.type})` : ''}`);
    //
    // Stun metadata messages
    //
    if (request == 'peer-joined') {
      console.debug('Stun: Peer joined (requested a connection)');
      this.createPeerConnection(sender);
      return;
    }

    if (request == 'peer-left') {
      console.debug('Stun: Peer left (close the connection)');
      this.removePeerConnection(sender);
      return;
    }
    if (request == 'peer-kicked') {
      console.debug('Stun: Peer kicked out (close the connection)');
      this.removePeerConnection(sender);
      return;
    }

    let peerConnection = this.peers.get(sender);

    if (!peerConnection) {
      if (request === 'peer-description' || request === 'peer-candidate') {
        const queued = this.earlySignals.get(sender) || [];
        if (queued.length < 64) {
          queued.push({ request, data });
          this.earlySignals.set(sender, queued);
        }
        this.diagnostic(sender, `Queued ${request} until the peer connection exists`);
        console.info(
          'STUN TRACE queued',
          request,
          data?.description?.type || '',
          'from',
          sender,
          'queued',
          queued.length
        );
        return;
      }
      this.diagnostic(sender, 'Signal ignored: no peer connection');
      console.warn(
        `Stun: Receiving signalling messages for a non-peer connection [${sender}], peers: `,
        this.peers.keys()
      );
      return;
    }

    if (request === 'peer-description' || request === 'peer-candidate') {
      return this.chainPeer(peerConnection, () => this.applySignal(sender, request, data, peerConnection));
    }

    console.warn('Unknown Stun Peer Transaction!', data);
  }

  // One tail per peer connection. A task must not await chainPeer for its own pc.
  chainPeer(peerConnection, task) {
    const previous = peerConnection.signalChain || Promise.resolve();
    const run = previous.then(() => task(), () => task());
    peerConnection.signalChain = run.then(() => {}, () => {});
    return run;
  }

  async applySignal(sender, request, data, peerConnection) {
    if (this.peers.get(sender) !== peerConnection || peerConnection.signalingState === 'closed') {
      return;
    }

    if (request === 'peer-description') {
      await this.applyDescription(sender, data.description, peerConnection);
      return;
    }

    if (request === 'peer-candidate') {
      await this.receiveCandidate(sender, peerConnection, data.iceCandidate);
    }
  }

  async applyDescription(sender, description, peerConnection) {
    try {
      const offerCollision = description.type === 'offer' &&
        (peerConnection.makingOffer || peerConnection.signalingState !== 'stable');
      peerConnection.ignoreOffer = !!(offerCollision && peerConnection.rude);

      if (peerConnection.ignoreOffer) {
        this.noteIgnoredOffer(peerConnection, description);
        this.diagnostic(sender, `Ignored colliding offer (impolite peer) ufrag=${iceUfrag(description) || 'none'}`);
        console.info('STUN TRACE ignored offer', description?.type, 'from', sender);
        console.debug('STUN: Impolite peer ignores offer collision');
        return;
      }

      if (description.type === 'offer') {
        // An incoming offer can satisfy the deferred negotiation. The browser
        // will emit negotiationneeded again if local changes remain after the answer.
        clearTimeout(peerConnection.offerTimer);
        peerConnection.offerTimer = null;
      }

      if (offerCollision) {
        try {
          await peerConnection.setLocalDescription({ type: 'rollback' });
          this.diagnostic(sender, 'Rolled back local offer');
        } catch (err) {
          this.diagnostic(sender, `Rollback skipped: ${err.name} signaling=${peerConnection.signalingState}`);
          console.debug('STUN: rollback skipped', err);
        }
      }

      console.info(
        'STUN TRACE setRemoteDescription start',
        description?.type,
        'from',
        sender,
        'signaling',
        peerConnection.signalingState
      );
      await peerConnection.setRemoteDescription(description);
      console.info(
        'STUN TRACE setRemoteDescription done',
        description?.type,
        'from',
        sender,
        'signaling',
        peerConnection.signalingState
      );
      this.diagnostic(sender, `Applied remote ${description.type}`);
      // The ignored-ufrag set stays for the life of this connection.
      peerConnection.ignoreOffer = false;
      await this.drainCandidates(sender, peerConnection);

      if (description.type === 'offer') {
        await peerConnection.setLocalDescription();
        if (this.peers.get(sender) !== peerConnection || peerConnection.signalingState === 'closed') return;
        const answer = peerConnection.localDescription;
        if (answer?.type === 'answer') {
          console.info('STUN TRACE answer created', sender, 'signaling', peerConnection.signalingState);
          await this.sendPeerDescriptionTransaction(sender, answer);
        }
      }
    } catch (err) {
      const staleOffer = description?.type === 'offer'
        && peerConnection.remoteDescription
        && (err?.name === 'InvalidAccessError' || err?.name === 'InvalidSessionDescriptionError');
      if (staleOffer && !peerConnection.replaced) {
        const pending = peerConnection.pendingCandidates || [];
        this.diagnostic(sender, `Replacing peer connection after ${err.name}`);
        this.removePeerConnection(sender);
        this.createPeerConnection(sender, false);
        const fresh = this.peers.get(sender);
        if (fresh && fresh !== peerConnection) {
          fresh.pendingCandidates = pending;
          fresh.replaced = true;
          await this.applyDescription(sender, description, fresh);
          return;
        }
      }
      this.diagnostic(sender, `Apply description failed: ${err.name}`);
      console.error(
        'STUN TRACE apply description failed',
        description?.type,
        'from',
        sender,
        err?.name || err
      );
      console.error('STUN: failure in peer-offer --- ', err);
      console.debug(
        'STUN: impolite? ',
        peerConnection.rude,
        'signalingState: ',
        peerConnection.signalingState,
        'makingOffer: ',
        peerConnection.makingOffer,
        'description type: ',
        description?.type
      );
    }
  }

  noteIgnoredOffer(peerConnection, description) {
    const ufrag = iceUfrag(description);
    const current = iceUfrag(peerConnection.remoteDescription);
    if (!peerConnection.ignoredOfferUfrags) peerConnection.ignoredOfferUfrags = new Set();
    if (ufrag && ufrag !== current) {
      peerConnection.ignoredOfferUfrags.add(ufrag);
      peerConnection.pendingCandidates = (peerConnection.pendingCandidates || []).filter((candidate) => {
        return candidateFragment(candidate) !== ufrag;
      });
    }
    // Nothing has been accepted yet, so the queue can only belong to the offer we refused.
    if (!peerConnection.remoteDescription) {
      peerConnection.pendingCandidates = [];
    }
  }

  async receiveCandidate(sender, peerConnection, candidate) {
    const fragment = candidateFragment(candidate);
    if (fragment && peerConnection.ignoredOfferUfrags?.has(fragment)) {
      this.diagnostic(sender, `Discarded ICE candidate for ignored ufrag ${fragment}`);
      return;
    }

    const remoteUfrag = iceUfrag(peerConnection.remoteDescription);
    if (!fragment && peerConnection.ignoreOffer) {
      this.queueCandidate(sender, peerConnection, candidate, 'during ignored offer');
      return;
    }
    if (!peerConnection.remoteDescription || (fragment && fragment !== remoteUfrag)) {
      this.queueCandidate(sender, peerConnection, candidate, 'until matching SDP arrives');
      return;
    }
    await this.addIceCandidate(sender, peerConnection, candidate);
  }

  queueCandidate(sender, peerConnection, candidate, reason) {
    peerConnection.pendingCandidates ??= [];
    peerConnection.pendingCandidates.push(candidate);
    this.diagnostic(sender, `Queued remote ICE candidate ${reason}`);
  }

  async drainCandidates(sender, peerConnection) {
    const remoteUfrag = iceUfrag(peerConnection.remoteDescription);
    const pending = peerConnection.pendingCandidates || [];
    const keep = [];
    peerConnection.pendingCandidates = [];
    for (const candidate of pending) {
      const fragment = candidateFragment(candidate);
      if (fragment && peerConnection.ignoredOfferUfrags?.has(fragment)) continue;
      if (!fragment || (remoteUfrag && fragment === remoteUfrag)) {
        await this.addIceCandidate(sender, peerConnection, candidate);
      } else {
        keep.push(candidate);
      }
    }
    if (keep.length) peerConnection.pendingCandidates = keep;
  }

  async addIceCandidate(peerId, peerConnection, candidate) {
    const fragment = candidateFragment(candidate);
    const remoteType = peerConnection.remoteDescription?.type || 'none';
    try {
      await peerConnection.addIceCandidate(candidate);
      this.diagnostic(peerId, 'Applied remote ICE candidate');
    } catch (err) {
      this.diagnostic(
        peerId,
        `ICE candidate rejected: ${err.name} signaling=${peerConnection.signalingState} remote=${remoteType} ufrag=${fragment || 'none'}`
      );
      if (!peerConnection.ignoreOffer) {
        console.error(
          `STUN: Error adding remote candidate for ${peerId}: ${err.name} signaling=${peerConnection.signalingState} remote=${remoteType} ufrag=${fragment || 'none'}`
        );
      }
    }
  }

  //
  // We treat all data channel messages a peer request / peer transaction
  //
  handleDataChannelMessage(data, peerId) {
    let relayed_tx = new Transaction();
    relayed_tx.deserialize_from_web(this.app, data);

    this.app.modules.handlePeerTransaction(relayed_tx);
  }

  async sendJoinTransaction(peer) {
    this.diagnostic(peer, 'Submitting peer-joined');
    try {
      let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(peer);

      newtx.msg = {
        module: 'Stun',
        request: 'peer-joined'
      };

      await newtx.sign();

      this.app.connection.emit('relay-transaction', newtx);
      this.app.network.propagateTransaction(newtx);
      this.diagnostic(peer, 'Submitted peer-joined to relay / network');
    } catch (error) {
      this.diagnostic(peer, `Failed to submit peer-joined: ${error.name}`);
      throw error;
    }
  }

  async sendPeerDescriptionTransaction(peer, description) {
    this.diagnostic(peer, `Submitting SDP (${description.type})`);
    try {
      let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(peer);

      console.info(
        `STUN: sending offer to ${peer} with peer connection ` + this.peers.get(peer).signalingState,
        description.type
      );

      newtx.msg = {
        module: 'Stun',
        request: 'peer-description',
        description
      };

      await newtx.sign();

      this.app.connection.emit('relay-transaction', newtx);
      this.app.network.propagateTransaction(newtx);
      this.diagnostic(peer, 'Submitted SDP to relay / network');
    } catch (error) {
      this.diagnostic(peer, `Failed to submit SDP: ${error.name}`);
      throw error;
    }
  }

  async sendIceCandidateTransaction(peer, candidate) {
    this.diagnostic(peer, 'Submitting ICE candidate');
    try {
      let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(peer);

      newtx.msg = {
        module: 'Stun',
        request: 'peer-candidate',
        iceCandidate: candidate
      };

      await newtx.sign();

      this.app.connection.emit('relay-transaction', newtx);
      this.app.network.propagateTransaction(newtx);
      this.diagnostic(peer, 'Submitted ICE candidate to relay / network');
    } catch (error) {
      this.diagnostic(peer, `Failed to submit ICE candidate: ${error.name}`);
      throw error;
    }
  }

  restoreConnection(peerId, pathway, callback) {
    this.diagnostic(peerId, 'Attempting connection recovery');
    this.removePeerConnection(peerId);
    if (!this.noloop.includes(peerId)) {
      if (callback) {
        console.info('Attempt STUN reconnection once');
        setTimeout(() => {
          this.createPeerConnection(peerId, callback);
        }, 500);
        this.noloop.push(peerId);
      }
    } else {
      this.diagnostic(peerId, 'Recovery exhausted after two attempts');
      console.warn('STUN reconnection attempt failed after two tries, give up!');
      this.app.connection.emit(pathway, peerId, callback);

      for (let i = 0; i < this.noloop.length; i++) {
        if (this.noloop[i] == peerId) {
          this.noloop.splice(i, 1);
          break;
        }
      }
    }
  }

  createPeerConnection(peerId, callback = null, answerOnly = false) {
    this.diagnostic(peerId, 'Requested peer connection');
    console.info(
      'STUN/TALK: Create Peer Connection with ' + peerId + ` and ${callback ? 'a' : 'no'} callback`,
      this.noloop
    );

    if (peerId === this.publicKey) {
      console.warn('STUN/TALK: Attempting to create a peer Connection with myself!');
      console.trace();
      return 0;
    }

    if (this.peers.get(peerId)) {
      let pc = this.peers.get(peerId);
      this.diagnostic(peerId, `Existing connection: ${pc.connectionState}`);

      console.debug(
        `STUN/TALK: ${peerId} already in stun peer list`,
        'Status: ' + pc.connectionState
      );

      if (pc.timer) {
        console.debug('STUN/TALK: cancelling a timeout for new connection round...');
        //cancel timer if any activity on connectionstate
        clearTimeout(pc.timer);
        delete this.callback;
        delete pc.timer;
      }

      //If not a solid connection state..., delete and try again
      if (pc.connectionState == 'failed' || pc.connectionState == 'disconnected') {
        console.warn('STUN/TALK: old peer has broken connection, reestablish...');
        this.restoreConnection(peerId, 'stun-connection-failed', callback);
        return;
      }
      if (pc.connectionState == 'new' || pc.connectionState == 'connecting') {
        // Reuse negotiation already in progress, but allow a new call to attach
        // media and notify its peer even if this began as a data-only connection.
        this.app.connection.emit('stun-new-peer-connection', peerId, pc);
        if (callback) callback(peerId);
        return;
      }

      if (callback) {
        console.debug('STUN/TALK: run peerConnection callback', callback);
        callback(peerId);
      }

      //
      // Assuming you are properly connected, simulate that the connection just came through,
      // so the mods listeners can pick up and do their UI things
      //
      // Todo: this is a mess, should streamline events in stun,
      // the UI components are a little too indebted to the old idiosyncratic logic
      //
      this.app.connection.emit('stun-new-peer-connection', peerId, pc);

      if (pc.connectionState === 'connected') {
        this.app.connection.emit('stun-connection-connected', peerId);
      } else {
        this.app.connection.emit('stun-update-connection-message', peerId, pc.connectionState);
      }

      if (this.hasConnection(peerId)) {
        this.app.connection.emit('stun-data-channel-open', peerId);
      }

      return;
    } else {
      const pc = new RTCPeerConnection({
        iceServers: this.servers
      });
      pc.answerOnly = !!answerOnly;

      // use string compare of public keys rather than presence or absence of callback
      // to determine who will be impolite in any pairing because we may be simultnaeously attempting
      // to create connections with callbacks for whatever reason
      if (this.publicKey > peerId) {
        console.debug('STUN: I will be impolite to peer: ', peerId);
        pc.rude = true;
      }

      pc.ignoredOfferUfrags = new Set();
      pc.iceRestartCount = 0;
      pc.iceRestartTimer = null;
      this.peers.set(peerId, pc);
      this.diagnostic(peerId, `Created peer connection (${pc.rude ? 'impolite' : 'polite'})`);

      this.app.connection.emit('stun-new-peer-connection', peerId, pc);
    }

    const peerConnection = this.peers.get(peerId);
    // Set when this peer calls restartIce. negotiate() must not drop that offer.
    let iceRestartNeeded = false;

    // Handle ICE candidates
    peerConnection.onicecandidate = async (event) => {
      if (event.candidate) {
        console.debug('STUN: receiving ice candidate for ', peerId /*, event.candidate*/);
        await this.sendIceCandidateTransaction(peerId, event.candidate);
      }
    };

    //Receive Remote media
    peerConnection.addEventListener('track', (event) => {
      this.diagnostic(
        peerId,
        `Received ${event.track.kind} track id=${event.track.id} ready=${event.track.readyState} muted=${event.track.muted} enabled=${event.track.enabled} streams=${event.streams?.length || 0}`
      );
      for (const state of ['mute', 'unmute', 'ended']) {
        event.track.addEventListener(state, () => this.diagnostic(peerId, `${event.track.kind} track: ${state}`));
      }
      console.debug('STUN: new track', peerId, event);
      this.app.connection.emit('stun-track-event', peerId, event);
    });

    peerConnection.onconnectionstatechange = () => {
      this.diagnostic(peerId, `Connection: ${peerConnection.connectionState}`);
      console.info(`STUN: ${peerId} connectionstatechange -- ` + peerConnection.connectionState);

      //cancel timer if any activity on connectionstate
      clearTimeout(peerConnection.timer);
      delete peerConnection.timer;
      delete this.callback;

      if (
        peerConnection.connectionState === 'failed' ||
        peerConnection.connectionState === 'disconnected'
      ) {
        this.cancelNegotiationWatchdog(peerConnection, 'connection failed or disconnected');
        console.debug('STUN: set reconnection timer...');
        let timerAmt = callback ? 9000 : 5000;
        this.diagnostic(peerId, `Waiting ${timerAmt / 1000}s for connection recovery`);
        peerConnection.timer = setTimeout(() => {
          if (
            peerConnection.connectionState === 'failed' ||
            peerConnection.connectionState === 'disconnected'
          ) {
            this.diagnostic(peerId, 'Recovery wait expired; connection still failed/disconnected');
            siteMessage(`Stun connection failed with ${peerId}`);
            console.debug(`STUN: connection not restored after ${timerAmt / 1000} seconds...`);
            //this.restoreConnection(peerId, 'stun-connection-failed', callback);
          } else {
            console.debug(
              `STUN: connection okay ${peerConnection.connectionState} after timer, don't do anything`
            );
          }
        }, timerAmt);
      }
      if (peerConnection.connectionState === 'connected') {
        this.app.connection.emit('stun-connection-connected', peerId);
      }

      this.app.connection.emit(
        'stun-update-connection-message',
        peerId,
        peerConnection.connectionState
      );
    };

    peerConnection.oniceconnectionstatechange = () => {
      this.diagnostic(peerId, `ICE: ${peerConnection.iceConnectionState}`);
      const iceState = peerConnection.iceConnectionState;
      this.noteWatchdogProgress(peerId, peerConnection, 'ice', iceState);
      if (iceState === 'connected' || iceState === 'completed') {
        const recovering = peerConnection.iceRestartTimer != null || peerConnection.iceRestartCount > 0;
        clearTimeout(peerConnection.iceRestartTimer);
        peerConnection.iceRestartTimer = null;
        peerConnection.iceRestartCount = 0;
        if (recovering) this.diagnostic(peerId, 'ICE recovered');
        return;
      }
      if (iceState !== 'failed') return;
      if (peerConnection.iceRestartCount >= 3) {
        this.diagnostic(peerId, 'ICE restarts exhausted');
        return;
      }
      if (peerConnection.iceRestartTimer != null) return;
      const delay = 1000 * (2 ** peerConnection.iceRestartCount);
      this.diagnostic(peerId, `ICE restart scheduled in ${delay / 1000}s`);
      peerConnection.iceRestartTimer = setTimeout(() => {
        peerConnection.iceRestartTimer = null;
        if (this.peers.get(peerId) !== peerConnection) {
          this.diagnostic(peerId, 'ICE restart skipped: peer removed');
          return;
        }
        if (peerConnection.signalingState === 'closed') {
          this.diagnostic(peerId, 'ICE restart skipped: connection closed');
          return;
        }
        if (peerConnection.iceConnectionState !== 'failed') {
          this.diagnostic(peerId, 'ICE restart skipped: ICE no longer failed');
          return;
        }
        peerConnection.iceRestartCount += 1;
        iceRestartNeeded = true;
        this.diagnostic(peerId, `ICE restart initiated (attempt ${peerConnection.iceRestartCount} of 3)`);
        peerConnection.restartIce();
      }, delay);
    };

    peerConnection.onicegatheringstatechange = () => {
      this.diagnostic(peerId, `ICE gathering: ${peerConnection.iceGatheringState}`);
    };
    peerConnection.onicecandidateerror = (event) => {
      this.diagnostic(peerId, `ICE server error: ${event.errorCode}`);
    };

    //
    // Both peers may negotiate (including screen sharing after connection). During
    // initial ICE setup, let the lower public key offer first to reduce collisions
    // and rollback while gathering candidates. The other side still has a bounded
    // fallback when it is the only peer that needs to negotiate.
    //
    const negotiate = async () => {
      peerConnection.offerTimer = null;
      if (this.peers.get(peerId) !== peerConnection || peerConnection.signalingState === 'closed') {
        return;
      }
      if (peerConnection.signalingState !== 'stable' || peerConnection.makingOffer) {
        peerConnection.negotiateAgain = true;
        this.diagnostic(
          peerId,
          `Negotiation deferred until signaling is stable (${peerConnection.signalingState})`
        );
        return;
      }

      try {
        if (!peerConnection?.negotiation_counter) {
          peerConnection.negotiation_counter = 0;
        }
        console.log('STUN: Negotation needed, ', peerConnection.negotiation_counter);

        // A restart offer is the recovery attempt. The cool-off must not drop it.
        if (peerConnection.negotiation_counter > 10 && !iceRestartNeeded) {
          console.warn(`STUN: Negotation needed, but going to cool off instead`);
          this.diagnostic(peerId, 'Negotiation throttled for 12s');
          peerConnection.negotiation_timeout = setTimeout(() => {
            peerConnection.negotiation_counter = 0;
          }, 12000);
          return;
        }
        iceRestartNeeded = false;

        peerConnection.negotiation_counter++;
        peerConnection.makingOffer = true;

        if (peerConnection?.negotiation_timeout) {
          clearTimeout(peerConnection.negotiation_timeout);
        }

        await peerConnection.setLocalDescription();

        // A rollback can land before this send. have-local-offer is what proves
        // the offer we just created is still the one the connection holds.
        if (this.peers.get(peerId) !== peerConnection || peerConnection.signalingState !== 'have-local-offer') {
          return;
        }
        const description = peerConnection.localDescription;
        if (description?.type !== 'offer') return;
        await this.sendPeerDescriptionTransaction(peerId, description);
      } catch (err) {
        this.diagnostic(peerId, `Negotiation failed: ${err.name}`);
        console.error('STUN offer ERROR:', err);
      } finally {
        peerConnection.makingOffer = false;
      }
    };

    const requestNegotiation = () => {
      this.diagnostic(peerId, 'Negotiation needed');
      if (this.peers.get(peerId) !== peerConnection || peerConnection.signalingState === 'closed') return;
      if (peerConnection.signalingState !== 'stable' || peerConnection.makingOffer) {
        peerConnection.negotiateAgain = true;
        this.diagnostic(
          peerId,
          `Negotiation deferred until signaling is stable (${peerConnection.signalingState})`
        );
        return;
      }
      // A Swarmcast broadcaster applies the viewer's offer. The data channel
      // still fires negotiationneeded, and that must not become a second offer.
      if (peerConnection.answerOnly && !peerConnection.remoteDescription) {
        this.diagnostic(peerId, 'Waiting for the remote offer');
        return;
      }
      if (peerConnection.rude && peerConnection.iceConnectionState === 'new') {
        // Coalesce data-channel creation and media attachment without extending
        // the deadline every time another track is added.
        if (peerConnection.offerTimer != null) return;
        this.diagnostic(peerId, 'Deferring initial offer for 1500ms');
        peerConnection.offerTimer = setTimeout(() => {
          if (this.peers.get(peerId) !== peerConnection) return;
          void this.chainPeer(peerConnection, () => negotiate());
        }, 1500);
        return;
      }
      clearTimeout(peerConnection.offerTimer);
      peerConnection.offerTimer = null;
      // Schedule only. A caller already on this chain must not wait for the offer.
      void this.chainPeer(peerConnection, () => negotiate());
    };
    peerConnection.onnegotiationneeded = requestNegotiation;
    peerConnection.onsignalingstatechange = () => {
      this.diagnostic(peerId, `Signaling: ${peerConnection.signalingState}`);
      this.noteWatchdogProgress(peerId, peerConnection, 'signaling', peerConnection.signalingState);
      this.app.connection.emit('stun-signaling-state', peerId, peerConnection.signalingState);
      if (peerConnection.signalingState === 'stable' && peerConnection.negotiateAgain) {
        peerConnection.negotiateAgain = false;
        requestNegotiation();
      }
    };

    const dc = peerConnection.createDataChannel('data-channel', { negotiated: true, id: 42 });
    peerConnection.dc = dc;

    dc.onmessage = (event) => {
      this.handleDataChannelMessage(event.data, peerId);
    };

    dc.onopen = (event) => {
      console.info('STUN: Data channel is open');
      this.cancelNegotiationWatchdog(peerConnection, 'data channel open');
      this.app.connection.emit('stun-data-channel-open', peerId);
    };

    dc.onclose = (event) => {
      console.info('STUN: Data channel is closed with ' + peerId);
      this.app.connection.emit('stun-data-channel-close', peerId);
    };

    if (callback) {
      this.callback = callback;
      callback(peerId);
    }

    void this.flushEarlySignals(peerId);
  }

  async flushEarlySignals(peerId) {
    const queued = this.earlySignals.get(peerId);
    const peerConnection = this.peers.get(peerId);
    if (!queued?.length || !peerConnection) {
      return;
    }
    // Drop the batch before yielding so a live message cannot join it out of order.
    this.earlySignals.delete(peerId);
    await this.chainPeer(peerConnection, async () => {
      for (const item of queued) {
        await this.applySignal(peerId, item.request, item.data, peerConnection);
      }
    });
  }

  //This can get double processed by PeerTransaction and onConfirmation
  //So need safety checks
  async setCameraSenderBitrate(peerId, maxBitrate) {
    return this.setSenderBitrate(peerId, 'camera', maxBitrate);
  }

  async setScreenSenderBitrate(peerId, maxBitrate) {
    return this.setSenderBitrate(peerId, 'screen', maxBitrate);
  }

  findVideoSender(peerId, trackRole) {
    const peerConnection = this.peers.get(peerId);
    if (!peerConnection || peerConnection.signalingState === 'closed') return null;
    return (
      peerConnection.getSenders?.().find((item) => {
        return item.trackRole === trackRole && item.track?.kind === 'video';
      }) || null
    );
  }

  senderBitrateStatus(peerId, trackRole) {
    const sender = this.findVideoSender(peerId, trackRole);
    const state = sender && this.senderBitrate?.get(sender);
    if (!state) return null;
    return {
      desired: state.desired,
      applied: state.applied ?? null,
      failure: state.failure ? { bitrate: state.failure.bitrate, name: state.failure.name } : null
    };
  }

  // trackRole is set when Videocall adds the track. Camera and screen are
  // different video senders on the same peer connection. Each sender applies
  // one setParameters call at a time. A newer bitrate replaces a pending one
  // and is written after the in-flight call finishes. applied is set only
  // after setParameters resolves, so a rejection is not treated as success.
  async setSenderBitrate(peerId, trackRole, maxBitrate) {
    const peerConnection = this.peers.get(peerId);
    const sender = this.findVideoSender(peerId, trackRole);
    if (!sender?.getParameters || !sender.setParameters) return;

    if (!this.senderBitrate) this.senderBitrate = new WeakMap();
    let state = this.senderBitrate.get(sender);
    if (!state) {
      state = { writing: false, desired: null, applied: null, failure: null };
      this.senderBitrate.set(sender, state);
    }
    state.desired = maxBitrate;
    if (!state.writing && state.applied === maxBitrate && state.failure == null) {
      state.desired = null;
      return;
    }
    if (state.writing) return;
    state.writing = true;

    try {
      while (state.desired != null) {
        if (
          this.peers.get(peerId) !== peerConnection ||
          peerConnection.signalingState === 'closed' ||
          !peerConnection.getSenders?.().includes(sender)
        ) {
          state.desired = null;
          break;
        }
        const bitrate = state.desired;
        state.desired = null;
        if (bitrate === state.applied && state.failure == null) continue;
        try {
          const parameters = sender.getParameters();
          if (!parameters.encodings) parameters.encodings = [];
          if (parameters.encodings.length === 0) parameters.encodings.push({});
          parameters.encodings[0].maxBitrate = bitrate;
          await sender.setParameters(parameters);
          state.applied = bitrate;
          state.failure = null;
        } catch (err) {
          state.failure = { bitrate, name: err?.name || 'Error' };
          this.diagnostic(peerId, `Sender bitrate failed (${trackRole}): ${state.failure.name}`);
          console.error('STUN [setSenderBitrate]', peerId, trackRole, err);
        }
      }
    } finally {
      state.writing = false;
      if (
        state.desired != null &&
        this.peers.get(peerId) === peerConnection &&
        peerConnection.signalingState !== 'closed' &&
        peerConnection.getSenders?.().includes(sender)
      ) {
        return this.setSenderBitrate(peerId, trackRole, state.desired);
      }
    }
  }

  removePeerConnection(peerId) {
    const peerConnection = this.peers.get(peerId);
    if (peerConnection) {
      console.info(
        'STUN TRACE removePeerConnection',
        peerId,
        'connection',
        peerConnection.connectionState,
        'signaling',
        peerConnection.signalingState,
        'ice',
        peerConnection.iceConnectionState
      );
      console.trace('STUN TRACE removePeerConnection');
      console.info('Stun remove peer connection! ' + peerConnection.connectionState);
      this.diagnostic(peerId, 'Closing peer connection');
      clearTimeout(peerConnection.offerTimer);
      clearTimeout(peerConnection.negotiation_timeout);
      clearTimeout(peerConnection.timer);
      clearTimeout(peerConnection.watchdog);
      peerConnection.watchdogGeneration = (peerConnection.watchdogGeneration || 0) + 1;
      clearTimeout(peerConnection.iceRestartTimer);
      peerConnection.iceRestartTimer = null;
      peerConnection.close();
      this.peers.delete(peerId);
    }
  }
}

function iceUfrag(description) {
  const match = description?.sdp?.match(/^a=ice-ufrag:(\S+)/m);
  return match ? match[1] : '';
}

function candidateFragment(candidate) {
  return candidate?.usernameFragment || '';
}

module.exports = Stun;
