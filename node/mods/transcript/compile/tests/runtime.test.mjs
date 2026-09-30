import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { TranscriptRuntime } from '../../web/runtime.mjs';
import { saveTranscript } from '../../web/store.mjs';
import { browserLocks } from './buffer-fixtures.mjs';

function setup(t) {
  browserLocks(t);
  const dom = new JSDOM(
    '<div id="stun-chatbox"><div class="video-container-large screenrecord-recording-border"></div><button class="transcript-toggle-control"><label>Transcript</label></button></div>'
  );
  const previous = { document: globalThis.document, window: globalThis.window };
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new dom.window.Event('close'));
  };
  const runtime = new TranscriptRuntime({
    keychain: { returnIdentifierByPublicKey: (key) => key }
  });
  const sessions = new Map();
  const entries = new Map();
  runtime.store = {
    audioStats: async () => ({ count: 0, bytes: 0 }),
    sessions: async () => [...sessions.values()],
    entries: async (id) => structuredClone(entries.get(id) || []),
    saveSession: async (session) => sessions.set(session.id, { ...session }),
    append: async (session, entry) => {
      sessions.set(session.id, { ...session });
      entries.set(session.id, [...(entries.get(session.id) || []), entry]);
    },
    updateEntries: async (id, updates) => {
      entries.set(
        id,
        (entries.get(id) || []).map(
          (previous) => updates.find((entry) => entry.id === previous.id) || previous
        )
      );
    },
    remove: async (id) => {
      sessions.delete(id);
      entries.delete(id);
    }
  };
  const call = {
    publicKey: 'alice',
    room_obj: { call_id: 'first' },
    streams: { active: true, remoteStreams: new Map() }
  };
  t.after(() => {
    clearInterval(runtime.heartbeat);
    Object.assign(globalThis, previous);
    dom.window.close();
  });
  return { runtime, call, sessions, entries, dom };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
const button = (text) =>
  [...document.querySelectorAll('button')].find((node) => node.textContent === text);
const context = () => ({ close: async () => {}, resume: async () => {} });

test('capture UI contains status only and its border coexists with recording', (t) => {
  const { runtime, call } = setup(t);
  runtime.bind(call);
  runtime.capturing = true;
  runtime.setStatus('Transcript is being captured');
  runtime.receive({ start: 0, end: 1000, speaker: '<img src=x>', text: 'Private speech' });
  runtime.render();
  assert.equal(runtime.indicator.hidden, false);
  assert.doesNotMatch(runtime.indicator.textContent, /Private speech|img/);
  const container = document.querySelector('.video-container-large');
  assert.ok(container.classList.contains('transcript-recording-border'));
  runtime.capturing = false;
  runtime.render();
  assert.ok(container.classList.contains('screenrecord-recording-border'));
  assert.ok(!container.classList.contains('transcript-recording-border'));
});

test('turning off drains final speech, commits it, and prompts to save', async (t) => {
  const { runtime, call, sessions, entries } = setup(t);
  const transcriptionStates = [];
  call.streams.setTranscribing = (enabled) => transcriptionStates.push(enabled);
  runtime.run = async () => {};
  await runtime.toggle(call, context());
  assert.deepEqual(transcriptionStates, [true]);
  const id = runtime.session.id;
  runtime.engine = {
    stop: async () => runtime.receive({ start: 1000, speaker: 'Alice', text: 'Last words' })
  };
  const stopping = runtime.toggle(call);
  assert.deepEqual(transcriptionStates, [true, false]);
  await tick();
  assert.equal(entries.get(id)[0].text, 'Last words');
  assert.ok(sessions.get(id).endedAt);
  assert.ok(button('Save To File'));
  button('Resume Later').click();
  await stopping;
  assert.equal(runtime.unsaved, true);
  assert.ok(sessions.has(id));
});

test('ending the call offers one save dialog even if stop is also requested', async (t) => {
  const { runtime, call } = setup(t);
  runtime.bind(call);
  runtime.capturing = runtime.unsaved = true;
  const ending = runtime.endCall();
  const stopping = runtime.finish();
  assert.equal(ending, stopping);
  await tick();
  assert.equal(document.querySelectorAll('dialog').length, 1);
  button('Resume Later').click();
  await ending;
});

