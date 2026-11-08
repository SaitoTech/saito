/**
 * This appears to hold the core code for connecting to peers over stun
 *
 */

class StreamManager {
  constructor(app, mod, settings) {
    this.app = app;
    this.mod = mod;
    this.localStream = null; //My Video Feed
    this.presentationStream = null;
    this.remoteStreams = new Map(); //The video of the other parties
    this.transcribingPeers = new Set();

    this.videoEnabled = true;
    this.audioEnabled = true;
    this.videoSource = null;
    this.audioSource = null;
    this.auto_disconnect = false;
    this.active = true;

    this.monitors = {};
    this.listeners = {};
    this.detached = false;

    this.parseSettings(settings);

    this.listen('stun-connection-connected', (peerId) => {
      if (!this.active) {
        return;
      }

      console.debug('TALK [stun-connection-connected] ', this.active, peerId);

      if (!this.mod?.room_obj || !this.mod.room_obj.call_peers.includes(peerId)) {
        return;
      }

      let pc = this.mod.stun.peers.get(peerId);
      if (pc.firstConnect) {
        let sound = new Audio('/saito/sound/Polite.mp3');
        sound.play();
        pc.firstConnect = false;
      }

      this.mod.sendOffChainMessage('toggle-audio', {
        public_key: this.mod.publicKey,
        enabled: this.audioEnabled
      });

      this.mod.sendOffChainMessage('toggle-video', {
        public_key: this.mod.publicKey,
        enabled: this.videoEnabled
      });
      this.broadcastTranscriptionStatus();

      // Add connection quality monitoring....
      if (this.monitors[peerId]) {
        clearInterval(this.monitors[peerId]);
        delete this.monitors[peerId];
      }

      let my_stats = {};

      this.monitors[peerId] = setInterval(async () => {
        if (!this.mod.stun.hasConnection(peerId)) {
          clearInterval(this.monitors[peerId]);
          delete this.monitors[peerId];
          return;
        }

        let stats = await pc.getStats();
        if (this.detached) return;

        stats.forEach((value, key) => {
          if (value.type == 'remote-inbound-rtp' && value.kind == 'video') {
            let rP = value.packetsReceived || 0;
            let rL = value.packetsLost || 0;

            my_stats.jitter = value.jitter * 1000 || 0;
            my_stats.packetLoss = rL / (rP + rL) || 0;
            my_stats.rtt = value.roundTripTime * 1000 || 0;
          }
        });

        //
        // Formula based on medium post of pseudocode of VLprojects/webrtc-issue-detector
        //

        let effective_rtt = my_stats.rtt + my_stats.jitter * 2 + 10;
        if (effective_rtt < 160) {
          my_stats.rFactor = 93.2 - effective_rtt / 40;
        } else {
          my_stats.rFactor = 93.2 - effective_rtt / 120 - 10;
        }
        my_stats.rFactor = my_stats.rFactor - my_stats.packetLoss * 2.5;

        my_stats.rFactor = Math.max(my_stats.rFactor, 0);

        my_stats.mos =
          1 +
          0.035 * my_stats.rFactor +
          0.000007 * my_stats.rFactor * (my_stats.rFactor - 60) * (100 - my_stats.rFactor);

        /*console.log(`STUN STATS [${peerId}]: `, my_stats);*/

        this.mod.CallInterface?.updateConnectionStrength?.(peerId, my_stats.mos);
      }, 1000);
    });

    this.listen('stun-update-connection-message', (peerId, connectionState) => {
      if (this.active) {
        this.broadcastPeerList();
      }
    });

    this.listen('stun-track-event', (peerId, event) => {
      //
      // Note: This happens twice because audio and video are added separately as mediaTracks...
      //
      // Talk sends microphone/camera tracks without a stream association and
      // screen-share tracks with their presentationStream. A presenter can
      // still send new call tracks (e.g. when another participant joins).
      const id =
        peerId === this.mod.screen_share && event?.streams?.length
          ? 'presentation'
          : peerId;

      // Keep one MediaStream object per participant. Replacing it restarts the
      // video element and leaves a black window until playback begins again.
      let remoteStream = this.remoteStreams.get(id);
      if (!remoteStream) {
        remoteStream = new MediaStream();
      }
      if (!remoteStream.getTracks().includes(event.track)) {
        remoteStream.addTrack(event.track);
      }

      console.info(
        'TALK [stun-track-event]: remote stream (track) added for',
        id,
        event.track,
        event.streams
      );

      this.remoteStreams.set(id, remoteStream);
      this.app.connection.emit('videocall-stream', id, remoteStream);

      if (!this.active) {
        console.warn('STUN/TALK: Receiving media tracks before in call state');
        return;
      }

      // Update interface / video element
      this.mod.CallInterface?.receiveRemoteStream?.(id, remoteStream);

    });

    this.listen('stun-new-peer-connection', async (publicKey, peerConnection) => {
      if (!this.active) {
        return;
      }

      console.info('TALK [stun-new-peer-connection]: ' + publicKey);
      console.debug(JSON.parse(JSON.stringify(this.mod.room_obj)));

      if (this.mod.room_obj.call_peers.includes(publicKey)) {
        // Show status even if capture or signaling fails before media arrives.
        if (!this.remoteStreams.has(publicKey)) {
          this.mod.CallInterface?.receiveRemoteStream?.(publicKey, null);
        }
        peerConnection.firstConnect = true;

        const currentConnection = () =>
          !this.detached &&
          this.active &&
          this.mod.stun.peers.get(publicKey) === peerConnection &&
          peerConnection.signalingState !== 'closed';
        const attach = () => {
          if (!currentConnection() || !this.localStream) return;
          try {
            this.localStream.getTracks().forEach((track) => {
              // Discovery and connection reuse can notify us more than once.
              if (peerConnection.getSenders().some((sender) => sender.track === track)) return;
              console.info(
                'TALK [stun-new-peer-connection] sending new track to ' + publicKey,
                track
              );
              peerConnection.addTrack(track);
              this.markOutgoingSender(peerConnection, track, 'camera');
              this.mod.diagnostics?.record(publicKey, `Attached local ${track.kind} track`);
            });
            this.mod.applyCameraProfile?.();
          } catch (err) {
            this.mod.diagnostics?.record(publicKey, `Attach media failed: ${err.name}`);
            console.error(err);
          }
        };

        // Attach before the peer connection installs its negotiation handler, so the
        // first offer includes the camera and microphone instead of only the data channel.
        if (this.localStream) {
          attach();
        } else {
          this.getLocalMedia().then(attach).catch((err) => {
            this.mod.diagnostics?.record(publicKey, `Local media unavailable: ${err.name}`);
          });
        }

        if (this.presentationStream) {
          setTimeout(async () => {
            if (!currentConnection() || !this.presentationStream) return;
            await this.mod.sendOffChainMessage('screen-share-start', {});
            if (!currentConnection() || !this.presentationStream) return;
            this.presentationStream.getTracks().forEach((track) => {
              if (peerConnection.getSenders().some((sender) => sender.track === track)) return;
              peerConnection.addTrack(track, this.presentationStream);
              this.markOutgoingSender(peerConnection, track, 'screen');
            });
            this.mod.applyScreenShareBitrate?.();
          }, 1500);
        }
      }

    });
  }

