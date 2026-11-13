class Stream {
  constructor(fields = {}) {
    this.id = fields.id;
    this.source = fields.source ?? null;
    this.kind = fields.kind;
    this.origin = fields.origin;
    this.session = fields.session || 'call';
    this.availability = fields.availability || 'live';
    this.disposition = fields.disposition || 'borrowed';
    this.mediaStream = fields.mediaStream ?? null;
    this.peerId = fields.peerId ?? null;
  }

  getMediaStream() {
    return this.mediaStream;
  }

  getTracks() {
    return this.mediaStream?.getTracks?.() || [];
  }

  getMetadata() {
    return {
      id: this.id,
      kind: this.kind,
      origin: this.origin,
      source: this.source,
      peerId: this.peerId,
      availability: this.availability,
      disposition: this.disposition,
      session: this.session
    };
  }

  addTrack(track) {
    if (!this.mediaStream) {
      return this;
    }
    if (!this.mediaStream.getTracks().includes(track)) {
      this.mediaStream.addTrack(track);
    }
    return this;
  }

  removeTrack(track) {
    this.mediaStream?.removeTrack?.(track);
    return this;
  }

  stop() {
    if (this.disposition !== 'owned') return this;
    this.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch (err) {
        console.error(err);
      }
    });
    return this;
  }
}

module.exports = Stream;