test('a recent interrupted transcript can be appended without resetting IDs or timestamps', async (t) => {
  const { runtime, call, sessions, entries } = setup(t);
  const old = {
    id: 'old',
    callId: 'first',
    startedAt: Date.now() - 3600000,
    updatedAt: Date.now() - 1000
  };
  sessions.set('old', old);
  entries.set('old', [{ id: 7, start: 1000, text: 'Recovered' }]);
  const recovering = runtime.recover();
  await tick();
  button('Append to transcript').click();
  await recovering;
  runtime.run = async () => {};
  await runtime.toggle(call, context());
  runtime.receive({ start: 3601000, text: 'New words' });
  await runtime.writes;
  assert.equal(runtime.session.startedAt, old.startedAt);
  assert.deepEqual(
    entries.get('old').map((entry) => entry.id),
    [7, 8]
  );
});

for (const [name, session] of [
  ['older than 15 minutes', { updatedAt: Date.now() - 900001 }],
  ['exactly 15 minutes', { updatedAt: Date.now() - 900000 }],
  ['already stopped', { updatedAt: Date.now(), endedAt: Date.now() }]
])
  test(`recovery offers saving only for a transcript ${name}`, async (t) => {
    const { runtime, sessions } = setup(t);
    sessions.set('old', { id: 'old', startedAt: 0, ...session });
    const recovering = runtime.recover();
    await tick();
    assert.equal(button('Append to transcript'), undefined);
    assert.ok(button('Save To File'));
    button('Resume Later').click();
    await recovering;
    assert.ok(sessions.has('old'));
  });

test('successful file close clears recovery; a cancelled picker retains it', async (t) => {
  const { runtime, call, sessions } = setup(t);
  runtime.bind(call);
  runtime.unsaved = true;
  runtime.touch();
  await runtime.writes;
  const id = runtime.session.id;
  let cancelled = true;
  let written = '';
  let closed = false;
  window.showSaveFilePicker = async () => {
    if (cancelled) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
    return {
      createWritable: async () => ({
        write: async (text) => {
          written = text;
        },
        close: async () => {
          closed = true;
        },
        abort: async () => {}
      })
    };
  };
  const saving = runtime.showSave(runtime.session, [
    { id: 1, start: 0, speaker: 'Alice', text: 'Hello' }
  ]);
  await button('Save To File').onclick();
  assert.ok(sessions.has(id));
  assert.equal(runtime.unsaved, true);
  cancelled = false;
  await button('Save To File').onclick();
  await saving;
  assert.match(written, /Alice: Hello/);
  assert.equal(closed, true);
  assert.equal(sessions.has(id), false);
  assert.equal(runtime.unsaved, false);
});

test('failed writes never count as a successful file save', async (t) => {
  setup(t);
  window.showSaveFilePicker = async () => ({
    createWritable: async () => ({
      write: async () => {
        throw new Error('disk full');
      },
      abort: async () => {}
    })
  });
  await assert.rejects(saveTranscript({ startedAt: 0 }, []), /disk full/);
});

test('download saves confirm automatically; failed dispatch keeps the transcript', async (t) => {
  const { runtime, call, sessions, dom } = setup(t);
  runtime.bind(call);
  runtime.unsaved = true;
  runtime.touch();
  await runtime.writes;
  const id = runtime.session.id;
  let fail = true;
  let downloads = 0;
  dom.window.HTMLAnchorElement.prototype.click = function () {
    if (fail) throw new Error('Download failed');
    assert.match(this.download, /^saito-call-.*\.txt$/);
    downloads++;
  };
  const saving = runtime.showSave(runtime.session, []);
  assert.equal(button('I saved the file'), undefined);
  await button('Save To File').onclick();
  assert.ok(sessions.has(id));
  assert.equal(runtime.unsaved, true);
  assert.match(document.querySelector('.transcript-dialog-status').textContent, /Could not finish/);
  fail = false;
  await button('Save To File').onclick();
  assert.equal(await saving, 'saved');
  assert.equal(downloads, 1);
  assert.equal(sessions.has(id), false);
  assert.equal(runtime.unsaved, false);
  assert.equal(document.querySelector('dialog'), null);
});

