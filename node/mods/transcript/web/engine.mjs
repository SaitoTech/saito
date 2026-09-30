import { AudioBlocks, speechBatch } from './audio-buffer.mjs';
import { withTranscriptLock } from './store.mjs';

export class TranscriptEngine {
  constructor({
    context,
    onText,
    onStatus,
    onGap,
    speaker,
    startedAt,
    selection,
    store,
    session,
    recovery = false,
    bufferLimit = 256 * 1024 * 1024
  }) {
    Object.assign(this, {
      context,
      onText,
      onStatus,
      onGap,
      speaker,
      startedAt,
      selection,
      store,
      session,
      recovery,
      buffer_limit: bufferLimit
    });
    this.sources = new Map();
    this.streams = new Map();
    this.detach_tasks = new Set();
    this.writes = Promise.resolve();
    this.pending_bytes = 0;
    this.closed = false;
    this.stopping = recovery;
  }

  async start() {
    try {
      await new Promise((resolve, reject) => {
        this.lock_task = withTranscriptLock(this.session.id, async () => {
          this.release_lock = null;
          await new Promise((release) => {
            this.release_lock = release;
            resolve();
          });
        }).catch(reject);
      });
      if (this.closed || this.pausing) {
        this.release_lock?.();
        return;
      }
      await this.store.saveSession(this.session);
      if (this.closed || this.pausing) return;
      void globalThis.navigator?.storage?.persist?.().catch(() => {});
      this.worker = new Worker('/transcript/worker.mjs', { type: 'module' });
      const ready = new Promise((resolve, reject) => {
        this.reject_ready = reject;
        this.load_timeout = setTimeout(
          () => reject(new Error('Speech model loading timed out.')),
          180000
        );
        this.worker.onerror = () =>
          this.fail(new Error('Speech worker failed. Saved audio can be retried.'));
        this.worker.onmessage = ({ data }) => {
          if (data.type === 'ready') {
            clearTimeout(this.load_timeout);
            this.reject_ready = null;
            this.ready = true;
            resolve();
          } else if (data.type === 'progress') {
            this.onStatus(
              data.progress.status === 'progress'
                ? `Loading speech model: ${Math.round(data.progress.progress)}%`
                : 'Loading speech model…'
            );
          } else if (data.type === 'error') {
            this.fail(new Error(data.message));
          } else if (data.type === 'result' && this.current?.id === data.id) {
            clearTimeout(this.inference_timeout);
            this.resolve_inference?.(data.text);
          }
        };
        this.worker.postMessage({ type: 'load', selection: this.selection });
      });
      // Handle cancellation even while the worklet is loading.
      ready.catch(() => {});
      if (this.context) {
        await this.context.audioWorklet.addModule('/transcript/audio-worklet.js');
        if (!this.closed && !this.stopping) {
          this.capture_ready = true;
          for (const [peer, stream] of this.streams) this.attach(peer, stream);
        }
      }
      await ready;
      if (!this.closed) {
        this.onStatus(this.recovery ? 'Finishing saved audio…' : 'Transcript is being captured');
        this.pump();
      }
    } catch (error) {
      this.fail(error);
      await this.pause();
      throw error;
    }
  }

  updateStream(peer, stream) {
    if (this.closed || this.stopping || peer === 'presentation' || !stream) return;
    this.streams.set(peer, stream);
    if (this.capture_ready) this.attach(peer, stream);
  }