  listen(event, handler) {
    this.listeners[event] = handler;
    this.app.connection.on(event, handler);
  }

  detach() {
    if (this.detached) return;
    this.detached = true;

    for (const event of Object.keys(this.listeners)) {
      this.app.connection.removeListener(event, this.listeners[event]);
    }
    this.listeners = {};

    for (const peerId of Object.keys(this.monitors)) {
      clearInterval(this.monitors[peerId]);
      delete this.monitors[peerId];
    }

  }

  async start() {
    if (this.detached) return;
    this.mod.diagnostics?.beginCall?.();
    this.active = true;
    this.leaving = false;

    this.app.browser.lockNavigation(this.visibilityChange.bind(this), true);

    console.info('TALK [start]', JSON.parse(JSON.stringify(this.mod.room_obj)));
    this.firstConnect = true;

    // Render the UI component and tell other modules the call has started.
    this.app.connection.emit('videocall-call-started', this.videoEnabled, this.audioEnabled);

    await this.getLocalMedia();
    if (this.detached) return;

    this.mod.sendCallEntryTransaction();

    let sound = new Audio('/saito/sound/Calm.mp3');
    sound.play();

    console.info('TALK [StreamManager] restore remote streams....');
  }

  async toggleVideo() {
    if (this.detached || !this.active) {
      if (!this.active) console.warn('TALK [stun-toggle] event when not active...');
      return;
    }

    if (this.videoEnabled === true) {
      if (!this.localStream.getVideoTracks()[0]) return;
      this.localStream.getVideoTracks()[0].enabled = false;
      this.videoEnabled = false;
    } else {
      this.videoEnabled = true;

      if (!this.localStream.getVideoTracks()?.length) {
        try {
          const newLocalStream = await navigator.mediaDevices.getUserMedia(
            this.returnConstraints(true)
          );
          if (this.detached) {
            newLocalStream.getTracks().forEach((track) => track.stop());
            return;
          }

          const videoTrack = newLocalStream.getVideoTracks()[0];
          this.localStream.addTrack(videoTrack);

          this.app.connection.emit('videocall-stream', 'local', this.localStream);
          this.mod.CallInterface?.receiveLocalStream?.(this.localStream);

          await this.attachCameraToPeers(videoTrack);
          this.mod.applyCameraProfile?.();
        } catch (err) {
          this.mod.diagnostics?.record('local', `Enable camera failed: ${err.name}`);
          console.error('TALK [toggleVideo] ERROR:', err);
        }
      } else {
        this.localStream.getVideoTracks()[0].enabled = true;
      }
    }

    this.mod.sendOffChainMessage('toggle-video', {
      enabled: this.videoEnabled,
      public_key: this.mod.publicKey
    });
  }