test('navigation stays on page when user keeps the unsaved transcript', async (t) => {
  const { runtime, call, dom } = setup(t);
  runtime.bind(call);
  runtime.capturing = runtime.unsaved = true;
  const navigating = runtime.beforeNavigate();
  await tick();
  button('Resume Later').click();
  assert.equal(await navigating, false);
  const event = new dom.window.Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  await tick();
  button('Resume Later').click();
  await runtime.finishing;
});

test('storage failure preserves recognized text in memory for saving', async (t) => {
  const { runtime, call } = setup(t);
  runtime.bind(call);
  runtime.store.append = async () => {
    throw new Error('quota');
  };
  runtime.receive({ start: 0, text: 'Retained' });
  await runtime.writes;
  assert.equal(runtime.entries[0].text, 'Retained');
  assert.equal(runtime.storageFailed, true);
  assert.equal(runtime.unsaved, true);
});

test('cancelling model initialization stops the worker without a failure notice', async (t) => {
  const { runtime, call } = setup(t);
  const previous = globalThis.Worker;
  let terminated = false;
  globalThis.Worker = class {
    postMessage() {}
    terminate() {
      terminated = true;
    }
  };
  t.after(() => {
    globalThis.Worker = previous;
  });
  const loading = runtime.toggle(call, {
    ...context(),
    audioWorklet: { addModule: async () => {} }
  });
  await tick();
  const stopping = runtime.toggle(call);
  await tick();
  button('Resume Later').click();
  await Promise.all([loading, stopping]);
  assert.equal(terminated, true);
  assert.equal(runtime.session.notice, undefined);
});

test('ending a call while recovery is open prevents a delayed capture start', async (t) => {
  const { runtime, call, sessions } = setup(t);
  sessions.set('old', { id: 'old', startedAt: 0, updatedAt: Date.now() });
  let closed = false;
  runtime.run = async () => assert.fail('Call already ended');
  const starting = runtime.toggle(call, {
    close: async () => {
      closed = true;
    }
  });
  await tick();
  await runtime.endCall();
  button('Resume Later').click();
  await starting;
  assert.equal(runtime.capturing, false);
  assert.equal(closed, true);
});

test('storage failure cannot replace an unsaved previous call with a new one', async (t) => {
  const { runtime, call } = setup(t);
  runtime.bind(call);
  runtime.receive({ start: 0, text: 'Only in memory' });
  await runtime.writes;
  runtime.storageFailed = runtime.ended = true;
  const original = runtime.session.id;
  const starting = runtime.toggle({ ...call, room_obj: { call_id: 'second' } }, context());
  await tick();
  button('Resume Later').click();
  await starting;
  assert.equal(runtime.session.id, original);
  assert.equal(runtime.entries[0].text, 'Only in memory');
});

test('preparing overlay stays visible until recognition drains, then gives way to save', async (t) => {
  const { runtime, call } = setup(t);
  runtime.bind(call);
  runtime.capturing = runtime.unsaved = true;
  let drain;
  runtime.engine = {
    stop: () =>
      new Promise((resolve) => {
        drain = resolve;
      })
  };
  const finishing = runtime.finish();
  const overlay = document.querySelector('.transcript-preparing');
  assert.equal(overlay.open, true);
  assert.equal(overlay.textContent, 'Preparing Transcription');
  assert.equal(button('Save To File'), undefined);
  drain();
  await tick();
  assert.equal(document.querySelector('.transcript-preparing'), null);
  assert.ok(button('Save To File'));
  button('Resume Later').click();
  await finishing;
});

test('Registry identifiers replace both local and remote keys before saving and in recovery storage', async (t) => {
  const { runtime, call, entries } = setup(t);
  runtime.bind(call);
  runtime.receive({ peer: 'local', speaker: 'alice', start: 0, text: 'Hello' });
  runtime.receive({ peer: 'bob', speaker: 'bob', start: 10, text: 'Hi' });
  runtime.receive({ peer: 'unknown', speaker: 'unknown', start: 20, text: 'Unregistered' });
  await runtime.writes;
  let queried;
  runtime.app.modules = {
    returnModule: () => ({
      fetchManyIdentifiers: (keys, callback) => {
        queried = keys;
        callback({ alice: 'alice@saito', bob: 'bob@saito' });
      }
    })
  };
  await runtime.resolveSpeakers(runtime.session, runtime.entries);
  assert.deepEqual(queried, ['alice', 'bob', 'unknown']);
  assert.deepEqual(
    runtime.entries.map((entry) => entry.speaker),
    ['alice@saito', 'bob@saito', 'unknown']
  );
  assert.deepEqual(
    entries.get(runtime.session.id).map((entry) => entry.speaker),
    ['alice@saito', 'bob@saito', 'unknown']
  );
});