  attach(peer, stream) {
    if (this.stopping || this.closed) return;
    const tracks = stream.getAudioTracks().filter((track) => track.readyState === 'live');
    const previous = this.sources.get(peer);
    if (
      previous?.stream === stream &&
      previous.tracks.length === tracks.length &&
      tracks.every((track, i) => previous.tracks[i] === track)
    )
      return;
    void this.detach(peer);
    const refresh = () => this.attach(peer, stream);
    stream.addEventListener('addtrack', refresh);
    stream.addEventListener('removetrack', refresh);
    const entry = { stream, tracks, refresh, streamId: crypto.randomUUID() };
    this.sources.set(peer, entry);
    if (!tracks.length) return;
    const audioStream = new MediaStream(tracks);
    if (peer !== 'local') {
      // Chromium can deliver silent WebRTC audio to Web Audio until a media
      // element plays the stream. Keep capture independent of the call's video
      // player, without playing a second audible copy of the remote voice.
      entry.playback = new Audio();
      entry.playback.muted = true;
      entry.playback.srcObject = audioStream;
      entry.playback.play().catch(() => {
        if (!entry.finished && !this.closed)
          this.onGap('Remote audio playback could not start. Check the call audio.');
      });
    }
    entry.source = this.context.createMediaStreamSource(audioStream);
    entry.node = new AudioWorkletNode(this.context, 'transcript-audio');
    entry.silence = this.context.createGain();
    entry.silence.gain.value = 0;
    entry.blocks = new AudioBlocks((chunk) =>
      this.enqueue(peer, { ...chunk, streamId: entry.streamId })
    );
    entry.node.port.onmessage = ({ data }) => {
      if (data.type === 'flushed') {
        entry.flushed?.();
        return;
      }
      if (this.closed || entry.finished) return;
      const audible = tracks.some((track) => track.enabled && !track.muted);
      // Delivery can bunch up under load. Sample order, not message arrival time,
      // must define chunk order (especially for the final partial frame).
      entry.next_at ??= Math.max(0, Date.now() - this.startedAt - data.length / 16);
      entry.blocks.push(audible ? data : new Float32Array(data.length), entry.next_at);
      entry.next_at += data.length / 16;
    };
    entry.source.connect(entry.node).connect(entry.silence).connect(this.context.destination);
  }