  async toggleAudio() {
    if (this.detached || !this.active) {
      if (!this.active) console.warn('TALK [stun-toggle] event when not active...');
      return;
    }

    this.audioEnabled = !this.audioEnabled;

    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = this.audioEnabled;
    });

    this.app.connection.emit('videocall-peer-audio-changed', {
      enabled: this.audioEnabled,
      public_key: 'local'
    });

    this.mod.sendOffChainMessage('toggle-audio', {
      public_key: this.mod.publicKey,
      enabled: this.audioEnabled
    });
  }

  async beginShareScreen() {
    if (this.detached || !this.active) {
      return;
    }

    try {
      this.presentationStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
        selfBrowserSurface: 'include',
        monitorTypeSurfaces: 'include',
        systemAudio: 'include'
      });
      if (this.detached) {
        this.presentationStream.getTracks().forEach((track) => track.stop());
        this.presentationStream = null;
        return;
      }
      this.presentationStream.getVideoTracks()[0].onended = this.endPresentation.bind(this);

      this.mod.screen_share = true;

      await this.mod.sendOffChainMessage('screen-share-start', {});

      this.mod.CallInterface?.receiveRemoteStream?.('presentation', this.presentationStream);

      console.debug('TALK [begin-screen-share]: ', this.mod.room_obj.call_peers, this.mod.stun.peers);

      this.mod.stun.peers.forEach((pc, key) => {
        if (this.mod.room_obj.call_peers.includes(key)) {
          this.presentationStream.getTracks().forEach((track) => {
            pc.addTrack(track, this.presentationStream);
            this.markOutgoingSender(pc, track, 'screen');
          });
        }
      });
      this.mod.applyScreenShareBitrate?.();

      this.mod.CallInterface?.setPresenting?.(true);
    } catch (err) {
      this.mod.diagnostics?.record('local', `Screen capture failed: ${err.name}`);
      console.error('TALK [begin-screen-share]: Error:', err);
    }
  }

  stopShareScreen() {
    if (this.detached || !this.active) {
      return;
    }
    this.endPresentation();
  }

  parseSettings(settings) {
    this.videoEnabled = false;

    // Check saved options (maybe redundant...)

    if (settings?.video) {
      this.videoEnabled = true;
      if (settings.video !== true) {
        this.videoSource = settings.video;
      }
    }

    this.audioEnabled = false;
    if (settings?.audio) {
      this.audioEnabled = true;
      if (settings.audio !== true) {
        this.audioSource = settings.audio;
      }
    }

    this.auto_disconnect = this?.auto_disconnect || settings?.auto_disconnect;
  }

  async updateInputs(type, source) {
    if (type == 'video') {
      this.videoSource = source;
      this.videoEnabled = true;
    } else {
      this.audioSource = source;
      this.audioEnabled = true;
    }

    this.app.options.stun.settings[`preferred_${type}`] = source;
    this.app.storage.saveOptions();

    if (!this.localStream) return;

    if (type == 'video') {
      await this.replaceCameraTrack();
      return;
    }

    console.debug('TALK [updateInputs]: ', type, source);
    this.localStream.getTracks().forEach((track) => {
      track.stop();
    });
    this.localStream = null;
    this.getLocalMedia();
  }

  // Swap the camera on existing camera senders. Screen senders are left alone.
  // A peer that connects later still receives the new track from attach().
  async replaceCameraTrack() {
    let captured = null;
    try {
      captured = await navigator.mediaDevices.getUserMedia(this.returnConstraints(true));
    } catch (err) {
      this.mod.diagnostics?.record('local', `Camera capture failed: ${err.name}`);
      console.error('TALK [updateInputs]', err);
      return;
    }
    if (this.detached) {
      captured.getTracks().forEach((track) => track.stop());
      return;
    }

    const videoTrack = captured.getVideoTracks()[0];
    if (!videoTrack) {
      captured.getTracks().forEach((track) => track.stop());
      return;
    }
    captured.getAudioTracks().forEach((track) => track.stop());

    const previous = this.localStream.getVideoTracks()[0] || null;
    if (previous) this.localStream.removeTrack(previous);
    this.localStream.addTrack(videoTrack);

    try {
      await this.attachCameraToPeers(videoTrack);
    } catch (err) {
      this.localStream.removeTrack(videoTrack);
      if (previous) this.localStream.addTrack(previous);
      videoTrack.stop();
      this.mod.diagnostics?.record('local', `Camera replacement failed: ${err.name}`);
      console.error('TALK [updateInputs]', err);
      return;
    }

    if (previous) previous.stop();
    this.app.connection.emit('videocall-stream', 'local', this.localStream);
    this.mod.CallInterface?.receiveLocalStream?.(this.localStream);
    await this.mod.applyCameraProfile?.();
  }

  async attachCameraToPeers(videoTrack) {
    const changed = [];
    try {
      for (const [key, peerConnection] of this.mod.stun.peers) {
        if (!this.mod.room_obj?.call_peers?.includes(key)) continue;
        const cameraSender = peerConnection
          .getSenders()
          .find((sender) => sender.trackRole === 'camera');
        if (cameraSender) {
          const previousTrack = cameraSender.track;
          await cameraSender.replaceTrack(videoTrack);
          changed.push({ sender: cameraSender, previousTrack });
        } else {
          peerConnection.addTrack(videoTrack);
          this.markOutgoingSender(peerConnection, videoTrack, 'camera');
          const sender = peerConnection
            .getSenders()
            .find((item) => item.track === videoTrack && item.trackRole === 'camera');
          changed.push({ sender, previousTrack: null, peerConnection });
        }
      }
    } catch (err) {
      for (const change of changed.reverse()) {
        if (change.previousTrack && change.sender?.replaceTrack) {
          await change.sender.replaceTrack(change.previousTrack).catch(() => {});
        } else if (change.peerConnection?.removeTrack && change.sender) {
          try {
            change.peerConnection.removeTrack(change.sender);
          } catch (removeError) {
            console.error('TALK [attachCameraToPeers]', removeError);
          }
        }
      }
      throw err;
    }
  }

  returnConstraints(onlyVideo = false) {
    let constraints = {};

    if (this.videoSource) {
      constraints.video = { deviceId: this.videoSource };
    } else if (this.videoEnabled) {
      constraints.video = true;
    } else {
      constraints.video = false;
    }

    if (!onlyVideo) {
      if (this.audioSource) {
        constraints.audio = { deviceId: this.audioSource };
      } else {
        constraints.audio = true;
      }
    }

    return constraints;
  }

  async getLocalMedia() {
    if (this.detached) return;

    if (this.localStream) {
      let shouldReturn = true;
      this.localStream.getTracks().forEach((track) => {
        if (track.readyState === 'ended') {
          console.warn('TALK [getLocalMedia]: Track ready state is ended, reacquiring media...');
          shouldReturn = false;
        }
      });
      if (shouldReturn) return; // If none of the tracks have ended, return early
    }

    let c = this.returnConstraints();

    console.debug('TALK [getLocalMedia]: ', this.videoSource, this.audioSource, c);

    this.mod.diagnostics?.record('local', `Requesting media: video=${!!c.video}, audio=${!!c.audio}`);
    //Get my local media
    let captured = null;
    try {
      captured = await navigator.mediaDevices.getUserMedia(c);
    } catch (err) {
      console.warn('TALK [getLocalMedia] Problem attempting to get User Media', err);

      this.mod.diagnostics?.record('local', `Media capture failed: ${err.name}; retrying audio only`);
      this.videoEnabled = false;
      c.video = false;

      try {
        captured = await navigator.mediaDevices.getUserMedia(c);
      } catch (error) {
        this.mod.diagnostics?.record('local', `Audio capture failed: ${error.name}`);
        throw error;
      }
    }

    if (this.detached) {
      captured?.getTracks().forEach((track) => track.stop());
      return;
    }

    this.localStream = captured;

    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = this.audioEnabled;
    });

    this.mod.diagnostics?.record('local', `Captured ${this.localStream.getAudioTracks().length} audio / ${this.localStream.getVideoTracks().length} video tracks`);
    //Plug local stream into UI component
    this.app.connection.emit('videocall-stream', 'local', this.localStream);
    this.mod.CallInterface?.receiveLocalStream?.(this.localStream);
    await this.mod.applyCameraProfile?.();
  }

  markOutgoingSender(peerConnection, track, trackRole) {
    if (track?.kind !== 'video') return;
    const sender = peerConnection.getSenders().find((item) => item.track === track);
    if (sender) sender.trackRole = trackRole;
  }

  // Width, height, and frame rate for the live camera track. This is not
  // returnConstraints(), which only chooses the device for getUserMedia.
  // Requests are applied one at a time so a newer profile replaces an older one.
  setCameraCapture({ width, height, frameRate }) {
    this.pendingCameraCapture = { width, height, frameRate };
    if (!this.cameraCaptureQueue) {
      this.cameraCaptureQueue = this.drainCameraCapture();
    }
    return this.cameraCaptureQueue;
  }

  async drainCameraCapture() {
    try {
      while (this.pendingCameraCapture) {
        const requested = this.pendingCameraCapture;
        this.pendingCameraCapture = null;
        await this.applyCameraCapture(requested);
      }
    } finally {
      this.cameraCaptureQueue = null;
      if (this.pendingCameraCapture) return this.setCameraCapture(this.pendingCameraCapture);
    }
  }

  async applyCameraCapture({ width, height, frameRate }) {
    const track = this.localStream?.getVideoTracks?.()[0];
    if (!track || track.readyState === 'ended' || typeof track.applyConstraints !== 'function') {
      return;
    }
    const key = `${width}x${height}@${frameRate}`;
    if (track.cameraCaptureKey === key) return;
    try {
      await track.applyConstraints({
        width: { ideal: width },
        height: { ideal: height },
        frameRate: { ideal: frameRate }
      });
      if (this.pendingCameraCapture) return;
      track.cameraCaptureKey = key;
    } catch (err) {
      this.mod.diagnostics?.record('local', `Camera capture failed: ${err.name}`);
      console.error('TALK [setCameraCapture]', err);
    }
  }

  setTranscribing(enabled) {
    if (!this.active) return;
    this.updateTranscriptionStatus(this.mod.publicKey, enabled);
    this.broadcastTranscriptionStatus();
  }

  broadcastTranscriptionStatus() {
    void this.mod.sendOffChainMessage('toggle-transcription', {
      enabled: this.transcribingPeers.has(this.mod.publicKey)
    }).catch((error) => console.error('TALK: Could not share transcription status', error));
  }

  updateTranscriptionStatus(peer, enabled) {
    if (enabled) this.transcribingPeers.add(peer);
    else this.transcribingPeers.delete(peer);
    this.app.connection.emit('peer-toggle-transcription-status', {
      public_key: peer,
      enabled
    });
  }

  removePeer(peer, message = 'left the meeting') {
    this.updateTranscriptionStatus(peer, false);
    this.app.connection.emit('videocall-peer-left', peer);
    this.remoteStreams.delete(peer);

    if (this.auto_disconnect) {
      siteMessage(`${this.app.keychain.returnUsername(peer)} hung up`, 1500);
      setTimeout(() => {
        this.leaveCall();
      }, 1500);
    } else {
      siteMessage(`${this.app.keychain.returnUsername(peer)} ${message}`, 2500);
    }

    let sound = new Audio('/saito/sound/Sharp.mp3');
    sound.play();

    this.broadcastPeerList();
  }

  async leaveCall() {
    if (this.leaving || !this.active) return;
    console.info('TALK [leaveCall]: hanging up...');
    this.app.keychain.addKey(this.mod.room_obj.call_id, { ended: true });
    this.leaving = true;
    this.detach();
    const completion = [];
    this.app.connection.emit('videocall-call-ended', completion);
    // Let transcript recognition drain and saving finish independently of hangup.
    void Promise.allSettled(completion);

    this.app.browser.unlockNavigation(this.visibilityChange.bind(this));

    this.endPresentation();

    // Close the interface at the same point the old command handler resumed:
    // after the synchronous hang-up work, while the disconnect transaction is in flight.
    const disconnecting = this.mod.sendCallDisconnectTransaction();
    this.mod.CallInterface?.close?.();
    await disconnecting;

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        track.stop();
        console.debug('TALK [leaveCall]: stopping track');
      });
    }

    this.localStream = null; //My Video Feed

    this.mod.resetCall();

    //
    // Reset parameters
    //
    this.videoEnabled = true;
    this.audioEnabled = true;
    this.auto_disconnect = false;
    this.transcribingPeers.clear();
    this.active = false;

    console.info('TALK [leaveCall]: successfully disconnected...');
    let sound = new Audio('/saito/sound/Sharp.mp3');
    sound.play();
  }

  endPresentation() {
    if (this.mod.screen_share === true) {
      console.info('TALK [endPresentation] Screen sharing stopped by user');
      this.mod.CallInterface?.presentationStopped?.();
      this.mod.CallInterface?.switchLayout?.(
        this.app.options.stun.settings?.layout || this.mod.layout
      );
      this.mod.screen_share = null;

      //
      // Reset the button here (not in stopShareScreen) so the
      // browser's native "Stop sharing" bar resets it too
      //
      this.mod.CallInterface?.setPresenting?.(false);

      this.mod.sendOffChainMessage('screen-share-stop');
    }

    if (this.presentationStream) {
      this.presentationStream.getTracks().forEach((track) => track.stop());
      this.presentationStream = null;
    }
  }

  broadcastPeerList() {
    let peer_list = {};

    this.mod.stun.peers.forEach((pc, address) => {
      if (this.mod.room_obj.call_peers.includes(address)) {
        peer_list[address] = pc.connectionState;
      }
    });

    this.mod.sendOffChainMessage('broadcast-call-list', peer_list);
  }

  visibilityChange() {
    this.leaveCall();
  }
}

module.exports = StreamManager;
