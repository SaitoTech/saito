import { Segmenter } from './segmenter.mjs';

export class TranscriptEngine {
  constructor({ context, onText, onStatus, onGap, speaker, shouldSave, startedAt }) {
    Object.assign(this, { context, onText, onStatus, onGap, speaker, shouldSave, startedAt });
    this.sources = new Map();
    this.streams = new Map();
    this.queue = [];
    this.sequence = 0;
    this.closed = false;
    this.stopping = false;
  }

  async start() {
    try {
      this.worker = new Worker('/transcript/worker.mjs', { type: 'module' });
      const ready = new Promise((resolve, reject) => {
        this.rejectReady = reject;
        this.loadTimeout = setTimeout(
          () => reject(new Error('Speech model download timed out. Try transcript again.')),
          180000
        );
        this.worker.onerror = () =>
          this.fail(
            new Error('Speech worker failed. Check transcript assets and browser support.')
          );
        this.worker.onmessage = ({ data }) => {
          if (data.type === 'ready') {
            clearTimeout(this.loadTimeout);
            this.rejectReady = null;
            resolve();
          } else if (data.type === 'progress') {
            const progress = data.progress;
            this.onStatus(
              progress.status === 'progress'
                ? `Loading English transcript: ${Math.round(progress.progress)}%`
                : 'Loading English transcript…'
            );
          } else if (data.type === 'error') {
            this.fail(new Error(data.message));
          } else if (data.type === 'result' && this.current?.id === data.id) {
            clearTimeout(this.inferenceTimeout);
            const job = this.current;
            this.current = null;
            if (data.text) this.onText({ ...job, audio: undefined, text: data.text });
            this.pump();
          }
        };
        this.worker.postMessage({ type: 'load' });
      });
      await Promise.all([
        ready,
        this.context.audioWorklet.addModule('/transcript/audio-worklet.js')
      ]);
      if (this.closed) return;
      this.ready = true;
      for (const [peer, stream] of this.streams) this.attach(peer, stream);
      this.onStatus('Listening…');
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  updateStream(peer, stream) {
    if (this.closed || this.stopping || peer === 'presentation' || !stream) return;
    this.streams.set(peer, stream);
    if (this.ready) this.attach(peer, stream);
  }

  attach(peer, stream) {
    const tracks = stream.getAudioTracks().filter((track) => track.readyState === 'live');
    const previous = this.sources.get(peer);
    if (
      previous?.stream === stream &&
      previous.tracks.length === tracks.length &&
      tracks.every((track, index) => previous.tracks[index] === track)
    )
      return;
    this.detach(peer);
    const refresh = () => this.attach(peer, stream);
    stream.addEventListener('addtrack', refresh);
    stream.addEventListener('removetrack', refresh);
    const entry = { stream, tracks, refresh };
    this.sources.set(peer, entry);
    if (!tracks.length) return;
    // An audio-only wrapper excludes screen-share/video tracks without owning them.
    entry.source = this.context.createMediaStreamSource(new MediaStream(tracks));
    entry.node = new AudioWorkletNode(this.context, 'transcript-audio');
    entry.silence = this.context.createGain();
    entry.silence.gain.value = 0;
    entry.segmenter = new Segmenter((chunk) => this.enqueue(peer, chunk));
    entry.node.port.onmessage = ({ data }) => {
      if (this.closed || this.stopping) return;
      const audible = tracks.some(
        (track) => track.enabled && !track.muted && track.readyState === 'live'
      );
      entry.segmenter.push(
        audible ? data : new Float32Array(data.length),
        Math.max(0, Date.now() - this.startedAt - 100)
      );
    };
    entry.source.connect(entry.node).connect(entry.silence).connect(this.context.destination);
  }

  detach(peer) {
    const entry = this.sources.get(peer);
    if (!entry) return;
    entry.stream.removeEventListener('addtrack', entry.refresh);
    entry.stream.removeEventListener('removetrack', entry.refresh);
    entry.segmenter?.flush();
    if (entry.node) {
      entry.node.port.onmessage = null;
      entry.node.port.close();
    }
    entry.source?.disconnect();
    entry.node?.disconnect();
    entry.silence?.disconnect();
    this.sources.delete(peer);
  }

  removePeer(peer) {
    this.detach(peer);
    this.streams.delete(peer);
  }

  flush() {
    for (const entry of this.sources.values()) entry.segmenter?.flush();
  }

  enqueue(peer, chunk) {
    if (this.closed) return;
    // Bound backlog by duration, not speaker count; record a visible gap instead of
    // silently growing memory or showing increasingly stale transcript.
    const queuedSamples = this.queue.reduce((sum, job) => sum + job.audio.length, 0);
    if (queuedSamples + chunk.audio.length > 16000 * 30) {
      this.onGap('Some speech was skipped because transcription could not keep up.');
      return;
    }
    this.queue.push({
      ...chunk,
      id: ++this.sequence,
      peer,
      speaker: this.speaker(peer),
      save: this.shouldSave()
    });
    this.queue.sort((a, b) => a.start - b.start || a.id - b.id);
    this.pump();
  }

  pump() {
    if (this.current || this.closed) return;
    this.current = this.queue.shift();
    if (!this.current) {
      this.resolveDrain?.();
      return;
    }
    // Catch up while the call is running: adjacent chunks from the same speaker
    // share one inference. Never wait to fill a batch or mix different speakers.
    const chunks = [this.current];
    let length = this.current.audio.length;
    let end = this.current.end;
    while (this.queue.length) {
      const next = this.queue[0];
      // AudioWorklet delivery timestamps can jitter by a few milliseconds.
      // Keep all samples and tolerate up to one frame of timestamp overlap.
      const gapMs = next.start - end;
      const gap = Math.max(0, Math.round(gapMs * 16));
      if (
        next.peer !== this.current.peer ||
        next.save !== this.current.save ||
        !Number.isFinite(gap) ||
        gapMs < -100 ||
        gap > 16000 ||
        length + gap + next.audio.length > 16000 * 12
      )
        break;
      this.queue.shift();
      chunks.push({ ...next, gap });
      length += gap + next.audio.length;
      end = next.end;
    }
    if (chunks.length > 1) {
      const audio = new Float32Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        offset += chunk.gap || 0;
        audio.set(chunk.audio, offset);
        offset += chunk.audio.length;
      }
      this.current = { ...this.current, audio, end };
    }
    const { audio, id } = this.current;
    this.inferenceTimeout = setTimeout(
      () => this.fail(new Error('Speech recognition timed out. Try transcript again.')),
      60000
    );
    this.worker.postMessage({ type: 'transcribe', audio, id }, [audio.buffer]);
  }

  fail(error) {
    this.rejectReady?.(error);
    this.onGap(error.message);
    this.dispose();
    this.onStatus(`Transcript stopped: ${error.message}`);
  }

  async stop() {
    if (this.closed) return;
    this.stopping = true;
    for (const peer of [...this.sources.keys()]) this.detach(peer);
    if (this.current || this.queue.length) {
      this.onStatus('Finishing transcript…');
      await new Promise((resolve) => {
        this.resolveDrain = resolve;
        this.drainTimeout = setTimeout(() => {
          this.onGap('The final audio could not finish processing before the call closed.');
          resolve();
        }, 20000);
      });
    }
    this.dispose();
  }

  dispose() {
    this.closed = true;
    this.rejectReady?.(new Error('Transcript loading cancelled.'));
    this.rejectReady = null;
    clearTimeout(this.loadTimeout);
    clearTimeout(this.inferenceTimeout);
    clearTimeout(this.drainTimeout);
    for (const peer of [...this.sources.keys()]) this.detach(peer);
    this.streams.clear();
    this.queue = [];
    this.current = null;
    this.worker?.terminate();
    this.context.close().catch(() => {});
    this.resolveDrain?.();
  }
}
