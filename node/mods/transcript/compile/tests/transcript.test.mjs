import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { Segmenter } from '../../web/segmenter.mjs';
import { TranscriptEngine } from '../../web/engine.mjs';
import { AudioBlocks, speechBatch } from '../../web/audio-buffer.mjs';
import { browserLocks, AudioStore } from './buffer-fixtures.mjs';
import { transcriptText, timestamp } from '../../web/store.mjs';

const frame = (volume = 0.1) => new Float32Array(1600).fill(volume);

test('silence produces no transcription; speech retains lead-in and flushes at a pause', () => {
  const chunks = [];
  const segmenter = new Segmenter((chunk) => chunks.push(chunk));
  for (let i = 0; i < 30; i++) segmenter.push(frame(0), i * 100);
  assert.equal(chunks.length, 0);
  for (let i = 30; i < 40; i++) segmenter.push(frame(), i * 100);
  for (let i = 40; i < 45; i++) segmenter.push(frame(0), i * 100);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].start, 2800);
  assert.equal(chunks[0].end, 4500);
  assert.equal(chunks[0].audio.length, 17 * 1600);
});

test('continuous speech is bounded and final speech is flushed once', () => {
  const chunks = [];
  const segmenter = new Segmenter((chunk) => chunks.push(chunk));
  for (let i = 0; i < 43; i++) segmenter.push(frame(), i * 100);
  assert.equal(chunks.length, 1);
  segmenter.flush();
  segmenter.flush();
  assert.equal(chunks.length, 2);
  assert.equal(chunks[1].start, 4000);
});

test('worklet downmixes and resamples 48 kHz stereo to 16 kHz mono', async () => {
  let Processor;
  const frames = [];
  const sandbox = {
    AudioWorkletProcessor: class {
      port = { postMessage: (audio) => frames.push(audio) };
    },
    registerProcessor: (_, processor) => {
      Processor = processor;
    },
    sampleRate: 48000,
    Float32Array
  };
  vm.runInNewContext(
    await readFile(new URL('../../web/audio-worklet.js', import.meta.url), 'utf8'),
    sandbox
  );
  const processor = new Processor();
  processor.process([[new Float32Array(4800).fill(0.2), new Float32Array(4800).fill(0.4)]]);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].length, 1600);
  assert.ok(Math.abs(frames[0][0] - 0.3) < 0.00001);
});

test('transcripts merge speakers chronologically with timestamps and gap notices', () => {
  const text = transcriptText({ callId: 'call', startedAt: 0, notice: 'Speech skipped.' }, [
    { id: 1, start: 2000, speaker: 'Bob', text: 'Second' },
    { id: 2, start: 1000, speaker: 'Alice', text: 'First' }
  ]);
  assert.ok(text.indexOf('Alice: First') < text.indexOf('Bob: Second'));
  assert.match(text, /\[00:00:01\] Alice: First/);
  assert.match(text, /Speech skipped/);
  assert.equal(timestamp(360000000), '100:00:00');
});

function engine(t, options = {}) {
  browserLocks(t);
  const instance = new TranscriptEngine({
    store: new AudioStore(),
    session: { id: 'test', localPublicKey: 'alice' },
    onStatus() {},
    onGap() {},
    onText() {},
    speaker: (peer) => peer,
    startedAt: Date.now(),
    ...options
  });
  instance.worker = {
    postMessage: (message) => queueMicrotask(() => instance.resolve_inference('Recognized')),
    terminate() {}
  };
  instance.ready = true;
  t.after(() => instance.pause());
  return instance;
}

const block = (start, streamId = 'alice', volume = 0.1) => ({
  audio: new Float32Array(16000).fill(volume),
  start,
  end: start + 1000,
  streamId
});

test('capture checkpoints every second and flushes a final partial second', () => {
  const saved = [];
  const blocks = new AudioBlocks((chunk) => saved.push(chunk));
  for (let i = 0; i < 15; i++) blocks.push(frame(), i * 100);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].audio.length, 16000);
  blocks.flush(true);
  assert.equal(saved[1].audio.length, 8000);
  assert.equal(saved[1].final, true);
  assert.equal(saved[1].start, 1000);
});

test('worklet flush acknowledges and retains its sub-frame tail', async () => {
  let Processor;
  const messages = [];
  vm.runInNewContext(
    await readFile(new URL('../../web/audio-worklet.js', import.meta.url), 'utf8'),
    {
      AudioWorkletProcessor: class {
        port = { postMessage: (data) => messages.push(data) };
      },
      registerProcessor: (_, processor) => {
        Processor = processor;
      },
      sampleRate: 48000,
      Float32Array
    }
  );
  const processor = new Processor();
  processor.process([[new Float32Array(600).fill(0.2)]]);
  processor.port.onmessage({ data: { type: 'flush' } });
  assert.equal(messages[0].length, 200);
  assert.equal(messages[1].type, 'flushed');
  processor.process([[new Float32Array(4800).fill(0.2)]]);
  assert.equal(messages.length, 2);
});

