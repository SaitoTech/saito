const SaitoVideoBox = require('../../../../lib/saito/ui/saito-videobox/video-box');
const WindowsControlsTemplate = require('./windows.template');
const { callMount } = require('../stream_manager');

const TILE_W = 240;
const TILE_H = 180;
const GAP = 12;
const EDGE = 28;
const CONTROL_H = 52;

/**
 * Participant windows for a call that is not the open Talk meeting.
 * One window per public key. Audio-only calls use the same windows.
 */
class Windows {
  constructor(app, mod, container) {
    this.app = app;
    this.mod = mod;
    this.container = this.resolveContainer(container);
    this.panels = new Map();
    this.presentation = null;
    this.controls = null;
    this.nextSlot = 0;
    this.layer = 40;
    this.closed = false;
    this.timer_interval = null;

    if (window.getComputedStyle(this.container).position === 'static') {
      this.container.style.position = 'relative';
    }

    this.onViewport = () => this.clampAll();
    window.addEventListener('resize', this.onViewport);
    this.listeners = {
      'videocall-stream-added': (entry) => this.showEntry(entry),
      'videocall-stream-updated': (entry) => this.showEntry(entry),
      'videocall-stream-removed': (entry) => this.hideEntry(entry)
    };
    for (const event of Object.keys(this.listeners)) {
      this.app.connection.on(event, this.listeners[event]);
    }
  }

  visibleMedia(entry) {
    return entry?.mediaStream?.getTracks?.().length ? entry.mediaStream : null;
  }

  showEntry(entry) {
    const mount = callMount(entry);
    if (!mount) {
      return;
    }
    const media = this.visibleMedia(entry);
    if (mount === 'presentation') {
      this.showPresentation(media);
      return;
    }
    if (mount === 'local') {
      this.showParticipant(this.mod.publicKey, media);
      return;
    }
    this.showParticipant(mount, media);
    if (media) {
      this.callStarted = true;
      this.startTimer();
    }
  }

  hideEntry(entry) {
    const mount = callMount(entry);
    if (!mount) {
      return;
    }
    if (mount === 'presentation') {
      this.presentationStopped();
      return;
    }
    if (mount === 'local') {
      this.drop(this.mod.publicKey);
      return;
    }
    this.participantLeft(mount);
  }

  receiveLocalStream(localStream) {
    this.showParticipant(this.mod.publicKey, localStream);
  }

  receiveRemoteStream(peer, remoteStream) {
    if (peer === 'presentation') {
      this.showPresentation(remoteStream);
      return;
    }
    if (peer === 'local') {
      this.showParticipant(this.mod.publicKey, remoteStream);
      return;
    }
    if (!peer || peer === 'connecting') {
      return;
    }
    this.showParticipant(peer, remoteStream);
    if (remoteStream) {
      this.callStarted = true;
      this.startTimer();
    }
  }

  participantLeft(peerId) {
    if (peerId === 'presentation') {
      this.dropPresentation();
      return;
    }
    const box = this.panels.get(peerId);
    if (!box) {
      return;
    }
    const el = document.getElementById(`stream_${peerId}`);
    if (el) {
      box.updateConnectionMessage('disconnected', false);
    }
  }

  participantKicked(peerId) {
    this.participantLeft(peerId);
    this.drop(peerId);
  }

  presentationStopped() {
    this.dropPresentation();
  }

  setPresenting(state = false) {
    const button = this.controls?.querySelector('.present-control');
    if (!button) {
      return;
    }
    button.classList.toggle('recording', !!state);
    button.title = state ? 'Stop presenting' : 'Present your screen';
  }

  resolveContainer(container) {
    if (typeof container === 'string') {
      return document.querySelector(container) || document.body;
    }
    return container || document.body;
  }

  showParticipant(publicKey, stream) {
    if (this.closed || !publicKey) {
      return;
    }
    let box = this.panels.get(publicKey);
    if (!box) {
      box = new SaitoVideoBox(this.app, this.mod, publicKey, '', this.container);
      this.panels.set(publicKey, box);
      box.render(stream);
      const el = document.getElementById(`stream_${publicKey}`);
      if (el) {
        if (!this.controls) {
          this.placeControls();
        }
        this.place(el);
        this.drag(el);
        this.resize(el);
      }
      return;
    }
    box.render(stream);
  }

  showPresentation(stream) {
    if (this.closed) {
      return;
    }
    if (!this.presentation) {
      this.presentation = new SaitoVideoBox(this.app, this.mod, 'presentation', '', this.container);
      this.presentation.render(stream);
      const el = document.getElementById('stream_presentation');
      if (el) {
        this.place(el);
        this.drag(el);
        this.resize(el);
      }
      return;
    }
    this.presentation.render(stream);
  }

  place(el) {
    const width = this.container === document.body ? window.innerWidth : this.container.clientWidth;
    const height =
      this.container === document.body ? window.innerHeight : this.container.clientHeight;
    const cols = Math.max(1, Math.floor((width - EDGE) / (TILE_W + GAP)));
    const index = this.nextSlot++;
    const col = index % cols;
    const row = Math.floor(index / cols);
    const controlsH = this.controls?.offsetHeight || CONTROL_H;
    el.style.left = `${EDGE + col * (TILE_W + GAP)}px`;
    el.style.top = `${Math.max(
      0,
      height - EDGE - controlsH - GAP - TILE_H - row * (TILE_H + GAP)
    )}px`;
  }

