// Real WebRTC tracks, StreamManager events, Web Audio, and IndexedDB.
// Stub recognition only: a result requires non-silent audio to pass speech gating.
const { chromium } = require(process.env.TRANSCRIPT_PLAYWRIGHT || 'playwright');
const express = require('express');
const assert = require('node:assert/strict');
const path = require('node:path');
const StreamManager = require('../../../mods/videocall/lib/StreamManager');

(async () => {
  const app = express();
  app.get('/test', (_, response) =>
    response.send('<!doctype html><title>Remote transcript capture</title>')
  );
  app.use('/transcript', express.static(path.resolve(__dirname, '../../../mods/transcript/web')));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.TRANSCRIPT_CHROMIUM,
      args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
    });
    for (const { lateJoin, presenting = false, staleMute = false } of [
      { lateJoin: false, presenting: false },
      { lateJoin: true, presenting: false },
      { lateJoin: false, presenting: true },
      { lateJoin: true, presenting: true },
      { lateJoin: false, staleMute: true },
      { lateJoin: true, staleMute: true }
    ]) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/test`);
      await page.addScriptTag({ content: `window.StreamManager = ${StreamManager.toString()}` });
      await page.evaluate(async ({ lateJoin, presenting, staleMute }) => {
        const { TranscriptEngine } = await import('/transcript/engine.mjs');
        const { TranscriptStore } = await import('/transcript/store.mjs');
        const handlers = new Map();
        const app = {
          connection: {
            on(name, callback) {
              if (!handlers.has(name)) handlers.set(name, []);
              handlers.get(name).push(callback);
            },
            emit(name, ...args) {
              for (const callback of handlers.get(name) || []) callback(...args);
            }
          }
        };
        window.manager = new StreamManager(
          app,
          { screen_share: presenting ? 'bob' : false },
          { audio: true }
        );
        const audio = new AudioContext({ sampleRate: 48000 });
        await audio.resume();
        const tone = (frequency) => {
          const source = audio.createOscillator();
          source.frequency.value = frequency;
          const output = audio.createMediaStreamDestination();
          source.connect(output);
          source.start();
          return output.stream;
        };
        window.entries = [];
        window.gaps = [];
        window.Worker = class {
          postMessage(message) {
            queueMicrotask(() =>
              this.onmessage({
                data:
                  message.type === 'load'
                    ? { type: 'ready' }
                    : { type: 'result', id: message.id, text: 'Detected speech' }
              })
            );
          }
          terminate() {}
        };
        const startedAt = Date.now();
        window.engine = new TranscriptEngine({
          context: audio,
          store: new TranscriptStore(),
          session: { id: 'rtc', localPublicKey: 'alice', startedAt },
          startedAt,
          speaker: (peer) => (peer === 'local' ? 'Alice' : 'Bob'),
          onText: (entry) => entries.push(entry),
          onStatus() {},
          onGap: (message) => gaps.push(message)
        });
        app.connection.on('videocall-stream', (peer, stream) => {
          if (lateJoin) engine.updateStream(peer, stream);
        });
        engine.updateStream('local', tone(440));
        if (lateJoin) await engine.start();
        window.sender = new RTCPeerConnection();
        window.receiver = new RTCPeerConnection();
        sender.onicecandidate = (event) =>
          event.candidate && receiver.addIceCandidate(event.candidate);
        receiver.onicecandidate = (event) =>
          event.candidate && sender.addIceCandidate(event.candidate);
        receiver.ontrack = (event) => {
          // Chromium can leave this flag true after offer negotiation even
          // while Web Audio receives speech. Reproduce that state consistently.
          if (staleMute && event.track.kind === 'audio')
            Object.defineProperty(event.track, 'muted', { get: () => true });
          app.connection.emit('stun-track-event', 'bob', event);
        };
        // Talk sends streamless tracks. Do not render a call video/audio element:
        // remote transcription must work even when the call player is absent.
        window.remoteMicrophone = tone(660).getAudioTracks()[0];
        if (staleMute) remoteMicrophone.enabled = false;
        sender.addTrack(remoteMicrophone);
        if (presenting) {
          // Talk associates screen-share tracks with a MediaStream, while the
          // participant's microphone/camera tracks are sent without one.
          const presentation = tone(880);
          sender.addTrack(presentation.getAudioTracks()[0], presentation);
        }
        await sender.setLocalDescription(await sender.createOffer());
        await receiver.setRemoteDescription(sender.localDescription);
        await receiver.setLocalDescription(await receiver.createAnswer());
        await sender.setRemoteDescription(receiver.localDescription);
        if (!lateJoin) {
          for (const [peer, stream] of manager.remoteStreams) engine.updateStream(peer, stream);
          await engine.start();
        }
      }, { lateJoin, presenting, staleMute });
      if (staleMute) {
        // The sender's real microphone mute still supplies silence. Ignoring a
        // stale receiver-side flag must not invent speech while the sender is muted.
        await page.waitForFunction(() => entries.some((entry) => entry.speaker === 'Alice'));
        assert.equal(
          await page.evaluate(() => entries.some((entry) => entry.speaker === 'Bob')),
          false
        );
        await page.evaluate(() => { remoteMicrophone.enabled = true; });
      }
      await page.waitForFunction(
        () =>
          entries.some((entry) => entry.speaker === 'Alice') &&
          entries.some((entry) => entry.speaker === 'Bob'),
        null,
        { timeout: 20000 }
      );
      const result = await page.evaluate(async () => {
        const capturedPeers = [...engine.sources.keys()].sort();
        const receivedPeers = [...manager.remoteStreams.keys()].sort();
        const playback = engine.sources.get('bob').playback;
        const muted = playback.muted;
        const playing = !playback.paused;
        await engine.stop();
        const saved = await engine.store.entries('rtc');
        const remoteTrack = manager.remoteStreams.get('bob').getAudioTracks()[0];
        const result = {
          speakers: [...new Set(saved.map((entry) => entry.speaker))].sort(),
          keys: [...new Set(saved.map((entry) => entry.publicKey))].sort(),
          muted,
          playing,
          released: playback.paused && playback.srcObject === null,
          remoteTrackLive: remoteTrack.readyState === 'live',
          capturedPeers,
          receivedPeers,
          gaps
        };
        sender.close();
        receiver.close();
        return result;
      });
      assert.deepEqual(result, {
        speakers: ['Alice', 'Bob'],
        keys: ['alice', 'bob'],
        muted: true,
        playing: true,
        released: true,
        remoteTrackLive: true,
        capturedPeers: ['bob', 'local'],
        receivedPeers: presenting ? ['bob', 'presentation'] : ['bob'],
        gaps: []
      });
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(
      'PASS: local and real WebRTC remote audio captured for existing and late peers, including presenters and stale remote mute flags; presentation audio excluded, separate speaker labels, muted playback, and cleanup without stopping the call track.'
    );
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
