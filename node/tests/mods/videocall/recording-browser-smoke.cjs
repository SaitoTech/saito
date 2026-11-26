// Run with TRANSCRIPT_PLAYWRIGHT and TRANSCRIPT_CHROMIUM as in the other Talk browser checks.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const webpack = require('webpack');
const { chromium } = require(process.env.TRANSCRIPT_PLAYWRIGHT || 'playwright');
const full = require('../../../mods/videocall/lib/ui/videocall-full.template');
const popup = require('../../../mods/videocall/lib/ui/videocall-popup.template');

async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'videocall-recording-'));
  let browser;
  try {
    await new Promise((resolve, reject) =>
      webpack(
        {
          mode: 'development',
          devtool: false,
          entry: require.resolve('../../../mods/videocall/lib/call-recorder'),
          output: { path: dir, filename: 'recorder.js', library: 'CallRecorder' }
        },
        (error, stats) =>
          error || stats.hasErrors() ? reject(error || Error(stats.toString())) : resolve()
      )
    );
    browser = await chromium.launch({
      executablePath: process.env.TRANSCRIPT_CHROMIUM,
      args: ['--no-sandbox']
    });
    for (const mode of ['audio', 'video']) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (err) => errors.push(err.message));
      const embedded = mode === 'audio';
      const font = await fs.readFile(
        require.resolve('../../../web/saito/fonts/visuelt-regular.woff2')
      );
      await page.setContent(embedded ? popup(true, true) : full({}));
      await page.addStyleTag({
        content: `@font-face { font-family: TalkTest; src: url(data:font/woff2;base64,${font.toString('base64')}); } body, button { font-family: TalkTest; }`
      });
      await page.addStyleTag({
        path: require.resolve('../../../mods/videocall/web/css/videocall-base.css')
      });
      await page.addStyleTag({
        path: require.resolve('../../../web/saito/css-imports/ui/saito-overlay.css')
      });
      await page.addStyleTag({
        path: require.resolve('../../../mods/videocall/web/css/videocall-full.css')
      });
      await page.addStyleTag({
        content: '.video-container-large, .videobox video { width: 640px; height: 360px; }'
      });
      await page.addScriptTag({ path: path.join(dir, 'recorder.js') });
      await page.evaluate((embedded) => {
        window.siteMessage = (msg) => {
          window.lastMessage = msg;
        };
        window.sprompt = () => 'test-call';
        const context = new AudioContext();
        const tone = context.createOscillator();
        const dest = context.createMediaStreamDestination();
        tone.connect(dest);
        tone.start();
        const canvas = document.createElement('canvas');
        const paint = canvas.getContext('2d');
        paint.fillStyle = 'lime';
        setInterval(() => paint.fillRect(0, 0, canvas.width, canvas.height), 40);
        const input = new MediaStream([
          ...canvas.captureStream(25).getVideoTracks(),
          ...dest.stream.getAudioTracks()
        ]);
        window.input = input;
        window.messages = [];
        const listeners = new EventTarget();
        const app = {
          connection: {
            on: listeners.addEventListener.bind(listeners),
            removeListener: listeners.removeEventListener.bind(listeners),
            emit: (_, tx) => messages.push(tx.msg)
          },
          wallet: {
            createUnsignedTransactionWithDefaultFee: async () => ({ addTo() {}, async sign() {} })
          },
          network: { async propagateTransaction() {} },
          browser: {
            addElementToDom: (html) => document.body.insertAdjacentHTML('beforeend', html),
            escapeHTML: (s) => s
          },
          keychain: { returnUsername: (key) => key }
        };
        const entries = embedded ? [] : [{ kind: 'camera', mediaStream: input }];
        window.addPeerAudio = () => {
          entries.push({ kind: 'camera', mediaStream: input });
          listeners.dispatchEvent(new Event('videocall-stream-added'));
        };
        const mod = {
          app,
          publicKey: 'self',
          room_obj: { call_id: 'room', call_peers: ['peer'] },
          streams: { active: true, list: () => entries },
          CallInterface: { container: document.body }
        };
        const root = document.querySelector('.video-container-large') || document.body;
        root.insertAdjacentHTML(
          'beforeend',
          '<div class="videobox videocall-panel"><video autoplay muted></video></div>'
        );
        root.querySelector('video').srcObject = input;
        const recorder = (window.recorder = new CallRecorder(mod));
        if (!embedded)
          document.querySelector('.imported-actions').innerHTML =
            '<div class="icon_click_area record-control"><label>Record</label></div>';
        recorder.bind(document.querySelector('.record-control'));
      }, embedded);
      if (embedded) {
        await page.click('.record-control');
        await page.click('[data-mode="audio"]');
        await page.evaluate(() => recorder.close());
        assert.ok(await page.evaluate(() => !recorder.recorder && !recorder.countdowns.size));
        await page.waitForFunction(() => messages.some((msg) => msg.data.phase === 'stop'));
        await page.evaluate(() => {
          messages.length = 0;
        });
      }
      await page.click('.record-control');
      await page.click('[data-mode="' + mode + '"]');
      assert.match(
        await page.locator('.videocall-recording-countdown').textContent(),
        /Recording starts in 5/
      );
      assert.equal(await page.evaluate(() => recorder.recorder.state), 'inactive');
      await page.waitForFunction(() => recorder.recorder?.state === 'recording');
      await page.evaluate(() => {
        addPeerAudio();
        recorder.peerJoined('late-peer');
      });
      await page.waitForTimeout(1500);
      const downloaded = page.waitForEvent('download');
      if (embedded) await page.click('.record-control');
      else await page.evaluate(() => Promise.all([recorder.close(), recorder.close()]));
      const file = await downloaded;
      assert.equal(file.suggestedFilename(), 'test-call.' + (embedded ? 'mp3' : 'webm'));
      const bytes = await fs.readFile(await file.path());
      assert.ok(bytes.length > 1024);
      assert.equal(
        bytes.subarray(0, embedded ? 1 : 4).toString('hex'),
        embedded ? 'ff' : '1a45dfa3'
      );
      const decoded = await page.evaluate(
        async ({ data, embedded }) => {
          const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
          if (embedded) {
            const audio = new AudioContext();
            const pcm = await audio.decodeAudioData(bytes.buffer);
            await audio.close();
            return pcm.getChannelData(0).some((sample) => Math.abs(sample) > 0.1);
          }
          const video = document.createElement('video');
          video.muted = true;
          video.src = URL.createObjectURL(new Blob([bytes], { type: 'video/webm' }));
          await video.play();
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, 1, 1);
          return ctx.getImageData(0, 0, 1, 1).data[1] > 20;
        },
        { data: bytes.toString('base64'), embedded }
      );
      assert.ok(decoded, 'recording contains the test tone or green camera tile');
      assert.deepEqual(await page.evaluate(() => messages.map((msg) => msg.data.phase)), [
        'countdown',
        'start',
        'start',
        'stop'
      ]);
      assert.ok(
        await page.evaluate(
          () =>
            messages[2].data.ongoing &&
            input.getTracks().every((track) => track.readyState === 'live')
        )
      );
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {
    await browser?.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
}

main()
  .then(() => console.log('Audio and video recording passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