test('cached identifiers need no Registry request and unavailable Registry retains speaker labels', async (t) => {
  const { runtime, call } = setup(t);
  runtime.bind(call);
  runtime.app.keychain.returnIdentifierByPublicKey = (key) => (key === 'bob' ? 'bob@saito' : '');
  runtime.app.modules = {
    returnModule: () => ({ fetchManyIdentifiers: () => assert.fail('Already resolved') })
  };
  await runtime.lookupIdentifiers(['bob']);
  assert.equal(runtime.speakerName('bob'), 'bob@saito');
  runtime.app.modules = {
    returnModule: () => ({
      fetchManyIdentifiers: () => {
        throw new Error('offline');
      }
    })
  };
  await runtime.lookupIdentifiers(['unknown']);
  assert.equal(runtime.speakerName('unknown'), 'unknown');
});

test('finishing uses cached speaker identifiers without waiting for a network request', async (t) => {
  const { runtime, call } = setup(t);
  runtime.bind(call);
  runtime.receive({ peer: 'bob', speaker: 'bob', start: 0, text: 'Already recognized' });
  runtime.app.modules = {
    returnModule: () => ({
      fetchManyIdentifiers: () => assert.fail('Saving must not query Registry')
    })
  };
  const finishing = runtime.finish();
  await tick();
  assert.ok(button('Save To File'));
  button('Resume Later').click();
  await finishing;
});

test('identifiers arriving during capture update existing persisted text in one transaction', async (t) => {
  const { runtime, call, entries } = setup(t);
  runtime.bind(call);
  runtime.capturing = true;
  for (let i = 0; i < 20; i++)
    runtime.receive({ peer: 'bob', speaker: 'bob', start: i * 1000, text: 'Hello' });
  await runtime.writes;
  let transactions = 0;
  const update = runtime.store.updateEntries;
  runtime.store.updateEntries = (...args) => {
    transactions++;
    return update(...args);
  };
  runtime.app.modules = {
    returnModule: () => ({ fetchManyIdentifiers: (keys, done) => done({ bob: 'bob@saito' }) })
  };
  await runtime.lookupIdentifiers(['bob']);
  await runtime.writes;
  assert.equal(transactions, 1);
  assert.ok(entries.get(runtime.session.id).every((entry) => entry.speaker === 'bob@saito'));
  assert.equal(runtime.capturing, true);
});

test('unregistered speakers do not trigger repeated lookups on every audio update', async (t) => {
  const { runtime } = setup(t);
  let requests = 0;
  runtime.app.modules = {
    returnModule: () => ({
      fetchManyIdentifiers: (keys, done) => {
        requests++;
        done({});
      }
    })
  };
  await runtime.lookupIdentifiers(['unknown']);
  await runtime.lookupIdentifiers(['unknown']);
  assert.equal(requests, 1);
});

test('finish later waits for capture storage and permits navigation with recoverable audio', async (t) => {
  const { runtime, call } = setup(t);
  runtime.bind(call);
  runtime.capturing = runtime.unsaved = true;
  let done;
  const stopped = new Promise((resolve) => {
    done = resolve;
  });
  runtime.engine = {
    stop: () => stopped,
    pause: () => {
      done();
      return stopped;
    }
  };
  const leaving = runtime.beforeNavigate();
  assert.ok(button('Finish later'));
  button('Finish later').click();
  assert.equal(await leaving, true);
  assert.equal(runtime.unsaved, true);
  assert.equal(document.querySelector('dialog'), null);
});

test('pending-audio storage failure stops capture without leaving an active indicator', async (t) => {
  const { runtime, call } = setup(t);
  runtime.store.audioStats = async () => {
    throw new Error('database unavailable');
  };
  await runtime.toggle(call, context());
  await tick();
  assert.equal(runtime.capturing, false);
  assert.equal(runtime.storageFailed, true);
  assert.ok(button('Save To File'));
  button('Resume Later').click();
  await runtime.finishing;
});

