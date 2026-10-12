// Verify the model manager in the real Saito overlay shell, without model downloads.
const { chromium } = require(process.env.TRANSCRIPT_PLAYWRIGHT || 'playwright');
const express = require('express');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const template = require('../../../../lib/saito/ui/saito-overlay/saito-overlay.template');
const Transcript = require('../../transcript');

(async () => {
  const app = express();
  app.use('/transcript', express.static(path.resolve(__dirname, '../../web')));
  app.use('/saito', express.static(path.resolve(__dirname, '../../../../web/saito')));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.TRANSCRIPT_CHROMIUM,
      args: ['--no-sandbox']
    });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/transcript/`);
    const source = (
      await fs.readFile(
        path.resolve(__dirname, '../../../../lib/saito/ui/saito-overlay/saito-overlay.js'),
        'utf8'
      )
    )
      .replace(
        "const SaitoOverlayTemplate = require('./saito-overlay.template');",
        `const SaitoOverlayTemplate = ${template.toString()};`
      )
      .replace('module.exports = SaitoOverlay;', 'window.TestOverlay = SaitoOverlay;');
    await page.addScriptTag({ content: source });
    await page.addScriptTag({
      content: `window.openTranscriptMenu = function ${Transcript.prototype.showActionMenu.toString()};`
    });
    await page.evaluate(async () => {
      const { TranscriptRuntime } = await import('/transcript/runtime.mjs');
      const app = {
        browser: { addElementToDom: (html) => document.body.insertAdjacentHTML('beforeend', html) }
      };
      window.testRuntime = new TranscriptRuntime(app, {
        createOverlay: () => new TestOverlay(app, {})
      });
      window.testModule = { app, showActionMenu: openTranscriptMenu };
    });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => {
        openTranscriptMenu.call(testModule, testRuntime, {
          streams: { active: true },
          room_obj: { call_id: 'test' }
        });
      });
      await page.getByRole('menuitem', { name: 'Start', exact: true }).waitFor();
      const menuBounds = await page.locator('.transcript-action-menu').boundingBox();
      assert.ok(menuBounds.x >= 0 && menuBounds.x + menuBounds.width <= width + 1);
      const start = page.getByRole('menuitem', { name: 'Start', exact: true });
      await page.mouse.move(0, 0);
      await page.evaluate(() => document.activeElement.blur());
      const background = await start.evaluate((node) => getComputedStyle(node).backgroundColor);
      await start.hover();
      await page.waitForFunction(
        (normal) =>
          getComputedStyle(document.querySelector('[data-action="start"]')).backgroundColor !==
          normal,
        background
      );
      await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
      const panel = page.locator('.saito-overlay .transcript-model-manager');
      await panel.getByRole('heading', { name: 'Transcript models' }).waitFor();
      assert.equal(await page.locator('dialog.transcript-model-manager').count(), 0);
      assert.equal(await panel.getByRole('button', { name: 'Start transcript' }).count(), 0);
      await panel.getByLabel('Speech model', { exact: true }).selectOption('Xenova/whisper-tiny');
      await panel.getByLabel('Spoken language', { exact: true }).selectOption('fr');
      const bounds = await panel.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
      await panel.getByRole('button', { name: 'Close', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Start', exact: true }).waitFor();
      assert.equal(await page.locator('.saito-overlay').count(), 1);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.saito-overlay').count(), 0);
    }
    await page.evaluate(() => {
      window.settings = testRuntime.openSettings();
    });
    await page.keyboard.press('Escape');
    await page.evaluate(() => settings);
    assert.equal(await page.locator('.saito-overlay').count(), 0);
    assert.equal(await page.evaluate(() => testRuntime.capturing), false);
    assert.deepEqual(errors, []);
    console.log(
      'PASS: Saito overlay, desktop/mobile layout, model and language controls, return to options, hover, close/Escape cleanup, no capture from Settings.'
    );
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