  placeControls() {
    const audioOn = this.mod.streams?.audioEnabled !== false;
    const videoOn = this.mod.streams?.videoEnabled !== false;
    const holder = document.createElement('div');
    holder.innerHTML = WindowsControlsTemplate(audioOn, videoOn).trim();
    const controls = holder.firstElementChild;
    this.container.appendChild(controls);
    const height =
      this.container === document.body ? window.innerHeight : this.container.clientHeight;
    const controlsH = controls.offsetHeight || CONTROL_H;
    controls.style.left = `${EDGE}px`;
    controls.style.top = `${Math.max(0, height - EDGE - controlsH)}px`;
    this.bindControls(controls);
    this.drag(controls);
    this.controls = controls;
    if (this.callStarted) {
      this.startTimer();
    }
  }

  bindControls(controls) {
    const audio = controls.querySelector('.audio-control');
    const video = controls.querySelector('.video-control');

    audio.onclick = () => {
      this.mod.streams?.toggleAudio();
      audio.classList.toggle('disabled');
      const icon = audio.querySelector('i');
      icon.classList.toggle('fa-microphone');
      icon.classList.toggle('fa-microphone-slash');
    };

    video.onclick = () => {
      this.mod.streams?.toggleVideo();
      video.classList.toggle('disabled');
      const icon = video.querySelector('i');
      icon.classList.toggle('fa-video');
      icon.classList.toggle('fa-video-slash');
    };

    controls.querySelector('.present-control').onclick = () => {
      if (this.mod.screen_share && this.mod.screen_share !== true) {
        return;
      }
      if (this.mod.screen_share) this.mod.streams?.stopShareScreen();
      else this.mod.streams?.beginShareScreen();
    };

    controls.querySelector('.invite-control').onclick = () => {
      this.mod.copyInviteLink();
    };

    controls.querySelector('.disconnect-control').onclick = () => {
      this.mod.streams?.leaveCall();
    };
  }

  // left/top stay relative to the host container. makeDraggable writes viewport coordinates.
  drag(el) {
    el.addEventListener('mousedown', (event) => {
      if (event.button !== 0) {
        return;
      }
      if (event.target.closest('.icon_click_area, .volume-control, .videocall-resize')) {
        return;
      }
      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = parseFloat(el.style.left) || 0;
      const startTop = parseFloat(el.style.top) || 0;
      let moved = false;
      el.style.zIndex = String(++this.layer);

      const move = (e) => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) + Math.abs(dy) > 3) {
          moved = true;
        }
        el.style.left = `${startLeft + dx}px`;
        el.style.top = `${startTop + dy}px`;
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        if (moved) {
          const suppress = (clickEvent) => {
            clickEvent.preventDefault();
            clickEvent.stopPropagation();
            document.removeEventListener('click', suppress, true);
          };
          document.addEventListener('click', suppress, true);
        }
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }

  resize(el) {
    const handle = document.createElement('div');
    handle.className = 'videocall-resize';
    handle.title = 'Resize';
    el.appendChild(handle);
    handle.addEventListener('mousedown', (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = el.offsetWidth;
      const startHeight = el.offsetHeight;
      const startLeft = parseFloat(el.style.left) || 0;
      const startTop = parseFloat(el.style.top) || 0;
      const move = (e) => {
        const width = Math.max(160, startWidth - (e.clientX - startX));
        const height = Math.max(120, startHeight - (e.clientY - startY));
        el.style.width = `${width}px`;
        el.style.height = `${height}px`;
        el.style.left = `${startLeft + (startWidth - width)}px`;
        el.style.top = `${startTop + (startHeight - height)}px`;
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }

  clampAll() {
    for (const box of this.panels.values()) {
      const el = document.getElementById(`stream_${box.stream_id}`);
      if (el) {
        this.clamp(el);
      }
    }
    const presentation = document.getElementById('stream_presentation');
    if (presentation) {
      this.clamp(presentation);
    }
    if (this.controls) {
      this.clamp(this.controls);
    }
  }

  clamp(el) {
    const width = this.container === document.body ? window.innerWidth : this.container.clientWidth;
    const height =
      this.container === document.body ? window.innerHeight : this.container.clientHeight;
    const maxLeft = Math.max(0, width - el.offsetWidth);
    const maxTop = Math.max(0, height - el.offsetHeight);
    const left = parseFloat(el.style.left) || 0;
    const top = parseFloat(el.style.top) || 0;
    el.style.left = `${Math.min(Math.max(0, left), maxLeft)}px`;
    el.style.top = `${Math.min(Math.max(0, top), maxTop)}px`;
  }

  drop(publicKey) {
    const box = this.panels.get(publicKey);
    if (!box) {
      return;
    }
    box.destroy();
    this.panels.delete(publicKey);
  }

  dropPresentation() {
    if (!this.presentation) {
      return;
    }
    this.presentation.destroy();
    this.presentation = null;
  }

  startTimer() {
    if (this.timer_interval) {
      return;
    }
    const timerElement = this.controls?.querySelector('.videocall-timer');
    if (!timerElement) {
      return;
    }
    let seconds = 0;
    this.timer_interval = setInterval(() => {
      seconds++;
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      timerElement.textContent = `${minutes < 10 ? '0' : ''}${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    }, 1000);
  }

  close() {
    this.destroy();
  }

  destroy() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    for (const event of Object.keys(this.listeners || {})) {
      this.app.connection.removeListener(event, this.listeners[event]);
    }
    this.listeners = {};
    window.removeEventListener('resize', this.onViewport);
    clearInterval(this.timer_interval);
    this.timer_interval = null;

    for (const box of this.panels.values()) {
      box.destroy();
    }
    this.panels.clear();
    this.dropPresentation();

    if (this.controls) {
      this.controls.remove();
      this.controls = null;
    }
  }
}

module.exports = Windows;
