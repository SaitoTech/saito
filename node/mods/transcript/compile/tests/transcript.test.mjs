import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { Segmenter } from '../../web/segmenter.mjs';
import { TranscriptEngine } from '../../web/engine.mjs';
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

function engine(options = {}) {
  return new TranscriptEngine({
    context: { close: async () => {} },
    onStatus: () => {},
    onGap: () => {},
    onText: () => {},
    speaker: (peer) => peer,
    shouldSave: () => true,
    startedAt: 0,
    ...options
  });
}

test('queue keeps speaker identity and save choice; bounds overload without silently losing speech', () => {
  const gaps = [];
  let save = true;
  const instance = engine({ onGap: (message) => gaps.push(message), shouldSave: () => save });
  instance.current = { id: 0 }; // An inference is already running.
  instance.enqueue('Alice', { audio: new Float32Array(16000 * 4), start: 5000 });
  save = false;
  instance.enqueue('Bob', { audio: new Float32Array(16000 * 4), start: 1000 });
  assert.equal(instance.queue[0].speaker, 'Bob');
  assert.equal(instance.queue[0].save, false);
  assert.equal(instance.queue[1].save, true);
  for (let i = 0; i < 20; i++)
    instance.enqueue('Alice', { audio: new Float32Array(64000), start: 10000 });
  assert.ok(instance.queue.length <= 7);
  assert.ok(gaps.length > 0);
  instance.dispose();
});

test('disconnect drains pending recognition before terminating the worker', async () => {
  const instance = engine();
  let terminated = false;
  instance.worker = {
    terminate: () => {
      terminated = true;
    }
  };
  instance.current = { id: 1 };
  const stopped = instance.stop();
  assert.equal(terminated, false);
  instance.current = null;
  instance.pump();
  await stopped;
  assert.equal(terminated, true);
  assert.equal(instance.closed, true);
});

test('cleanup disconnects processors without stopping call media tracks', () => {
  const instance = engine();
  const track = { stop: () => assert.fail('Must not stop the call microphone') };
  let disconnected = 0;
  instance.sources.set('local', {
    stream: { removeEventListener: () => {}, getTracks: () => [track] },
    source: { disconnect: () => disconnected++ },
    node: { disconnect: () => disconnected++, port: { close: () => {} } },
    silence: { disconnect: () => disconnected++ },
    segmenter: { flush: () => {} }
  });
  instance.dispose();
  assert.equal(disconnected, 3);
});

test('pending adjacent speech from one speaker is processed in one bounded batch', () => {
  const instance = engine();
  const messages = [];
  instance.worker = { postMessage: (message) => messages.push(message), terminate() {} };
  instance.current = { id: 0 };
  for (let i = 0; i < 4; i++)
    instance.enqueue('Alice', {
      audio: new Float32Array(64000).fill(i + 1),
      start: i * 4000,
      end: (i + 1) * 4000
    });
  instance.current = null;
  instance.pump();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].audio.length, 16000 * 12);
  assert.equal(instance.current.start, 0);
  assert.equal(instance.current.end, 12000);
  assert.equal(instance.queue.length, 1);
  assert.equal(messages[0].audio[0], 1);
  assert.equal(messages[0].audio[64000], 2);
  assert.equal(messages[0].audio[128000], 3);
  instance.dispose();
});

test('catch-up preserves short pauses and never mixes speakers', () => {
  const instance = engine();
  instance.worker = { postMessage() {}, terminate() {} };
  instance.current = { id: 0 };
  instance.enqueue('Alice', { audio: new Float32Array(16000).fill(1), start: 0, end: 1000 });
  instance.enqueue('Alice', { audio: new Float32Array(16000).fill(2), start: 1500, end: 2500 });
  instance.enqueue('Bob', { audio: new Float32Array(16000), start: 2500, end: 3500 });
  instance.current = null;
  instance.pump();
  assert.equal(instance.current.audio.length, 40000);
  assert.equal(instance.current.audio[16000], 0);
  assert.equal(instance.current.audio[24000], 2);
  assert.equal(instance.queue[0].peer, 'Bob');
  instance.dispose();
});

test('recognition starts immediately when idle; batching adds no waiting period', () => {
  const instance = engine();
  let sent = 0;
  instance.worker = {
    postMessage() {
      sent++;
    },
    terminate() {}
  };
  instance.enqueue('Alice', { audio: new Float32Array(16000), start: 0, end: 1000 });
  assert.equal(sent, 1);
  assert.equal(instance.queue.length, 0);
  instance.dispose();
});

test('catch-up tolerates audio delivery jitter without dropping samples', () => {
  const instance = engine();
  instance.worker = { postMessage() {}, terminate() {} };
  instance.current = { id: 0 };
  instance.enqueue('Alice', { audio: new Float32Array(64000).fill(1), start: 0, end: 4000 });
  instance.enqueue('Alice', { audio: new Float32Array(64000).fill(2), start: 3995, end: 7995 });
  instance.current = null;
  instance.pump();
  assert.equal(instance.current.audio.length, 128000);
  assert.equal(instance.current.audio[63999], 1);
  assert.equal(instance.current.audio[64000], 2);
  assert.equal(instance.queue.length, 0);
  instance.dispose();
});
