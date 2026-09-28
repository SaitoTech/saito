import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const Transcript = require('../../transcript');
const CallInterfaceVideo = require('../../../videocall/lib/components/call-interface-video');

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
  assert.equal(mod.generation, 1);
});
