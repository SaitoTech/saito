class StreamCapture {
  constructor(streams) {
    this.streams = streams || null;
  }

  async openUserMedia(constraints) {
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  async openDisplay(constraints) {
    return navigator.mediaDevices.getDisplayMedia(constraints);
  }

  async enumerate() {
    return navigator.mediaDevices.enumerateDevices();
  }

  async preview({ audio, video } = {}) {
    const result = { audio: null, video: null, audioError: null, videoError: null };
    if (audio) {
      try {
        result.audio = await this.openUserMedia(typeof audio === 'object' && audio.audio ? audio : { audio });
      } catch (error) {
        result.audioError = error;
      }
    }
    if (video) {
      try {
        result.video = await this.openUserMedia(typeof video === 'object' && video.video ? video : { video });
      } catch (error) {
        result.videoError = error;
      }
    }
    return result;
  }

  async camera(options) {
    if (!this.streams) throw new Error('Camera capture requires the stream registry');
    return this.streams.captureCamera(options);
  }

  async display(options) {
    if (!this.streams) throw new Error('Display capture requires the stream registry');
    return this.streams.captureDisplay(options);
  }

  async replaceInput(mediaStream, kind, deviceId) {
    const constraints = kind === 'video' ? { video: { deviceId } } : { audio: { deviceId } };
    const next = await this.openUserMedia(constraints);
    const previous =
      kind === 'video' ? mediaStream?.getVideoTracks?.()?.[0] : mediaStream?.getAudioTracks?.()?.[0];
    if (previous && previous !== next.getTracks?.().find((track) => track.kind === kind)) {
      previous.stop();
    }
    return next;
  }
}

module.exports = StreamCapture;
