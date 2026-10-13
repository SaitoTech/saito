// Real IndexedDB, Web Locks, audio worklet, and renderer-crash recovery.
// Recognition is deterministic here so queue correctness does not depend on model speed.
const { chromium } = require(process.env.TRANSCRIPT_PLAYWRIGHT || 'playwright');
const express = require('express');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const app = express();
  app.get('/test', (_, response) =>
    response.send('<!doctype html><title>Audio buffer test</title>')
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
    const context = await browser.newContext({ acceptDownloads: true });
    const errors = [];
    context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
    const url = `http://127.0.0.1:${server.address().port}/test`;
    let page = await context.newPage();
    await page.goto(url);
    await page.evaluate(async () => {
      // Simulate an existing installation with text-only recovery data.
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('saito-call-captions', 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('sessions', { keyPath: 'id' });
          request.result
            .createObjectStore('entries', { keyPath: ['sessionId', 'id'] })
            .createIndex('sessionId', 'sessionId');
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['sessions', 'entries'], 'readwrite');
          tx.objectStore('sessions').put({ id: 'legacy', startedAt: 0 });
          tx.objectStore('entries').put({ sessionId: 'legacy', id: 1, text: 'Old text' });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      });
      const { TranscriptStore } = await import('/transcript/store.mjs');
      window.store = new TranscriptStore();
    });
    assert.equal(
      await page.evaluate(async () => (await store.entries('legacy'))[0].text),
      'Old text'
    );
    await page.evaluate(async () => {
      window.session = {
        id: 'buffer',
        localPublicKey: 'alice',
        startedAt: Date.now(),
        selection: { model: 'Xenova/whisper-tiny.en', language: 'auto' }
      };
      window.makeBlock = (i, streamId = 'alice') => ({
        id: `${streamId}-${i}`,
        streamId,
        audio: new Float32Array(16000).fill(0.1),
        start: i * 1000,
        end: (i + 1) * 1000,
        peer: streamId,
        publicKey: streamId,
        speaker: streamId
      });
      for (let i = 0; i < 45; i++) await store.appendAudio(session, makeBlock(i));
      for (let i = 0; i < 5; i++) await store.appendAudio(session, makeBlock(i, 'bob'));
    });
    assert.equal(await page.evaluate(async () => (await store.audioStats('buffer')).count), 50);
    const accounting = await page.evaluate(async () => {
      const batch = await store.audioBatch('buffer');
      const stream = batch.every((b) => b.streamId === 'alice');
      const entry = { id: 'first', text: 'First', start: 0, speaker: 'alice' };
      // Abort after enqueuing the completion operations: neither deletion nor text can commit.
      const transaction = store.transaction.bind(store);
      store.transaction = (names, mode, callback) =>
        transaction(names, mode, (tx) => {
          callback(tx);
          tx.abort();
        });
      let failed = false;
      try {
        await store.completeAudio('buffer', batch, entry);
      } catch {
        failed = true;
      }
      store.transaction = transaction;
      const retained = (await store.audioStats('buffer')).count;
      await store.completeAudio('buffer', batch, entry);
      let duplicateRejected = false;
      try {
        await store.completeAudio('buffer', batch, entry);
      } catch {
        duplicateRejected = true;
      }
      let full = false;
      const bytes = (await store.audioStats('buffer')).bytes;
      try {
        await store.appendAudio({ id: 'other' }, makeBlock(99), bytes);
      } catch {
        full = true;
      }
      return {
        stream,
        failed,
        retained,
        duplicateRejected,
        full,
        text: (await store.entries('buffer')).length,
        other: (await store.audioStats('other')).count
      };
    });
    assert.deepEqual(accounting, {
      stream: true,
      failed: true,
      retained: 50,
      duplicateRejected: true,
      full: true,
      text: 1,
      other: 0
    });

    const mount = async (target, stalled = true) =>
      target.evaluate(async (stalled) => {
        const { TranscriptStore } = await import('/transcript/store.mjs');
        const { TranscriptEngine } = await import('/transcript/engine.mjs');
        window.store = new TranscriptStore();
        window.session = (await store.sessions()).find((item) => item.id === 'buffer');
        window.recognized = [];
        window.sent = [];
        window.Worker = class {
          postMessage(message) {
            if (message.type === 'load')
              queueMicrotask(() => this.onmessage({ data: { type: 'ready' } }));
            else {
              sent.push(message.id);
              if (!stalled)
                setTimeout(
                  () =>
                    this.onmessage({
                      data: {
                        type: 'result',
                        id: message.id,
                        text: `Recovered ${message.id}`
                      }
                    }),
                  5
                );
            }
          }
          terminate() {}
        };
        window.engine = new TranscriptEngine({
          store,
          session,
          recovery: true,
          selection: session.selection,
          startedAt: session.startedAt,
          onText: (entry) => recognized.push(entry),
          onStatus() {},
          onGap() {}
        });
        await engine.start();
      }, stalled);
    await mount(page);
    await page.waitForFunction(() => sent.length === 1);
    const contender = await context.newPage();
    await contender.goto(url);
    const locked = await contender.evaluate(async () => {
      const { withTranscriptLock } = await import('/transcript/store.mjs');
      try {
        await withTranscriptLock('buffer', () => {});
        return false;
      } catch (error) {
        return error.message.includes('another tab');
      }
    });
    assert.equal(locked, true);
    const beforeCrash = await page.evaluate(async () => (await store.audioStats('buffer')).count);
    // Crash the renderer rather than navigate: no unload handler or cleanup can run.
    const cdp = await context.newCDPSession(page);
    await Promise.race([cdp.send('Page.crash').catch(() => {}), page.waitForEvent('crash')]);
    await page.close();
    page = await context.newPage();
    await page.goto(url);
    const crashCount = await page.evaluate(async () => {
      const { TranscriptStore } = await import('/transcript/store.mjs');
      return (await new TranscriptStore().audioStats('buffer')).count;
    });
    assert.equal(crashCount, beforeCrash);
    await mount(page, false);
    await page.evaluate(() => engine.stop());
    const recovered = await page.evaluate(async () => ({
      pending: (await store.audioStats('buffer')).count,
      entries: await store.entries('buffer'),
      sent
    }));
    assert.equal(recovered.pending, 0);
    assert.equal(
      new Set(recovered.entries.map((entry) => entry.id)).size,
      recovered.entries.length
    );
    assert.equal(recovered.entries.length, 5); // 1 committed batch + 3 Alice batches + Bob.
    assert.equal(recovered.entries.filter((entry) => entry.speaker === 'bob').length, 1);

    // A real audio worklet writes checkpoint blocks while the model is stalled.
    await page.evaluate(async () => {
      const { TranscriptEngine } = await import('/transcript/engine.mjs');
      window.Worker = class {
        postMessage(message) {
          if (message.type === 'load')
            queueMicrotask(() => this.onmessage({ data: { type: 'ready' } }));
        }
        terminate() {}
      };
      const append = store.appendAudio.bind(store);
      store.appendAudio = async (session, block, limit) => {
        await append(session, block, limit);
        if (session.id === 'capture' && block.audio.length === 16000)
          window.checkpoint_saved = true;
      };
      const audio = new AudioContext({ sampleRate: 48000 });
      await audio.resume();
      const source = audio.createOscillator();
      const output = audio.createMediaStreamDestination();
      source.connect(output);
      source.start();
      window.capture = new TranscriptEngine({
        context: audio,
        store,
        session: { id: 'capture', localPublicKey: 'alice', startedAt: Date.now() },
        startedAt: Date.now(),
        speaker: () => 'Alice',
        onText() {},
        onStatus() {},
        onGap() {}
      });
      capture.updateStream('local', output.stream);
      await capture.start();
    });
    await page.waitForFunction(() => window.checkpoint_saved);
    await page.evaluate(() => capture.pause());
    const captureStats = await page.evaluate(async () => {
      const blocks = await store.audioBatch('capture');
      return {
        count: blocks.length,
        final: blocks.at(-1).final,
        first: blocks[0].audio.length,
        samples: blocks.reduce((sum, b) => sum + b.audio.length, 0)
      };
    });
    assert.ok(captureStats.count >= 2, JSON.stringify(captureStats));
    assert.equal(captureStats.first, 16000);
    assert.equal(captureStats.final, true);
    assert.ok(captureStats.samples >= 16000);

    // Finish-later preserves audio; a successful partial save clears its recovery data.
    await page.evaluate(async () => {
      const { TranscriptRuntime } = await import('/transcript/runtime.mjs');
      window.Worker = class {
        postMessage(message) {
          if (message.type === 'load')
            queueMicrotask(() => this.onmessage({ data: { type: 'ready' } }));
        }
        terminate() {}
      };
      window.runtime = new TranscriptRuntime({});
      window.showSaveFilePicker = async () => ({
        createWritable: async () => ({
          write: async (text) => {
            window.exported = text;
          },
          close: async () => {}
        })
      });
      const session = (await store.sessions()).find((item) => item.id === 'capture');
      window.saved = runtime.showSave(session, []);
    });
    await page.getByRole('button', { name: 'Finish transcription' }).click();
    await page.waitForFunction(() => runtime.recovering_audio?.current);
    await page.getByRole('button', { name: 'Finish later' }).click();
    await page.evaluate(() => saved);
    assert.ok(await page.evaluate(async () => (await store.audioStats('capture')).count > 0));
    const retainedIds = await page.evaluate(async () =>
      (await store.sessions())
        .map((session) => session.id)
        .filter((id) => id !== 'capture')
        .sort()
    );
    await page.evaluate(async () => {
      const session = (await store.sessions()).find((item) => item.id === 'capture');
      await store.addEntry('capture', {
        id: 'partial',
        start: 0,
        speaker: 'Alice',
        text: 'Saved partial text'
      });
      window.saved = runtime.showSave(session, await store.entries('capture'));
    });
    await page.getByRole('button', { name: 'Save partial transcript' }).click();
    await page.evaluate(() => saved);
    assert.match(await page.evaluate(() => exported), /Partial transcript/);
    assert.match(await page.evaluate(() => exported), /Saved partial text/);
    assert.deepEqual(
      await page.evaluate(async () => ({
        text: await store.entries('capture'),
        audio: await store.audioBatch('capture'),
        count: (await store.audioStats('capture')).count,
        bytes: (await store.audioStats('capture')).bytes,
        globalBytes: (await store.audioStats('*')).bytes
      })),
      { text: [], audio: [], count: 0, bytes: 0, globalBytes: 0 }
    );
    await page.reload();
    const afterReload = await page.evaluate(async () => {
      const { TranscriptRuntime } = await import('/transcript/runtime.mjs');
      const restored = new TranscriptRuntime({});
      const prompts = [];
      restored.showSave = async (session) => {
        prompts.push(session.id);
        return 'later';
      };
      await restored.recover();
      return {
        prompts: prompts.sort(),
        sessions: (await restored.store.sessions()).map((session) => session.id).sort()
      };
    });
    assert.deepEqual(afterReload.sessions, retainedIds);
    assert.deepEqual(afterReload.prompts, retainedIds);
    assert.deepEqual(errors, []);
    console.log(
      'PASS: v1 migration, bounded disk accounting, atomic commits, interleaved speakers, tab locking, renderer-crash recovery, worklet tail flush, partial-save cleanup across reload, and finish later.'
    );
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
