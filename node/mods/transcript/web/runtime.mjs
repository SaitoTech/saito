import { TranscriptEngine } from './engine.mjs';
import { TranscriptStore, saveTranscript, withTranscriptLock } from './store.mjs';
import { showModelManager } from './model-manager.mjs';
import { startSelection, readSelection, saveSelection, persistModels } from './models.mjs';

const RECOVERY_WINDOW = 15 * 60 * 1000;
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export class TranscriptRuntime {
  constructor(app, { createOverlay } = {}) {
    this.app = app;
    this.createOverlay = createOverlay;
    this.store = new TranscriptStore();
    this.writes = Promise.resolve();
    this.clearedSessions = new Set();
    this.entries = [];
    this.identifiers = new Map();
    this.identifierAttempts = new Map();
    this.capturing = false;
    this.beforeUnload = (event) => {
      if (!this.capturing && !this.unsaved && !this.recovering_audio) return;
      event.preventDefault();
      event.returnValue = '';
      // Browsers only allow their native warning during unload. If the user stays,
      // finish recognition and offer the file; committed text also survives exit.
      void this.finish('Save your transcript before leaving');
    };
    window.addEventListener('beforeunload', this.beforeUnload);
    if (!document.querySelector('link[data-transcript]')) {
      const link = element('link');
      link.rel = 'stylesheet';
      link.href = '/transcript/transcript.css';
      link.dataset.transcript = 'true';
      document.head.append(link);
    }
  }

  prepareAudio() {
    const context =
      this.engine && !this.engine.closed && !this.engine.stopping
        ? this.engine.context
        : new AudioContext();
    context.resume().catch(() => {});
    return context;
  }

  async configureAndToggle(call, context) {
    if (this.capturing || this.finishing) return this.toggle(call, context);
    if (this.configuring) {
      if (context) void context.close();
      return;
    }
    const generation = this.callGeneration || 0;
    const callId = call.room_obj.call_id;
    this.configuring = true;
    this.modelSetup = new AbortController();
    let handedOff = false;
    try {
      const { chosen, downloaded } = await startSelection();
      if (
        this.modelSetup.signal.aborted ||
        !call.streams.active ||
        generation !== (this.callGeneration || 0) ||
        callId !== call.room_obj.call_id
      ) {
        return;
      }
      if (downloaded) {
        void persistModels();
        saveSelection(chosen);
        this.modelSelection = chosen;
        handedOff = true;
        return await this.toggle(call, context);
      }
      const result = await showModelManager({
        overlay: this.createOverlay?.(),
        start: true,
        initialSelection: chosen,
        autoStart: true,
        signal: this.modelSetup.signal,
        onUse: () => context || this.prepareAudio()
      });
      if (!result) return;
      if (
        this.modelSetup.signal.aborted ||
        !call.streams.active ||
        generation !== (this.callGeneration || 0) ||
        callId !== call.room_obj.call_id
      ) {
        if (result.context !== context) void result.context.close();
        return;
      }
      this.modelSelection = result.selection;
      handedOff = true;
      return await this.toggle(call, result.context);
    } finally {
      if (!handedOff && context) void context.close();
      this.modelSetup = null;
      this.configuring = false;
    }
  }

  openSettings() {
    return showModelManager({ overlay: this.createOverlay?.() });
  }

  // Read recovery data without downloading the speech model or opening a mic.
  recover() {
    if (this.recovery) return this.recovery;
    this.recovery = (async () => {
      try {
        const sessions = (await this.store.sessions()).sort((a, b) => a.startedAt - b.startedAt);
        for (const session of sessions) {
          if (session.id === this.session?.id) continue;
          const entries = await this.store.entries(session.id);
          await this.resolveSpeakers(session, entries);
          const recent =
            !session.endedAt &&
            Date.now() - (session.updatedAt || session.startedAt) < RECOVERY_WINDOW;
          const result = await this.showSave(session, entries, {
            title: recent ? 'Resume interrupted transcript?' : 'Save recovered transcript',
            append: recent && !this.pendingSession
          });
          if (result === 'append') this.pendingSession = { session, entries };
        }
      } catch (error) {
        this.storageFailed = true;
        this.setStatus('Transcript storage is unavailable. Keep this page open until you save.');
        globalThis.siteMessage?.(this.status, 5000);
      }
    })();
    return this.recovery;
  }

  bind(call) {
    if (
      this.call === call &&
      this.session &&
      !this.ended &&
      this.boundCallId === call.room_obj.call_id
    )
      return;
    this.call = call;
    this.boundCallId = call.room_obj.call_id;
    const recovered = this.pendingSession;
    this.pendingSession = null;
    this.session = recovered?.session || {
      id: crypto.randomUUID(),
      callId: call.room_obj.call_id,
      localPublicKey: call.publicKey,
      startedAt: Date.now()
    };
    this.entries = recovered?.entries || [];
    this.entryId = Math.max(0, ...this.entries.map((entry) => entry.id).filter(Number.isFinite));
    this.unsaved = !!recovered;
    this.ended = false;
    this.status = 'Transcription off';
  }

  async toggle(call, context) {
    if (this.capturing) {
      if (context && context !== this.engine?.context) void context.close();
      return this.finish();
    }
    if (this.finishing) {
      if (context && context !== this.engine?.context) void context.close();
      return this.finishing;
    }
    if (this.preparing) {
      if (context) void context.close();
      return;
    }
    const generation = this.callGeneration || 0;
    this.preparing = true;
    try {
      await this.recover();
    } finally {
      this.preparing = false;
    }
    if (!call.streams.active || generation !== (this.callGeneration || 0)) {
      if (context) void context.close();
      return;
    }
    // A failed database must not cause a later call to replace the only copy.
    if (
      this.storageFailed &&
      this.unsaved &&
      this.session &&
      (this.ended || this.boundCallId !== call.room_obj.call_id)
    ) {
      if (context) void context.close();
      await this.finish('Save the previous transcript before starting another');
      return;
    }
    this.bind(call);
    this.deferred_audio = false;
    delete this.session.endedAt;
    this.capturing = this.unsaved = true;
    this.call.streams.setTranscribing?.(true);
    this.touch();
    this.heartbeat = setInterval(() => {
      this.touch();
      void this.lookupIdentifiers([this.call.publicKey, ...this.call.streams.remoteStreams.keys()]);
    }, 10000);
    this.render();
    await this.run(context || this.prepareAudio());
  }

  async run(context) {
    if (this.starting) {
      if (context !== this.engine.context) void context.close();
      return this.starting;
    }
    if (!this.capturing || this.ended) {
      void context.close();
      return;
    }
    this.setStatus('Loading transcription…');
    // Keep the original model/language while this session still has pending audio.
    let pending;
    try {
      pending = await this.store.audioStats(this.session.id);
    } catch (error) {
      this.storageFailed = true;
      this.notice(`Audio storage is unavailable: ${error.message}`);
      void context.close();
      void this.finish('Transcription unavailable — save transcript');
      return;
    }
    if (!pending.count || !this.session.selection)
      this.session.selection = this.modelSelection || readSelection();
    if (!this.capturing || this.ended) {
      void context.close();
      return;
    }
    const engine = new TranscriptEngine({
      context,
      selection: this.session.selection,
      store: this.store,
      session: this.session,
      startedAt: this.session.startedAt,
      speaker: (peer) => this.speakerName(peer === 'local' ? this.call.publicKey : peer),
      onText: (entry) => this.receive(entry, true),
      onStatus: (status) => {
        this.setStatus(status === 'Listening…' ? 'Transcript is being captured' : status);
        if (status.startsWith('Transcript stopped:'))
          void this.finish('Transcription stopped — save transcript');
      },
      onGap: (message) => this.notice(message)
    });
    this.engine = engine;
    void this.lookupIdentifiers([this.call.publicKey, ...this.call.streams.remoteStreams.keys()]);
    engine.updateStream('local', this.call.streams.localStream);
    for (const [peer, stream] of this.call.streams.remoteStreams) engine.updateStream(peer, stream);
    this.starting = engine
      .start()
      .catch((error) => {
        if (!engine.stopping && !this.ended) {
          this.notice(error.message);
          // Do not await a dialog from inside model initialization.
          void this.finish('Transcription unavailable — save transcript');
        }
      })
      .finally(() => {
        this.starting = null;
      });
    return this.starting;
  }

  updateStream(peer, stream) {
    if (this.capturing && peer !== 'presentation')
      void this.lookupIdentifiers([peer === 'local' ? this.call.publicKey : peer]);
    this.engine?.updateStream(peer, stream);
  }
  removePeer(peer) {
    this.engine?.removePeer(peer);
  }

  speakerName(publicKey, fallback = publicKey) {
    if (!publicKey) return fallback;
    const identifier = this.app.keychain?.returnIdentifierByPublicKey?.(publicKey);
    return (
      (identifier && identifier !== publicKey ? identifier : this.identifiers.get(publicKey)) ||
      fallback
    );
  }

  async lookupIdentifiers(publicKeys) {
    const keys = [...new Set(publicKeys)].filter(
      (key) =>
        key &&
        key !== 'presentation' &&
        this.speakerName(key) === key &&
        Date.now() - (this.identifierAttempts.get(key) || 0) >= 60000
    );
    const registry = this.app.modules?.returnModule('Registry');
    if (!keys.length || !registry?.fetchManyIdentifiers) return;
    if (registry.peers?.length === 0 && registry.publicKey !== registry.registry_publickey) return;
    for (const key of keys) this.identifierAttempts.set(key, Date.now());
    // Registry callbacks may never arrive when offline. Saving must still work.
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 3000);
      const done = (identifiers = {}) => {
        for (const key of keys) {
          const name = identifiers[key];
          if (typeof name === 'string' && name && name !== key) this.identifiers.set(key, name);
        }
        // Relabel existing text during the call, not only when saving it.
        if (this.session && this.capturing)
          void this.resolveSpeakers(this.session, this.entries, { lookup: false });
        clearTimeout(timeout);
        resolve();
      };
      try {
        registry.fetchManyIdentifiers(keys, done);
      } catch {
        done();
      }
    });
  }

  entryPublicKey(entry, session) {
    return (
      entry.publicKey ||
      (entry.peer === 'local'
        ? session.localPublicKey || (entry.speaker !== 'local' ? entry.speaker : undefined)
        : entry.peer)
    );
  }

  async resolveSpeakers(session, entries, { lookup = true } = {}) {
    if (lookup)
      await this.lookupIdentifiers(entries.map((entry) => this.entryPublicKey(entry, session)));
    const changed = [];
    for (const entry of entries) {
      const key = this.entryPublicKey(entry, session);
      if (!key) continue;
      const name = this.speakerName(key, entry.speaker);
      if (name !== entry.speaker) {
        entry.speaker = name;
        changed.push({ ...entry });
      }
    }
    // One transaction, even if an identifier arrived after a long conversation.
    if (changed.length)
      this.persist(() => this.store.updateEntries(session.id, changed), session.id);
    await this.writes;
  }

  persist(operation, sessionId = this.session?.id) {
    this.writes = this.writes
      .then(() => {
        if (!this.clearedSessions.has(sessionId)) return operation();
      })
      .catch(() => {
        if (!this.storageFailed)
          globalThis.siteMessage?.('Transcript storage failed. Save before leaving.', 5000);
        this.storageFailed = true;
        this.setStatus('Transcript storage is unavailable. Save the transcript before leaving.');
      });
    return this.writes;
  }

  touch() {
    if (!this.session) return;
    this.session.updatedAt = Date.now();
    const session = { ...this.session };
    this.persist(() => this.store.saveSession(session));
  }

  notice(message) {
    if (!this.session) return;
    this.session.notice = [
      ...new Set([...(this.session.notice || '').split('\n').filter(Boolean), message])
    ].join('\n');
    globalThis.siteMessage?.(message, 5000);
    this.touch();
    this.setStatus(message);
  }

  receive(result, persisted = false) {
    if (!this.session || this.clearedSessions.has(this.session.id)) return;
    const entry = {
      id: persisted ? result.id : ++this.entryId,
      start: result.start,
      end: result.end,
      speaker: this.speakerName(
        result.publicKey || (result.peer === 'local' ? this.session?.localPublicKey : result.peer),
        result.speaker
      ),
      publicKey:
        result.publicKey || (result.peer === 'local' ? this.session?.localPublicKey : result.peer),
      peer: result.peer,
      text: result.text
    };
    this.entries.push(entry);
    this.unsaved = true;
    this.session.updatedAt = Date.now();
    const session = { ...this.session };
    // Commit the text and recovery timestamp atomically.
    if (!persisted) this.persist(() => this.store.append(session, entry));
    else if (entry.speaker !== result.speaker)
      this.persist(() => this.store.updateEntries(session.id, [entry]));
  }

  setStatus(status) {
    this.status = status;
    if (this.statusNode) this.statusNode.textContent = status;
    if (this.finishing_status) this.finishing_status.textContent = status;
  }

  render() {
    const active = this.capturing && !this.ended;
    const container = document.querySelector(
      '#stun-chatbox .video-container-large, #small-audio-chatbox'
    );
    document.querySelectorAll('.transcript-recording-border').forEach((node) => {
      if (node !== container || !active) node.classList.remove('transcript-recording-border');
    });
    container?.classList.toggle('transcript-recording-border', !!active);
    if (container && !container.contains(this.indicator)) {
      this.indicator?.remove();
      this.indicator = element('div', undefined, 'transcript-indicator');
      this.statusNode = element('span', this.status);
      this.indicator.setAttribute('role', 'status');
      this.indicator.append(this.statusNode);
      container.append(this.indicator);
    }
    if (this.indicator) this.indicator.hidden = !active;
    document.querySelectorAll('.transcript-toggle-control').forEach((button) => {
      button.classList.toggle('transcript-active', !!active);
      button.setAttribute('aria-pressed', String(!!active));
      button.setAttribute('aria-label', active ? 'Stop transcription' : 'Transcript');
      button.title = active ? 'Stop transcription and save transcript' : 'Capture transcript';
      const label = button.querySelector('label');
      if (label) label.textContent = active ? 'Transcribing' : 'Transcript';
    });
  }

  finish(title = 'Save call transcript') {
    if (this.finishing) return this.finishing;
    if (!this.session || (!this.capturing && !this.unsaved)) return Promise.resolve();
    this.capturing = false;
    this.call?.streams.setTranscribing?.(false);
    clearInterval(this.heartbeat);
    this.render();
    const preparing = element(
      'dialog',
      undefined,
      'saito-overlay-panel transcript-dialog transcript-preparing'
    );
    preparing.setAttribute('aria-label', 'Preparing Transcription');
    preparing.setAttribute('aria-busy', 'true');
    this.finishing_status = element('p', 'Preparing Transcription');
    preparing.append(this.finishing_status);
    let deferred = false;
    if (this.engine?.pause) {
      const later = element('button', 'Finish later', 'saito-button-secondary');
      later.onclick = () => {
        deferred = true;
        later.disabled = true;
        this.finishing_status.textContent = 'Saving remaining audio…';
        void this.engine?.pause();
      };
      preparing.append(later);
    }
    preparing.addEventListener('cancel', (event) => event.preventDefault());
    document.body.append(preparing);
    preparing.showModal();
    this.session.endedAt = Date.now();
    this.finishing = (async () => {
      await this.engine?.stop();
      this.engine = null;
      this.touch();
      await this.resolveSpeakers(this.session, this.entries, { lookup: false });
      this.setStatus('Transcription off');
      preparing.close();
      preparing.remove();
      if (deferred) {
        this.deferred_audio = true;
        this.setStatus('Audio saved in this browser. Finish it from Transcripts.');
      } else {
        await this.showSave(this.session, this.entries, { title });
      }
    })().finally(() => {
      preparing.close();
      preparing.remove();
      this.finishing = null;
      this.finishing_status = null;
    });
    return this.finishing;
  }

  endCall() {
    this.modelSetup?.abort();
    this.callGeneration = (this.callGeneration || 0) + 1;
    this.ended = true;
    return this.finish();
  }

  async beforeNavigate() {
    this.modelSetup?.abort();
    if (!this.capturing && (!this.unsaved || (this.deferred_audio && !this.storageFailed)))
      return true;
    await this.finish('Save your transcript before leaving');
    return !this.unsaved || !!(this.deferred_audio && !this.storageFailed);
  }

  showSave(session, entries, { title = 'Save transcript', append = false } = {}) {
    const dialog = element(
      'dialog',
      undefined,
      'saito-overlay-panel saito-overlay-form transcript-dialog'
    );
    const header = element('div', undefined, 'saito-overlay-form-header');
    const heading = element('h2', title, 'saito-overlay-form-header-title');
    heading.id = `transcript-dialog-${session.id}`;
    dialog.setAttribute('aria-labelledby', heading.id);
    header.append(heading);
    const content = element('div', undefined, 'saito-overlay-form-text');
    const message = element('p');
    const status = element(
      'p',
      this.storageFailed ? 'Browser storage failed. Save before leaving this page.' : '',
      'transcript-dialog-status'
    );
    status.setAttribute('role', 'status');
    const actions = element('div', undefined, 'saito-button-row transcript-dialog-actions');
    const save = element('button', 'Save To File', 'saito-button-primary');
    const finish = element('button', 'Finish transcription', 'saito-button-primary');
    const later = element('button', 'Resume Later', 'saito-button-secondary');
    const discard = element('button', 'Discard', 'saito-button-secondary');
    finish.hidden = discard.hidden = true;
    let outcome = 'later';
    let processor;
    let busy = false;
    const refresh = async () => {
      const stats = await this.store.audioStats(session.id);
      if (busy) return;
      message.textContent =
        `${entries.length} text segments captured. ` +
        (stats.count
          ? `${Math.ceil(stats.bytes / 64000)} seconds of audio remain unprocessed. Finish transcription to include them. Saving a partial transcript clears the remaining audio and recovery copy from this browser.`
          : 'A recovery copy stays in this browser until saving succeeds.');
      finish.hidden = discard.hidden = !stats.count;
      save.textContent = stats.count ? 'Save partial transcript' : 'Save To File';
    };
    const clearMemory = () => {
      if (this.pendingSession?.session.id === session.id) this.pendingSession = null;
      if (this.session?.id === session.id) {
        clearInterval(this.heartbeat);
        this.unsaved = false;
        this.deferred_audio = false;
        this.entries = [];
        this.entryId = 0;
        this.session = null;
      }
      entries.length = 0;
    };
    const clearRecovery = async () => {
      // Stop queued/late callbacks from recreating a session after deletion.
      this.clearedSessions.add(session.id);
      try {
        await this.writes;
        await this.store.remove(session.id);
        clearMemory();
      } catch (error) {
        this.clearedSessions.delete(session.id);
        throw error;
      }
    };
    save.onclick = async () => {
      if (busy) return;
      busy = true;
      save.disabled = true;
      finish.disabled = discard.disabled = later.disabled = true;
      try {
        await withTranscriptLock(session.id, async () => {
          await this.writes;
          const stats = await this.store.audioStats(session.id);
          const stored = await this.store.entries(session.id);
          const merged = [
            ...new Map([...stored, ...entries].map((entry) => [entry.id, entry])).values()
          ];
          const exportSession = stats.count
            ? {
                ...session,
                notice: [
                  session.notice,
                  `Partial transcript: ${Math.ceil(stats.bytes / 64000)} seconds of audio remain unprocessed.`
                ]
                  .filter(Boolean)
                  .join('\n')
              }
            : session;
          await saveTranscript(exportSession, merged);
          try {
            await clearRecovery();
            outcome = 'saved';
            dialog.close();
            globalThis.siteMessage?.('Transcript saved', 3000);
          } catch {
            status.textContent =
              'File saved, but the browser recovery copy could not be cleared. Try saving again.';
          }
        });
      } catch (error) {
        status.textContent =
          error.name === 'AbortError'
            ? 'Save cancelled. Your transcript has been kept.'
            : `Could not finish saving. Your transcript has been kept; try again. ${error.message}`;
      } finally {
        busy = false;
        save.disabled = false;
        finish.disabled = discard.disabled = later.disabled = false;
      }
    };
    finish.onclick = async () => {
      if (busy) return;
      busy = true;
      save.disabled = finish.disabled = discard.disabled = true;
      later.textContent = 'Finish later';
      processor = new TranscriptEngine({
        store: this.store,
        session,
        recovery: true,
        startedAt: session.startedAt,
        selection: session.selection || readSelection(),
        onText: (entry) => {
          entries.push(entry);
          if (this.session?.id === session.id) this.entries = entries;
        },
        onStatus: (text) => {
          status.textContent = text;
        },
        onGap: (text) => {
          status.textContent = text;
        }
      });
      this.recovering_audio = processor;
      try {
        await processor.start();
        await processor.stop();
      } catch (error) {
        status.textContent = `Could not finish transcription. Saved audio is retained. ${error.message}`;
      } finally {
        await processor.pause();
        processor = null;
        this.recovering_audio = null;
        busy = false;
        save.disabled = finish.disabled = discard.disabled = false;
        later.textContent = 'Resume Later';
        await refresh().catch((error) => {
          status.textContent = error.message;
        });
      }
    };
    later.onclick = async () => {
      if (busy && !processor) return;
      later.disabled = true;
      await processor?.pause();
      dialog.close();
    };
    discard.onclick = async () => {
      if (discard.textContent !== 'Confirm discard') {
        discard.textContent = 'Confirm discard';
        status.textContent = 'This deletes the saved audio and transcript from this browser.';
        return;
      }
      try {
        await withTranscriptLock(session.id, clearRecovery);
        outcome = 'discarded';
        dialog.close();
      } catch (error) {
        status.textContent = error.message;
      }
    };
    actions.append(finish, save);
    if (append) {
      const resume = element('button', 'Append to transcript', 'saito-button-secondary');
      resume.onclick = () => {
        if (busy) return;
        outcome = 'append';
        dialog.close();
      };
      actions.append(resume);
    }
    actions.append(later, discard);
    content.append(message);
    if (session.notice) content.append(element('p', session.notice));
    content.append(status);
    dialog.append(header, content, actions);
    dialog.addEventListener('cancel', (event) => {
      if (busy) {
        event.preventDefault();
        void later.onclick();
      }
    });
    document.body.append(dialog);
    dialog.showModal();
    void refresh().catch((error) => {
      status.textContent = error.message;
    });
    return new Promise((resolve) =>
      dialog.addEventListener(
        'close',
        () => {
          dialog.remove();
          resolve(outcome);
        },
        { once: true }
      )
    );
  }
}
