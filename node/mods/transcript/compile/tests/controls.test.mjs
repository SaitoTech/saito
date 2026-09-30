import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const Transcript = require('../../transcript');
const CallInterfaceVideo = require('../../../videocall/lib/components/call-interface-video');
const StreamManager = require('../../../videocall/lib/StreamManager');
const SaitoVideoBox = require('../../../../lib/saito/ui/saito-videobox/video-box');

test('transcription status appears beside the name and survives video box recreation', (t) => {
  const dom = new JSDOM('<div class="videos"></div>');
  const previousDocument = globalThis.document;
  globalThis.document = dom.window.document;
  t.after(() => {
    globalThis.document = previousDocument;
    dom.window.close();
  });
  const app = {
    connection: new EventEmitter(),
    keychain: { returnIdentifierByPublicKey: (key) => key },
    browser: {
      addElementToClass: (html, className) =>
        document.querySelector(`.${className}`).insertAdjacentHTML('beforeend', html)
    }
  };
  const mod = { publicKey: 'alice' };
  mod.streams = new StreamManager(app, mod, {});
  // Receive status before the corresponding video has rendered.
  mod.streams.updateTranscriptionStatus('bob', true);
  const makeBox = () => {
    const box = new SaitoVideoBox(app, mod, 'bob', 'videos');
    box.attachEvents = () => {};
    box.render();
    return box;
  };
  let box = makeBox();
  const notice = () => document.querySelector('#stream_bob .peer-transcription-status');
  assert.equal(notice().hidden, false);
  assert.equal(notice().textContent, 'Transcribing');
  assert.equal(notice().previousElementSibling.textContent, 'bob');
  assert.ok(notice().closest('.video-call-info'));
  box.destroy();
  box = makeBox();
  assert.equal(notice().hidden, false);
  mod.streams.updateTranscriptionStatus('bob', false);
  assert.equal(notice().hidden, true);
  box.destroy();
  assert.equal(app.connection.listenerCount('peer-toggle-transcription-status'), 0);
});

test('capture status is broadcast on changes and repeated for newly connected peers', async (t) => {
  const app = { connection: new EventEmitter() };
  const sent = [];
  const mod = {
    publicKey: 'alice',
    room_obj: { call_peers: ['bob'] },
    stun: { peers: new Map([['bob', {}]]) },
    sendOffChainMessage: async (request, data) => sent.push({ request, data })
  };
  const streams = new StreamManager(app, mod, {});
  t.after(() => Object.values(streams.monitors).forEach(clearInterval));
  streams.setTranscribing(true);
  app.connection.emit('stun-connection-connected', 'bob');
  streams.setTranscribing(false);
  app.connection.emit('stun-connection-connected', 'bob');
  assert.deepEqual(
    sent
      .filter(({ request }) => request === 'toggle-transcription')
      .map(({ data }) => data.enabled),
    [true, true, false, false]
  );
  assert.equal(streams.transcribingPeers.has('alice'), false);
  streams.active = false;
  streams.setTranscribing(true);
  assert.equal(streams.transcribingPeers.has('alice'), false);
});

test('video call controls expose one Transcript toggle without loading the model', (t) => {
  const dom = new JSDOM('<div class="control-list imported-actions"></div>');
  const previousDocument = globalThis.document;
  globalThis.document = dom.window.document;
  t.after(() => {
    globalThis.document = previousDocument;
    dom.window.close();
  });
  const app = { BROWSER: 1, connection: new EventEmitter() };
  const transcript = new Transcript(app);
  app.modules = { mods: [transcript] };
  const controls = Object.assign(Object.create(CallInterfaceVideo.prototype), {
    app,
    mod: { room_obj: { call_id: 'test-call', call_peers: [] } },
    remote_streams: new Map()
  });
  controls.insertActions();
  const cc = document.querySelector('[aria-label="Transcript"]');
  assert.ok(cc.querySelector('.fa-file-lines'));
  assert.equal(cc.getAttribute('role'), 'button');
  assert.ok(document.querySelector('[aria-label="Transcript"] .fa-file-lines'));
  assert.equal(document.querySelectorAll('.transcript-toggle-control').length, 1);
  assert.equal(transcript.loading, null);
  assert.equal(transcript.runtime, null);
  controls.insertActions();
  assert.equal(document.querySelectorAll('.transcript-toggle-control').length, 1);
});

