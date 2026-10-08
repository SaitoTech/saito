const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const PhotoTemplate = require('./photo.template');

class Photo {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, true);
    this.overlay.class = 'saito-overlay saitosign-overlay saitosign-photo-host';
    this.hooks = {};
    this.stream = null;
    this.image = '';
    this.mirror = false;
    this.mode = 'opening';
    this.shot = 0;
    this.settled = false;
  }

  open(hooks = {}) {
    this.hooks = hooks;
    this.settled = false;
    this.image = '';
    this.overlay.show(PhotoTemplate(), () => {
      if (this.settled) {
        return;
      }
      this.settled = true;
      this.release();
      if (this.hooks.onClose) {
        this.hooks.onClose();
      }
    });
    this.attachEvents();
    this.startCamera();
  }

  attachEvents() {
    const root = this.root();
    if (!root || root.dataset.bound === '1') {
      return;
    }
    root.dataset.bound = '1';
    root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-photo-action]');
      if (!button || button.disabled) {
        return;
      }
      const action = button.dataset.photoAction;
      if (action === 'capture') {
        this.capture();
      } else if (action === 'accept') {
        this.accept();
      } else if (action === 'reject') {
        this.reject();
      } else if (action === 'again') {
        this.again();
      } else if (action === 'close') {
        this.dismiss();
      }
    });
  }

  async startCamera() {
    if (this.settled) {
      return;
    }
    this.mode = 'opening';
    this.mirror = false;
    this.setStatus('Opening the camera…');
    this.setActions([]);
    const video = this.video();
    const still = this.still();
    if (video) {
      video.hidden = true;
      video.classList.remove('mirror');
    }
    if (still) {
      still.hidden = true;
      still.removeAttribute('src');
    }
    this.setCount('');

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      this.fail('This browser cannot open a camera.');
      return;
    }
    if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) {
      this.fail('The camera can only be opened on a secure page.');
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user' }
      });
      this.mirror = true;
    } catch (err) {
      if (this.settled) {
        stopStream(stream);
        return;
      }
      if (denied(err)) {
        this.fail('Camera access was denied. Allow the camera in the browser to take a photo.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        this.mirror = false;
      } catch (second) {
        if (!this.settled) {
          this.fail(cameraMessage(second));
        }
        return;
      }
    }

    if (this.settled || this.mode !== 'opening') {
      stopStream(stream);
      return;
    }

    this.stream = stream;
    if (video) {
      video.srcObject = stream;
      video.hidden = false;
      video.classList.toggle('mirror', this.mirror);
      try {
        await video.play();
      } catch (err) {}
    }
    this.mode = 'preview';
    this.setStatus('Look at the camera, then capture.');
    this.setActions([['capture', 'Capture', 'primary']]);
  }

  capture() {
    if (this.settled || this.mode !== 'preview') {
      return;
    }
    const shot = ++this.shot;
    this.mode = 'countdown';
    this.setStatus('');
    this.setActions([]);
    this.runCountdown(shot);
  }

  async runCountdown(shot) {
    for (const step of [3, 2, 1]) {
      if (this.settled || this.shot !== shot || this.mode !== 'countdown') {
        return;
      }
      this.setCount(String(step));
      await wait(1000);
    }
    if (this.settled || this.shot !== shot || this.mode !== 'countdown') {
      return;
    }
    this.setCount('');
    const image = grabFrame(this.video(), this.mirror);
    this.stopCamera();
    if (!image) {
      this.fail('The photograph could not be captured.');
      return;
    }
    this.image = image;
    this.mode = 'review';
    const still = this.still();
    const video = this.video();
    if (video) {
      video.hidden = true;
    }
    if (still) {
      still.src = image;
      still.hidden = false;
    }
    this.setStatus('Use Photograph?', true);
    this.setActions([
      ['reject', 'Reject', ''],
      ['again', 'Take Again', ''],
      ['accept', 'Accept', 'primary']
    ]);
  }

  again() {
    if (this.settled) {
      return;
    }
    this.shot += 1;
    this.image = '';
    this.stopCamera();
    this.startCamera();
  }

  accept() {
    if (this.settled || !this.image) {
      return;
    }
    const image = this.image;
    this.settled = true;
    this.release();
    this.overlay.close();
    if (this.hooks.onAccept) {
      this.hooks.onAccept(image);
    }
  }

  reject() {
    if (this.settled) {
      return;
    }
    this.image = '';
    this.settled = true;
    this.release();
    this.overlay.close();
    if (this.hooks.onReject) {
      this.hooks.onReject();
    }
  }

  dismiss() {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.release();
    this.overlay.close();
    if (this.hooks.onClose) {
      this.hooks.onClose();
    }
  }

  fail(message) {
    if (this.settled) {
      return;
    }
    this.mode = 'error';
    this.shot += 1;
    this.stopCamera();
    const video = this.video();
    const still = this.still();
    if (video) {
      video.hidden = true;
    }
    if (still) {
      still.hidden = true;
    }
    this.setCount('');
    this.setStatus(message);
    this.setActions([['close', 'Close', '']]);
  }

  release() {
    this.shot += 1;
    this.stopCamera();
  }

  stopCamera() {
    const video = this.video();
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    stopStream(this.stream);
    this.stream = null;
  }

  root() {
    return document.querySelector('.saitosign-photo');
  }

  video() {
    const root = this.root();
    return root ? root.querySelector('[data-photo-video]') : null;
  }

  still() {
    const root = this.root();
    return root ? root.querySelector('[data-photo-still]') : null;
  }

  setStatus(message, heading = false) {
    const note = this.root()?.querySelector('[data-photo-status]');
    if (!note) {
      return;
    }
    note.hidden = false;
    note.classList.toggle('heading', heading);
    note.textContent = message || '\u00a0';
  }

  setCount(value) {
    const count = this.root()?.querySelector('[data-photo-count]');
    if (!count) {
      return;
    }
    count.textContent = value || '';
    count.hidden = !value;
  }

  setActions(actions) {
    const bar = this.root()?.querySelector('[data-photo-actions]');
    if (!bar) {
      return;
    }
    bar.innerHTML = actions
      .map(([action, label, tone]) => {
        const primary = tone === 'primary' ? ' primary' : '';
        return `<button type="button" class="photo-action${primary}" data-photo-action="${action}">${label}</button>`;
      })
      .join('');
  }
}

function stopStream(stream) {
  if (!stream || typeof stream.getTracks !== 'function') {
    return;
  }
  stream.getTracks().forEach((track) => track.stop());
}

function denied(err) {
  const name = String(err?.name || '');
  return name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError';
}

function cameraMessage(err) {
  const name = String(err?.name || '');
  if (denied(err)) {
    return 'Camera access was denied. Allow the camera in the browser to take a photo.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return 'No camera is available on this device.';
  }
  return 'The camera could not be opened.';
}

function grabFrame(video, mirror) {
  const sourceW = video?.videoWidth || 0;
  const sourceH = video?.videoHeight || 0;
  if (!sourceW || !sourceH) {
    return '';
  }
  const scale = Math.min(1, 1280 / Math.max(sourceW, sourceH));
  const width = Math.max(1, Math.round(sourceW * scale));
  const height = Math.max(1, Math.round(sourceH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return '';
  }
  if (mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, width, height);
  try {
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch (err) {
    return '';
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = Photo;
