// Playwright/Chromium integration, with optional local English WAV recognition.
const { chromium } = require(process.env.TRANSCRIPT_PLAYWRIGHT || 'playwright');
const express = require('express');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const app = express();
  app.use('/transcript', express.static(path.resolve(__dirname, '../../web')));
  app.use('/call-css', express.static(path.resolve(__dirname, '../../../videocall/web/css')));
  if (process.env.TRANSCRIPT_AUDIO_FIXTURE)
    app.get('/fixture.wav', (_, response) =>
      response.sendFile(path.resolve(process.env.TRANSCRIPT_AUDIO_FIXTURE))
    );
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.TRANSCRIPT_CHROMIUM,
      args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
    });
    const page = await browser.newPage({ acceptDownloads: true });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) => {
      const hostname = new URL(route.request().url()).hostname;
      assert.ok(
        hostname === '127.0.0.1' ||
          (process.env.TRANSCRIPT_AUDIO_FIXTURE &&
            (hostname === 'huggingface.co' || hostname.endsWith('.hf.co')))
      );
      return route.continue();
    });
    const url = `http://127.0.0.1:${server.address().port}/transcript/`;
    await page.goto(url);
    const mount = async () =>
      page.evaluate(async () => {
        document.body.innerHTML =
          '<div id="stun-chatbox"><div class="video-container-large screenrecord-recording-border" style="position:relative;width:600px;height:400px"></div><div class="stun-toolbar-shell"><div class="control-list"><button class="icon_click_area transcript-toggle-control"><label>Transcript</label><i></i></button></div></div></div>';
        const { TranscriptRuntime } = await import('/transcript/runtime.mjs');
        window.call = {
          publicKey: 'alice',
          room_obj: { call_id: 'browser-test' },
          streams: { active: true, remoteStreams: new Map() }
        };
        window.runtime = new TranscriptRuntime({
          keychain: { returnIdentifierByPublicKey: (key) => (key === 'alice' ? 'Alice' : 'Bob') }
        });
      });
    await mount();
    await page.addStyleTag({ url: `${url}../call-css/videocall-video-interface.css` });
    await page.addStyleTag({
      content:
        ':root { --saito-red: #ff3434; --saito-white: white; --stun-noir-surface-high: #222; --stun-noir-text: #aaa; }'
    });
    await page.evaluate(async (recognize) => {
      if (recognize) {
        const { MODELS, downloadModel } = await import('/transcript/models.mjs');
        await downloadModel(MODELS[0]);
        const context = new AudioContext({ sampleRate: 48000 });
        await context.resume();
        const local = context.createMediaStreamDestination();
        const remote = context.createMediaStreamDestination();
        window.fixture = { context, local, remote };
        call.streams.localStream = local.stream;
        call.streams.remoteStreams.set('bob', remote.stream);
        await runtime.toggle(call, context);
        if (!runtime.engine?.ready) throw new Error(runtime.status);
        const audio = await context.decodeAudioData(
          await (await fetch('/fixture.wav')).arrayBuffer()
        );
        for (const [output, offset] of [
          [local, 0.1],
          [remote, 5]
        ]) {
          const source = context.createBufferSource();
          source.buffer = audio;
          source.connect(output);
          source.start(context.currentTime + offset, 0, Math.min(audio.duration, 4));
        }
      } else {
        runtime.run = async () => runtime.setStatus('Transcript is being captured');
        await runtime.toggle(call, { close: async () => {} });
        runtime.receive({ start: 0, speaker: 'Alice', text: 'Hello from Alice' });
        runtime.receive({ start: 1000, speaker: 'Bob', text: 'Hello from Bob' });
      }
    }, !!process.env.TRANSCRIPT_AUDIO_FIXTURE);
    await page.waitForFunction(
      () =>
        runtime.entries.some((entry) => entry.speaker === 'Alice') &&
        runtime.entries.some((entry) => entry.speaker === 'Bob'),
      null,
      { timeout: 180000 }
    );
    assert.equal(await page.locator('.transcript-indicator').isVisible(), true);
    assert.match(await page.locator('.transcript-indicator').textContent(), /being captured/);
    assert.doesNotMatch(await page.locator('.transcript-indicator').textContent(), /Alice|Bob/);
    assert.equal(await page.locator('.transcript-recording-border').count(), 1);
    // The call controls animate their colors; wait for the active style to settle.
    await page.waitForFunction(() => {
      const button = document.querySelector('.transcript-toggle-control');
      return (
        getComputedStyle(button).backgroundColor === 'rgb(255, 52, 52)' &&
        getComputedStyle(button.querySelector('i')).color === 'rgb(255, 255, 255)'
      );
    });
    assert.equal(
      await page
        .locator('.transcript-toggle-control')
        .evaluate((button) => getComputedStyle(button).backgroundColor),
      'rgb(255, 52, 52)'
    );
    assert.equal(
      await page
        .locator('.transcript-toggle-control i')
        .evaluate((icon) => getComputedStyle(icon).color),
      'rgb(255, 255, 255)'
    );
    await page.evaluate(() => runtime.writes);
    // Reload with the unload listener removed to simulate a crash (no endCall).
    await page.evaluate(() => window.removeEventListener('beforeunload', runtime.beforeUnload));
    await page.reload();
    await mount();
    await page.evaluate(() => {
      window.recovered = runtime.recover();
    });
    await page.getByRole('button', { name: 'Append to transcript' }).click();
    await page.evaluate(async () => {
      await recovered;
      runtime.run = async () => {};
      await runtime.toggle(call, { close: async () => {} });
      runtime.receive({ start: 10000, speaker: 'Alice', text: 'Appended after recovery' });
      await runtime.writes;
      window.finished = runtime.endCall();
    });
    await page.getByRole('button', { name: 'Save To File' }).waitFor();
    assert.equal(await page.locator('.transcript-recording-border').count(), 0);
    assert.equal(await page.locator('.screenrecord-recording-border').count(), 1);
    // Exercise the ordinary-download branch with automatic confirmation.
    await page.evaluate(() => {
      window.showSaveFilePicker = undefined;
    });
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save To File' }).click();
    const download = await downloaded;
    const text = await fs.readFile(await download.path(), 'utf8');
    assert.match(text, /Alice:/);
    assert.match(text, /Bob:/);
    assert.match(text, /Appended after recovery/);
    await page.evaluate(() => finished);
    assert.equal(await page.getByRole('button', { name: 'I saved the file' }).count(), 0);
    assert.equal(await page.evaluate(async () => (await runtime.store.sessions()).length), 0);
    // A successful save must also stay cleared after a real page reload.
    await page.reload();
    await mount();
    await page.evaluate(() => runtime.recover());
    assert.equal(await page.locator('.transcript-dialog').count(), 0);
    assert.equal(await page.evaluate(async () => (await runtime.store.sessions()).length), 0);
    assert.equal(
      await page.evaluate(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
      false
    );
    // Older data must prompt for saving on open, without offering append.
    await page.evaluate(async () => {
      await runtime.store.append(
        {
          id: 'old',
          callId: 'old-call',
          startedAt: Date.now() - 2000000,
          updatedAt: Date.now() - 1000000
        },
        { id: 1, start: 0, speaker: 'Bob', text: 'Old transcript' }
      );
    });
    await page.reload();
    await mount();
    await page.evaluate(() => {
      void runtime.recover();
    });
    await page
      .getByRole('heading', { name: 'Save recovered transcript' })
      .waitFor({ state: 'attached' });
    assert.equal(await page.locator('.transcript-dialog').evaluate((dialog) => dialog.open), true);
    assert.equal(await page.getByRole('button', { name: 'Append to transcript' }).count(), 0);
    await page.getByRole('button', { name: 'Resume Later' }).click();
    assert.equal(await page.evaluate(async () => (await runtime.store.sessions()).length), 1);
    assert.deepEqual(errors, []);
    console.log(
      'PASS: capture indicator, independent recording border, IndexedDB crash recovery, append, download confirmation, cleanup, and old transcript prompt.'
    );
    if (process.env.TRANSCRIPT_AUDIO_FIXTURE)
      console.log('PASS: local speech model recognized both speakers.');
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
