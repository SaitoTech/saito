// Uses real upstream downloads, Cache Storage, and ONNX inference in Chromium.
const { chromium } = require(process.env.TRANSCRIPT_PLAYWRIGHT || 'playwright');
const express = require('express');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

(async () => {
  const app = express();
  app.use('/transcript', express.static(path.resolve(__dirname, '../../web')));
  app.use('/saito', express.static(path.resolve(__dirname, '../../../../web/saito')));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'transcript-model-cache-'));
  let context;
  const launch = () =>
    chromium.launchPersistentContext(profile, {
      headless: true,
      executablePath: process.env.TRANSCRIPT_CHROMIUM,
      args: ['--no-sandbox']
    });
  try {
    context = await launch();
    let page = context.pages()[0] || (await context.newPage());
    const errors = [];
    const downloads = [];
    const watch = (page) => {
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('requestfailed', (request) =>
        console.error('Request failed:', request.url(), request.failure()?.errorText)
      );
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.hostname !== '127.0.0.1') downloads.push(request.url());
        assert.ok(
          !url.pathname.startsWith('/transcript/models/'),
          'Models must not come from the Saito node'
        );
      });
    };
    watch(page);
    const url = `http://127.0.0.1:${server.address().port}/transcript/`;
    await page.goto(url);
    const models = (process.env.TRANSCRIPT_TEST_MODELS || 'tiny.en,tiny').split(',');
    for (const model of models) {
      await page.getByRole('button', { name: 'Manage speech models' }).click();
      await page
        .getByLabel('Speech model', { exact: true })
        .selectOption(`Xenova/whisper-${model}`);
      await page.getByRole('button', { name: 'Download', exact: true }).click();
      await page.getByRole('button', { name: 'Use model', exact: true }).waitFor();
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll('button')].some(
            (button) => button.textContent === 'Use model' && !button.disabled
          ) ||
          /failed|not enough|unavailable/i.test(
            document.querySelector('.transcript-model-manager [role="status"]').textContent
          ),
        null,
        { timeout: 300000 }
      );
      assert.equal(
        await page.getByRole('button', { name: 'Use model', exact: true }).isDisabled(),
        false,
        await page.locator('.transcript-model-manager [role="status"]').textContent()
      );
      if (!model.endsWith('.en'))
        await page.getByLabel('Spoken language', { exact: true }).selectOption('en');
      await page.getByRole('button', { name: 'Use model', exact: true }).click();
      // Close the browser process and reopen the same disk profile and origin.
      await context.close();
      context = await launch();
      page = context.pages()[0] || (await context.newPage());
      watch(page);
      await page.goto(url);
      const before = downloads.length;
      await page.getByRole('button', { name: 'Manage speech models' }).click();
      assert.equal(
        await page.getByLabel('Speech model', { exact: true }).inputValue(),
        `Xenova/whisper-${model}`
      );
      await page.getByText('Downloaded · ready on this device', { exact: true }).waitFor();
      assert.match(
        await page.locator('select[aria-label="Speech model"] option:checked').textContent(),
        /\(downloaded\)$/
      );
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      // A worker must initialize and run with external networking blocked.
      await page.context().route('https://**/*', (route) => route.abort());
      const result = await page.evaluate(async () => {
        const { readSelection } = await import('/transcript/models.mjs');
        const worker = new Worker('/transcript/worker.mjs', { type: 'module' });
        try {
          return await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Worker timed out')), 180000);
            worker.onerror = (error) => {
              clearTimeout(timeout);
              reject(new Error(error.message));
            };
            worker.onmessage = ({ data }) => {
              if (data.type === 'error') {
                clearTimeout(timeout);
                reject(new Error(data.message));
              }
              if (data.type === 'ready')
                worker.postMessage({ type: 'transcribe', id: 1, audio: new Float32Array(16000) });
              if (data.type === 'result') {
                clearTimeout(timeout);
                resolve(data);
              }
            };
            worker.postMessage({ type: 'load', selection: readSelection() });
          });
        } finally {
          worker.terminate();
        }
      });
      assert.equal(result.type, 'result');
      assert.equal(downloads.length, before, 'Cached inference must not fetch remote files');
      await page.context().unroute('https://**/*');
      await page.getByRole('button', { name: 'Manage speech models' }).click();
      await page.getByRole('button', { name: 'Remove download', exact: true }).click();
      await page.getByText('Not downloaded', { exact: true }).waitFor();
      assert.equal(
        await page.getByRole('button', { name: 'Use model', exact: true }).isDisabled(),
        true
      );
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      console.log(
        `PASS: ${model}: direct verified download, browser restart persistence, offline worker inference, removal.`
      );
    }
    assert.ok(downloads.some((url) => url.startsWith('https://huggingface.co/')));
    assert.deepEqual(errors, []);
  } finally {
    await context?.close();
    await fs.rm(profile, { recursive: true, force: true });
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
