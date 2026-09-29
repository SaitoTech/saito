import { TranscriptEngine } from './engine.mjs';
import { TranscriptStore, saveTranscript } from './store.mjs';

const RECOVERY_WINDOW = 15 * 60 * 1000;
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export class TranscriptRuntime {
  constructor(app) {
    this.app = app;
    this.store = new TranscriptStore();
    this.writes = Promise.resolve();
    this.entries = [];
    this.identifiers = new Map();
    this.identifierAttempts = new Map();
    this.capturing = false;
    this.beforeUnload = (event) => {
      if (!this.capturing && !this.unsaved) return;
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
    this.entryId = Math.max(0, ...this.entries.map((entry) => entry.id));
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
    delete this.session.endedAt;
    this.capturing = this.unsaved = true;
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
    const engine = new TranscriptEngine({
      context,
      startedAt: this.session.startedAt,
      speaker: (peer) => this.speakerName(peer === 'local' ? this.call.publicKey : peer),
      shouldSave: () => true,
      onText: (entry) => this.receive(entry),
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
    if (changed.length) this.persist(() => this.store.updateEntries(session.id, changed));
    await this.writes;
  }

  persist(operation) {
    this.writes = this.writes.then(operation).catch(() => {
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

  receive(result) {
    const entry = {
      id: ++this.entryId,
      start: result.start,
      end: result.end,
      speaker: this.speakerName(
        result.peer === 'local' ? this.call?.publicKey : result.peer,
        result.speaker
      ),
      publicKey: result.peer === 'local' ? this.call?.publicKey : result.peer,
      peer: result.peer,
      text: result.text
    };
    this.entries.push(entry);
    this.unsaved = true;
    this.session.updatedAt = Date.now();
    const session = { ...this.session };
    // Commit the text and recovery timestamp atomically.
    this.persist(() => this.store.append(session, entry));
  }

  setStatus(status) {
    this.status = status;
    if (this.statusNode) this.statusNode.textContent = status;
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
    clearInterval(this.heartbeat);
    this.render();
    const preparing = element(
      'dialog',
      undefined,
      'saito-overlay-panel transcript-dialog transcript-preparing'
    );
    preparing.setAttribute('aria-label', 'Preparing Transcription');
    preparing.setAttribute('aria-busy', 'true');
    preparing.append(element('p', 'Preparing Transcription'));
    preparing.addEventListener('cancel', (event) => event.preventDefault());
    document.body.append(preparing);
    preparing.showModal();
    this.finishing = (async () => {
      await this.engine?.stop();
      this.engine = null;
      this.session.endedAt = Date.now();
      this.touch();
      await this.resolveSpeakers(this.session, this.entries, { lookup: false });
      this.setStatus('Transcription off');
      preparing.close();
      preparing.remove();
      await this.showSave(this.session, this.entries, { title });
    })().finally(() => {
      preparing.close();
      preparing.remove();
      this.finishing = null;
    });
    return this.finishing;
  }

  endCall() {
    this.callGeneration = (this.callGeneration || 0) + 1;
    this.ended = true;
    return this.finish();
  }

  async beforeNavigate() {
    if (!this.capturing && !this.unsaved) return true;
    await this.finish('Save your transcript before leaving');
    return !this.unsaved;
  }

  showSave(session, entries, { title = 'Save transcript', append = false } = {}) {
    const dialog = element(
      'dialog',
      undefined,
      'saito-overlay-panel saito-overlay-form transcript-dialog'
    );
    const header = element('div', undefined, 'saito-overlay-form-header');
    const heading = element('h2', title, 'saito-overlay-form-header-title');
    header.append(heading);
    const content = element('div', undefined, 'saito-overlay-form-text');
    heading.id = `transcript-dialog-${session.id}`;
    dialog.setAttribute('aria-labelledby', heading.id);
    const message = element(
      'p',
      `${entries.length} text segments captured. A recovery copy stays in this browser until you confirm the file is saved.`
    );
    const status = element(
      'p',
      this.storageFailed ? 'Browser storage failed. Save before leaving this page.' : '',
      'transcript-dialog-status'
    );
    status.setAttribute('role', 'status');
    const actions = element('div', undefined, 'saito-button-row transcript-dialog-actions');
    const save = element('button', 'Save To File', 'saito-button-primary');
    const confirm = element('button', 'I saved the file', 'saito-button-primary');
    confirm.hidden = true;
    const later = element('button', 'Resume Later', 'saito-button-secondary');
    let outcome = 'later';
    const clear = async () => {
      await this.store.remove(session.id);
      if (this.session?.id === session.id) {
        this.unsaved = false;
        this.entries = [];
        this.session = null;
      }
      outcome = 'saved';
      dialog.close();
    };
    save.onclick = async () => {
      save.disabled = true;
      try {
        const confirmed = await saveTranscript(session, entries);
        if (confirmed) await clear();
        else {
          confirm.hidden = false;
          status.textContent =
            'Confirm after the download has successfully saved. If you cancelled it, try Save To File again.';
        }
      } catch (error) {
        status.textContent =
          error.name === 'AbortError'
            ? 'Save cancelled. Your transcript has been kept.'
            : 'Could not finish saving. Your transcript has been kept; try again.';
      } finally {
        save.disabled = false;
      }
    };
    confirm.onclick = async () => {
      try {
        await clear();
      } catch {
        status.textContent = 'File saved, but the browser recovery copy could not be cleared.';
      }
    };
    later.onclick = () => dialog.close();
    actions.append(save, confirm);
    if (append) {
      const resume = element('button', 'Append to transcript', 'saito-button-secondary');
      resume.onclick = () => {
        outcome = 'append';
        dialog.close();
      };
      actions.append(resume);
      message.append(
        document.createTextNode(
          ' This capture was active less than 15 minutes ago. Append when you next turn on Transcript.'
        )
      );
    }
    actions.append(later);
    content.append(message);
    if (session.notice) content.append(element('p', session.notice));
    content.append(status);
    dialog.append(header, content, actions);
    document.body.append(dialog);
    dialog.showModal();
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