test('module forwards call lifecycle and navigation to the transcript runtime', async () => {
  const app = { BROWSER: 1, connection: new EventEmitter() };
  const mod = new Transcript(app);
  const calls = [];
  mod.runtime = {
    updateStream: (...args) => calls.push(['stream', ...args]),
    removePeer: (peer) => calls.push(['left', peer]),
    endCall: async () => calls.push(['ended']),
    beforeNavigate: async () => false
  };
  const stream = {};
  app.connection.emit('videocall-stream', 'bob', stream);
  app.connection.emit('videocall-peer-left', 'bob');
  const completion = [];
  app.connection.emit('videocall-ended', completion);
  await Promise.all(completion);
  const navigation = [];
  app.connection.emit('saito-before-navigate', navigation);
  assert.deepEqual(await Promise.all(navigation), [false]);
  assert.deepEqual(calls, [['stream', 'bob', stream], ['left', 'bob'], ['ended']]);
  assert.equal(mod.generation, 2);
});

test('inactive Transcript opens Start/Settings menu; active Transcript stops directly', async (t) => {
  const dom = new JSDOM('<button class="transcript-toggle-control">Transcript</button>');
  const previous = { document: globalThis.document, window: globalThis.window };
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  const app = {
    BROWSER: 1,
    connection: new EventEmitter(),
    browser: { addElementToDom: (html) => document.body.insertAdjacentHTML('beforeend', html) }
  };
  const call = { streams: { active: true }, room_obj: { call_id: 'call' } };
  app.modules = { returnModule: () => call };
  const mod = new Transcript(app);
  const events = [];
  const audio = {};
  const runtime = {
    prepareAudio: () => {
      events.push('audio');
      return audio;
    },
    configureAndToggle: async (activeCall, context) => {
      assert.equal(activeCall, call);
      assert.equal(context, audio);
      events.push('start');
    },
    openSettings: async () => events.push('settings'),
    toggle: async () => events.push('stop'),
    endCall: async () => {}
  };
  mod.runtime = runtime;
  mod.loadRuntime = async () => runtime;
  t.after(async () => {
    mod.actionOverlay?.close();
    await new Promise((resolve) => setTimeout(resolve, 25));
    Object.assign(globalThis, previous);
    dom.window.close();
  });
  const action = mod.respondTo('call-actions', call.room_obj)[0];
  await action.callback();
  assert.deepEqual(events, []);
  assert.deepEqual(
    [...document.querySelectorAll('[role="menuitem"]')].map((node) => node.textContent),
    ['Start', 'Settings']
  );
  await document.querySelector('[data-action="settings"]').onclick();
  assert.deepEqual(events, ['settings']);
  assert.ok(document.querySelector('.transcript-action-menu'));
  await action.callback();
  document.querySelector('[data-action="start"]').click();
  assert.deepEqual(events, ['settings', 'audio', 'start']);
  runtime.capturing = true;
  await action.callback();
  assert.equal(events.at(-1), 'stop');
  assert.equal(document.querySelector('.transcript-action-menu'), null);
  runtime.capturing = false;
  await action.callback();
  const completion = [];
  app.connection.emit('videocall-ended', completion);
  await Promise.all(completion);
  assert.equal(document.querySelector('.transcript-action-menu'), null);
});

test('server blocks legacy model routes while allowing the client model module', async (t) => {
  const express = require('express');
  const serverApp = express();
  const mod = new Transcript({ BROWSER: 0 });
  mod.webServer({}, serverApp, { static: () => (_req, res) => res.send('runtime asset') });
  const server = serverApp.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal(
    (await fetch(`${base}/transcript/models/Xenova/whisper-tiny.en/config.json`)).status,
    404
  );
  const module = await fetch(`${base}/transcript/models.mjs`);
  assert.equal(module.status, 200);
  assert.equal(await module.text(), 'runtime asset');
});
