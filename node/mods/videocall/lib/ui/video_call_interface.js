const Meeting = require('./meeting');
const Windows = require('./windows');

// The one call presentation Videocall and StreamManager talk to.
// It constructs either the meeting or the floating windows and forwards calls.
class VideoCallInterface {
  constructor(app, mod, mode, container) {
    this.app = app;
    this.mod = mod;
    this.mode = mode;

    if (mode === 'meeting') {
      this.presentation = new Meeting(app, mod, true);
      this.switchLayout = (...args) => this.presentation.switchLayout(...args);
      this.updateRoomLink = (...args) => this.presentation.updateRoomLink(...args);
      this.showSettings = (...args) => this.presentation.showSettings(...args);
      this.updateConnectionStrength = (...args) =>
        this.presentation.updateConnectionStrength(...args);
    } else if (mode === 'windows') {
      this.presentation = new Windows(app, mod, container);
    } else {
      throw new Error(`Unknown call presentation: ${mode}`);
    }
  }

  get presentControlId() {
    return this.presentation.presentControlId;
  }

  set presentControlId(value) {
    this.presentation.presentControlId = value;
  }

  receiveLocalStream(localStream) {
    return this.presentation.receiveLocalStream(localStream);
  }

  receiveRemoteStream(peer, remoteStream) {
    return this.presentation.receiveRemoteStream(peer, remoteStream);
  }

  participantLeft(peerId) {
    return this.presentation.participantLeft(peerId);
  }

  participantKicked(peerId) {
    return this.presentation.participantKicked(peerId);
  }

  presentationStopped() {
    return this.presentation.presentationStopped();
  }

  setPresenting(state, sender) {
    return this.presentation.setPresenting(state, sender);
  }

  close() {
    return this.presentation.close();
  }

  destroy() {
    return this.presentation.destroy();
  }
}

module.exports = VideoCallInterface;