test('saving a partial transcript clears its audio, text and resume state only', async (t) => {
  const { runtime, call, sessions, entries } = setup(t);
  runtime.bind(call);
  runtime.receive({ id: 1, start: 0, speaker: 'Alice', text: 'Saved words' });
  await runtime.writes;
  const session = runtime.session;
  runtime.pendingSession = { session, entries: runtime.entries };
  runtime.deferred_audio = true;
  runtime.heartbeat = setInterval(() => runtime.touch(), 10000);
  sessions.set('other', { id: 'other', startedAt: 0 });
  const audio = new Map([[session.id, { count: 2, bytes: 128000 }]]);
  runtime.store.audioStats = async (id) => audio.get(id) || { count: 0, bytes: 0 };
  const remove = runtime.store.remove;
  runtime.store.remove = async (id) => {
    await remove(id);
    audio.delete(id);
  };
  let exported;
  window.showSaveFilePicker = async () => ({
    createWritable: async () => ({
      write: async (text) => {
        exported = text;
      },
      close: async () => {}
    })
  });
  const saving = runtime.showSave(session, runtime.entries);
  await tick();
  assert.match(
    document.querySelector('.saito-overlay-form-text').textContent,
    /clears the remaining audio/
  );
  await button('Save partial transcript').onclick();
  assert.equal(await saving, 'saved');
  assert.match(exported, /Saved words/);
  assert.match(exported, /Partial transcript/);
  assert.equal(sessions.has(session.id), false);
  assert.equal(entries.has(session.id), false);
  assert.equal(audio.has(session.id), false);
  assert.equal(sessions.has('other'), true);
  assert.equal(runtime.unsaved, false);
  assert.equal(runtime.deferred_audio, false);
  assert.equal(runtime.session, null);
  assert.equal(runtime.pendingSession, null);
  assert.deepEqual(runtime.entries, []);
});

test('save drains outstanding writes and prevents late callbacks resurrecting recovery', async (t) => {
  const { runtime, call, sessions } = setup(t);
  runtime.bind(call);
  runtime.receive({ start: 0, speaker: 'Alice', text: 'Saved' });
  await runtime.writes;
  const session = { ...runtime.session };
  let releaseWrite;
  let writing;
  const beganWriting = new Promise((resolve) => {
    writing = resolve;
  });
  window.showSaveFilePicker = async () => ({
    createWritable: async () => ({
      write: async () => {},
      close: async () => {
        runtime.persist(async () => {
          writing();
          await new Promise((resolve) => {
            releaseWrite = resolve;
          });
          await runtime.store.saveSession(session);
        }, session.id);
      }
    })
  });
  const saving = runtime.showSave(runtime.session, runtime.entries);
  const click = button('Save To File').onclick();
  await beganWriting;
  await tick();
  assert.equal(button('Resume Later').disabled, true);
  assert.equal(sessions.has(session.id), true);
  releaseWrite();
  await click;
  assert.equal(await saving, 'saved');
  assert.equal(sessions.has(session.id), false);
  await runtime.persist(() => runtime.store.saveSession(session), session.id);
  await runtime.resolveSpeakers(
    session,
    [{ id: 1, peer: 'bob', speaker: 'Old name', text: 'Saved' }],
    { lookup: false }
  );
  assert.equal(sessions.has(session.id), false);
  assert.deepEqual(await runtime.store.entries(session.id), []);
});

test('a failed partial save retains both pending audio and recovery state', async (t) => {
  const { runtime, call, sessions } = setup(t);
  runtime.bind(call);
  runtime.receive({ start: 0, text: 'Keep this' });
  await runtime.writes;
  const id = runtime.session.id;
  runtime.store.audioStats = async () => ({ count: 1, bytes: 64000 });
  window.showSaveFilePicker = async () => ({
    createWritable: async () => ({
      write: async () => {
        throw new Error('disk full');
      },
      abort: async () => {}
    })
  });
  const saving = runtime.showSave(runtime.session, runtime.entries);
  await tick();
  await button('Save partial transcript').onclick();
  assert.equal(sessions.has(id), true);
  assert.equal(runtime.unsaved, true);
  assert.equal((await runtime.store.audioStats(id)).count, 1);
  assert.equal(runtime.clearedSessions.has(id), false);
  button('Resume Later').click();
  await saving;
});