test('persisted silence is gated while speech spanning checkpoints remains intact', () => {
  assert.equal(speechBatch([block(0, 'alice', 0)]), null);
  const result = speechBatch([block(0), block(1000)]);
  assert.equal(result.audio.length, 32000);
  assert.equal(result.start, 0);
  assert.equal(result.end, 2000);
});

test('more than thirty seconds of pending audio is retained and drains on hangup', async (t) => {
  const instance = engine(t);
  instance.ready = false;
  for (let i = 0; i < 45; i++) instance.enqueue('local', block(i * 1000));
  await instance.writes;
  assert.equal(instance.store.blocks.length, 45);
  assert.equal(instance.pending_bytes, 0);
  assert.equal(instance.store.blocks[0].publicKey, 'alice');
  instance.ready = true;
  await instance.stop();
  assert.equal(instance.store.blocks.length, 0);
  assert.equal(instance.store.text.length, 4);
  assert.equal(instance.closed, true);
});

test('audio survives worker failure and text commit failure', async (t) => {
  const instance = engine(t, { recovery: true });
  instance.ready = false;
  instance.enqueue('alice', block(0));
  await instance.writes;
  instance.store.completeAudio = async () => {
    throw new Error('disk full');
  };
  instance.ready = true;
  await instance.stop();
  assert.equal(instance.store.blocks.length, 1);
  assert.equal(instance.failure.message, 'disk full');
  assert.equal(instance.store.text.length, 0);
});

test('finish later interrupts inference without deleting its source audio', async (t) => {
  const instance = engine(t, { recovery: true });
  instance.worker.postMessage = () => {};
  instance.enqueue('alice', block(0));
  await instance.writes;
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(instance.current);
  await instance.pause();
  assert.equal(instance.store.blocks.length, 1);
  assert.equal(instance.closed, true);
  assert.equal(instance.failure, undefined);
});

test('successful empty recognition consumes audio without creating text', async (t) => {
  const instance = engine(t, { recovery: true });
  instance.worker.postMessage = () => queueMicrotask(() => instance.resolve_inference(''));
  instance.enqueue('alice', block(0));
  await instance.stop();
  assert.equal(instance.store.blocks.length, 0);
  assert.equal(instance.store.text.length, 0);
});

test('storage failure stops capture and reports an uncommitted-audio gap', async (t) => {
  const notices = [];
  const instance = engine(t, { onGap: (text) => notices.push(text) });
  instance.store.appendAudio = async () => {
    throw new Error('quota');
  };
  instance.enqueue('alice', block(0));
  await instance.writes;
  await instance.pause();
  assert.match(notices.join(' '), /quota.*Uncommitted audio/);
  assert.equal(instance.pending_bytes, 0);
  assert.equal(instance.closed, true);
});

test('stalled storage has a bounded memory queue and stops capture visibly', async (t) => {
  const instance = engine(t);
  let release;
  instance.store.appendAudio = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  instance.enqueue('alice', block(0));
  await new Promise((resolve) => setImmediate(resolve));
  // Fill the pending-write allowance without allocating an unbounded stream.
  instance.enqueue('alice', { ...block(1000), audio: new Float32Array((8 * 1024 * 1024) / 4) });
  assert.match(instance.failure.message, /cannot keep up/);
  assert.equal(instance.pending_bytes, 64000);
  release();
  await instance.pause();
});

test('model startup failure reports the stop, retains audio, and releases the session lock', async (t) => {
  const statuses = [];
  const instance = engine(t, { onStatus: (text) => statuses.push(text), recovery: true });
  instance.ready = false;
  instance.enqueue('alice', block(0));
  await instance.writes;
  const previous = globalThis.Worker;
  globalThis.Worker = class {
    postMessage() {
      queueMicrotask(() => this.onmessage({ data: { type: 'error', message: 'Model missing' } }));
    }
    terminate() {}
  };
  t.after(() => {
    globalThis.Worker = previous;
  });
  await assert.rejects(instance.start(), /Model missing/);
  assert.equal(instance.store.blocks.length, 1);
  assert.equal(instance.closed, true);
  assert.ok(statuses.some((text) => text.startsWith('Transcript stopped:')));
  await navigator.locks.request('saito-transcript:test', { ifAvailable: true }, (lock) =>
    assert.ok(lock)
  );
});

test('pausing during the initial storage write cannot start a late worker', async (t) => {
  const instance = engine(t);
  instance.ready = false;
  let saved;
  instance.store.saveSession = () =>
    new Promise((resolve) => {
      saved = resolve;
    });
  const previous = globalThis.Worker;
  globalThis.Worker = class {
    constructor() {
      assert.fail('Capture was already paused');
    }
  };
  t.after(() => {
    globalThis.Worker = previous;
  });
  const starting = instance.start();
  await new Promise((resolve) => setImmediate(resolve));
  await instance.pause();
  saved();
  await starting;
  assert.equal(instance.closed, true);
});