  detach(peer) {
    const entry = this.sources.get(peer);
    if (!entry) return Promise.resolve();
    this.sources.delete(peer);
    entry.stream.removeEventListener('addtrack', entry.refresh);
    entry.stream.removeEventListener('removetrack', entry.refresh);
    const task = (async () => {
      if (entry.node) {
        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            this.onGap(
              'The last audio frame could not be flushed; previously saved audio is retained.'
            );
            resolve();
          }, 1000);
          entry.flushed = () => {
            clearTimeout(timeout);
            resolve();
          };
          try {
            entry.node.port.postMessage({ type: 'flush' });
          } catch {
            clearTimeout(timeout);
            this.onGap(
              'The final audio frame was unavailable; previously saved audio is retained.'
            );
            resolve();
          }
        });
      }
      entry.finished = true;
      if (entry.playback) {
        entry.playback.pause();
        entry.playback.srcObject = null;
      }
      entry.blocks?.flush(true);
      if (entry.node) {
        entry.node.port.onmessage = null;
        entry.node.port.close();
      }
      entry.source?.disconnect();
      entry.node?.disconnect();
      entry.silence?.disconnect();
    })();
    this.detach_tasks.add(task);
    task.finally(() => this.detach_tasks.delete(task));
    return task;
  }

  removePeer(peer) {
    void this.detach(peer);
    this.streams.delete(peer);
  }

  enqueue(peer, chunk) {
    if (this.closed || this.write_error) return;
    // Bound uncommitted writes too; slow storage must not consume unlimited RAM.
    if (this.pending_bytes + chunk.audio.byteLength > 8 * 1024 * 1024) {
      this.fail(
        new Error(
          'Audio storage cannot keep up. Capture stopped; uncommitted audio may be missing.'
        )
      );
      return;
    }
    const block = {
      ...chunk,
      id: crypto.randomUUID(),
      peer,
      publicKey: peer === 'local' ? this.session.localPublicKey : peer,
      speaker: this.speaker(peer)
    };
    this.pending_bytes += block.audio.byteLength;
    this.writes = this.writes
      .then(async () => {
        if (this.write_error) return;
        try {
          await this.store.appendAudio(this.session, block, this.buffer_limit);
          if (this.ready && !this.pausing && !this.failure) await this.reportPending();
        } catch (error) {
          this.write_error = error;
          this.fail(
            new Error(`Audio storage failed: ${error.message}. Uncommitted audio may be missing.`)
          );
        }
      })
      .finally(() => {
        this.pending_bytes -= block.audio.byteLength;
        this.pump();
      });
  }

  pump() {
    if (this.processing || this.closed || this.failure || this.pausing || !this.ready) return;
    clearTimeout(this.poll_timer);
    this.processing = this.processNext()
      .catch((error) => this.fail(error))
      .finally(() => {
        this.processing = null;
        if (!this.closed && !this.failure && !this.pausing)
          this.poll_timer = setTimeout(() => this.pump(), 250);
      });
  }

  async processNext() {
    const blocks = await this.store.audioBatch(this.session.id);
    if (this.closed || this.pausing || !blocks.length) return;
    const samples = blocks.reduce((sum, block) => sum + block.audio.length, 0);
    if (
      !this.stopping &&
      samples < 16000 * 4 &&
      !blocks.at(-1).final &&
      Date.now() - this.startedAt - blocks[0].start < 4000
    )
      return;
    const speech = speechBatch(blocks);
    let entry;
    if (speech) {
      this.current = { id: blocks[0].id };
      const text = await new Promise((resolve, reject) => {
        this.resolve_inference = resolve;
        this.reject_inference = reject;
        this.inference_timeout = setTimeout(
          () => reject(new Error('Speech recognition timed out. Saved audio can be retried.')),
          60000
        );
        this.worker.postMessage({ type: 'transcribe', id: this.current.id, audio: speech.audio }, [
          speech.audio.buffer
        ]);
      });
      clearTimeout(this.inference_timeout);
      if (text)
        entry = {
          id: `audio:${blocks[0].id}`,
          start: speech.start,
          end: speech.end,
          peer: blocks[0].peer,
          publicKey: blocks[0].publicKey,
          speaker: blocks[0].speaker,
          text
        };
    }
    if (this.closed || this.pausing) return;
    await this.store.completeAudio(this.session.id, blocks, entry);
    this.current = null;
    if (entry) this.onText(entry);
    await this.reportPending();
  }

  async reportPending() {
    const [stats, total] = await Promise.all([
      this.store.audioStats(this.session.id),
      this.store.audioStats('*')
    ]);
    if (this.pausing || this.failure || this.closed) return;
    this.onStatus(
      `${this.stopping ? 'Finishing transcript' : 'Transcript is being captured'} — ${Math.ceil(stats.bytes / 64000)}s of audio pending${total.bytes >= this.buffer_limit * 0.8 ? ' (local audio buffer nearly full)' : ''}`
    );
  }

  fail(error) {
    if (this.failure || this.closed || this.pausing) return;
    this.failure = error;
    this.reject_ready?.(error);
    this.reject_inference?.(error);
    this.onGap(error.message);
    this.onStatus(`Transcript stopped: ${error.message}`);
    void this.pause();
  }

  stopCapture() {
    if (this.capture_stop) return this.capture_stop;
    this.stopping = true;
    this.capture_stop = (async () => {
      for (const peer of [...this.sources.keys()]) void this.detach(peer);
      await Promise.all([...this.detach_tasks]);
      await this.writes;
      this.streams.clear();
      await this.context?.close().catch(() => {});
    })();
    return this.capture_stop;
  }

  async stop() {
    try {
      await this.stopCapture();
      if (!this.ready || this.failure || this.pausing) return;
      while (!this.closed && !this.pausing && !this.failure) {
        this.pump();
        await this.processing;
        if (!(await this.store.audioStats(this.session.id)).count) break;
      }
    } catch (error) {
      this.fail(error);
    } finally {
      await this.pause();
    }
  }

  pause() {
    if (this.pause_task) return this.pause_task;
    this.pausing = true;
    this.pause_task = (async () => {
      await this.stopCapture();
      clearTimeout(this.load_timeout);
      clearTimeout(this.inference_timeout);
      clearTimeout(this.poll_timer);
      this.reject_ready?.(new Error('Transcript loading cancelled.'));
      this.reject_inference?.(new Error('Transcription paused; audio retained.'));
      this.worker?.terminate();
      await this.processing;
      this.closed = true;
      this.release_lock?.();
      await this.lock_task;
    })();
    return this.pause_task;
  }

  dispose() {
    return this.pause();
  }
}
