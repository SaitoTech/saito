const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const SwarmcastSetupTemplate = require('./swarmcast-setup.template');
const { monitorText, monitorChildren, monitorTree } = SwarmcastSetupTemplate;
const { QUALITY_PRESETS, displayQuality, streamQuality, stepQuality } = require('../../swarmcast');

function participants(mod) {
  const cameras = mod.streams?.list?.({ kind: 'camera', session: 'call' }) || [];
  return cameras
    .map((entry) => {
      const key = entry.origin === 'local' ? mod.publicKey : entry.peerId;
      if (!key) return null;
      const name = entry.origin === 'local' ? 'You' : mod.app?.keychain?.returnUsername?.(key) || key;
      return { key, name };
    })
    .filter(Boolean);
}

function field(root, name) {
  return root.querySelector?.(`input[name="${name}"]`) || null;
}

function setField(root, name, value) {
  const input = field(root, name);
  if (input) input.value = String(value);
}

function readNumber(root, name, fallback) {
  const value = Number(field(root, name)?.value);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function kbps(bits) {
  const kilo = bits / 1000;
  return kilo >= 1000 ? `${kilo / 1000} Mbps` : `${kilo} kbps`;
}

class SwarmcastSetup {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
  }

  render() {
    this.overlay.showClosable(SwarmcastSetupTemplate(participants(this.mod)));
    const root = typeof document !== 'undefined' ? document.querySelector('.swarmcast-setup') : null;
    if (!root) return;
    this.attach(root);
    this.showState(root, this.mod.swarmcast ? 'live' : 'settings');
  }

  attach(root) {
    const sync = () => this.sync(root);
    for (const input of root.querySelectorAll('input')) {
      input.addEventListener('change', sync);
    }
    for (const button of root.querySelectorAll('.swarmcast-setup-step')) {
      button.addEventListener('click', () => {
        const preset = QUALITY_PRESETS[root.dataset.preset] || QUALITY_PRESETS.standard;
        const source = this.mod.swarmcastSource || null;
        if (button.dataset.step === 'rate') {
          const next = stepQuality(readNumber(root, 'swarmcast-fps', preset.maxFramerate), Number(button.dataset.dir), 'rate', source);
          setField(root, 'swarmcast-fps', next);
        } else {
          const next = stepQuality(readNumber(root, 'swarmcast-width', preset.maxWidth), Number(button.dataset.dir), 'size', source);
          setField(root, 'swarmcast-width', next.maxWidth);
          setField(root, 'swarmcast-height', next.maxHeight);
        }
        this.paint(root);
      });
    }
    root.querySelector('.swarmcast-setup-start')?.addEventListener('click', () => {
      this.confirm(root);
    });
    root.querySelector('.swarmcast-setup-close')?.addEventListener('click', () => {
      this.stopWatch();
      this.overlay.close();
    });
    root.querySelector('.swarmcast-setup-stop')?.addEventListener('click', () => {
      this.terminate(root);
    });
    root.querySelector('.swarmcast-setup-copy')?.addEventListener('click', () => {
      this.mod.copyBroadcastLink?.();
    });
    root.querySelector('.swarmcast-setup-edit')?.addEventListener('click', () => {
      this.populate(root, this.mod.swarmcastConfig);
      this.showState(root, 'editing');
    });
    root.querySelector('.swarmcast-setup-back')?.addEventListener('click', () => {
      this.showState(root, 'live');
    });
    root.querySelector('.swarmcast-monitor')?.addEventListener('click', (event) => {
      const copy = event.target?.closest?.('[data-copy]');
      if (copy) {
        const key = copy.getAttribute('data-copy') || '';
        Promise.resolve(navigator.clipboard?.writeText?.(key)).catch((err) => console.error(err));
        return;
      }
      const step = event.target?.closest?.('[data-capacity]');
      if (!step) return;
      const publication = this.mod.swarmcast;
      if (!publication) return;
      const input = root.querySelector('.swarmcast-capacity-input');
      const current = Number(input?.value);
      const base = Number.isFinite(current) ? current : publication.max_slots;
      this.applyCapacity(root, base + Number(step.getAttribute('data-capacity')));
    });
    root.querySelector('.swarmcast-capacity-input')?.addEventListener('change', (event) => {
      this.applyCapacity(root, event.target.value);
    });
    if (this.mod.swarmcast) this.populate(root, this.mod.swarmcastConfig);
    sync();
  }

  showState(root, state) {
    root.dataset.state = state;
    const loading = root.querySelector('.swarmcast-setup-loading');
    if (loading) loading.hidden = state !== 'starting';
    if (root.setAttribute) root.setAttribute('aria-busy', state === 'starting' ? 'true' : 'false');
    const start = root.querySelector('.swarmcast-setup-start');
    if (start) {
      start.disabled = state === 'starting';
      if (state === 'settings') start.textContent = 'Start Swarmcasting';
      if (state === 'editing') start.textContent = 'Update broadcast';
    }
    const back = root.querySelector('.swarmcast-setup-back');
    if (back) back.hidden = state !== 'editing';
    if (state === 'live') {
      this.paintLive(root);
      if (root.querySelector?.('[data-monitor="max-slots"]')) this.watch(root);
    } else this.stopWatch();
    if (state === 'starting' || state === 'live') this.showError(root, '');
  }

  watch(root) {
    if (this.watching) return;
    this.watching = true;
    this.onState = () => {
      if (root.dataset?.state === 'live') this.paintLive(root);
    };
    this.mod.app?.connection?.on?.('swarmcast-state', this.onState);
    this.clock = setInterval(this.onState, 1000);
    this.clock.unref?.();
  }

  stopWatch() {
    if (this.onState) this.mod.app?.connection?.removeListener?.('swarmcast-state', this.onState);
    clearInterval(this.clock);
    this.onState = null;
    this.clock = null;
    this.watching = false;
  }

  applyCapacity(root, value) {
    const publication = this.mod.swarmcast;
    const input = root.querySelector('.swarmcast-capacity-input');
    const next = Math.floor(Number(value));
    if (!publication || !Number.isFinite(next) || next < 0) {
      if (input && publication) input.value = String(publication.max_slots);
      return;
    }
    const result = publication.setMaxSlots(next);
    if (input && document.activeElement !== input) input.value = String(publication.max_slots);
    const pending = root.querySelector('[data-monitor="pending"]');
    if (pending) {
      pending.hidden = !result?.pending;
      pending.textContent = result?.pending ? result.reason : '';
    }
    this.paintLive(root);
  }

  showError(root, message) {
    const node = root.querySelector('.swarmcast-setup-error');
    if (!node) return;
    node.hidden = !message;
    node.textContent = message || '';
  }

  paintLive(root) {
    const link = this.mod.swarmcastLink || '';
    const anchor = root.querySelector('.swarmcast-setup-live-link');
    if (anchor) {
      anchor.href = link;
      anchor.textContent = link;
    }
    const publication = this.mod.swarmcast;
    const slot = root.querySelector?.('[data-monitor="max-slots"]');
    if (!publication || !slot) return;
    const view = monitorText(publication.census());
    const write = (name, value) => {
      const node = root.querySelector(`[data-monitor="${name}"]`);
      if (node) node.textContent = value;
    };
    write('max-slots', view.max_slots);
    write('occupied', view.occupied);
    write('available', view.available);
    write('grace', view.grace);
    write('direct', view.direct);
    write('listeners', view.listeners);
    write('reason', view.reason);
    write('parent', view.parent);
    write('depth', view.depth);
    write('known', view.known);
    write('tree-note', view.tree_note);
    const health = root.querySelector('[data-monitor="health"]');
    if (health) {
      health.textContent = view.health;
      health.dataset.health = view.health_state;
    }
    const pending = root.querySelector('[data-monitor="pending"]');
    if (pending) {
      pending.hidden = !view.pending;
      pending.textContent = view.pending;
    }
    const input = root.querySelector('.swarmcast-capacity-input');
    if (input && globalThis.document?.activeElement !== input) input.value = view.max_slots;
    const children = root.querySelector('[data-monitor="children"]');
    if (children) children.innerHTML = monitorChildren(view.children);
    const tree = root.querySelector('[data-monitor="tree"]');
    if (tree) tree.innerHTML = monitorTree(view.children);
  }

  populate(root, state) {
    if (!state) return;
    const screen = state.video?.mode === 'interface';
    for (const input of root.querySelectorAll('input[name="swarmcast-video"]')) {
      input.checked = input.value === (screen ? 'interface' : 'participants');
    }
    const videos = new Set(state.video?.participants || []);
    for (const input of root.querySelectorAll('input[name="swarmcast-video-member"]')) {
      input.checked = videos.has(input.value);
    }
    const allAudio = state.audio?.mode === 'everyone';
    const audios = new Set(state.audio?.participants || []);
    for (const input of root.querySelectorAll('input[name="swarmcast-audio-member"]')) {
      input.checked = allAudio || audios.has(input.value);
    }
    const preset = state.quality?.preset || 'standard';
    for (const input of root.querySelectorAll('input[name="swarmcast-quality"]')) {
      input.checked = input.value === preset;
    }
    root.dataset.preset = preset;
    root.dataset.video = screen ? 'interface' : 'participants';
    setField(root, 'swarmcast-width', state.quality?.maxWidth);
    setField(root, 'swarmcast-height', state.quality?.maxHeight);
    setField(root, 'swarmcast-fps', state.quality?.maxFramerate);
    const start = root.querySelector('.swarmcast-setup-start');
    if (start && this.mod.swarmcast) start.textContent = 'Update broadcast';
  }

  sync(root) {
    const video = root.querySelector('input[name="swarmcast-video"]:checked')?.value || 'interface';
    root.dataset.video = video === 'interface' ? 'interface' : 'participants';
    root.dataset.audio = root.dataset.video === 'interface' ? 'all' : 'participants';
    const presetId = root.querySelector('input[name="swarmcast-quality"]:checked')?.value || 'standard';
    if (root.dataset.preset !== presetId) {
      const preset = QUALITY_PRESETS[presetId] || QUALITY_PRESETS.standard;
      root.dataset.preset = presetId;
      setField(root, 'swarmcast-width', preset.maxWidth);
      setField(root, 'swarmcast-height', preset.maxHeight);
      setField(root, 'swarmcast-fps', preset.maxFramerate);
    }
    this.paint(root);
  }

  choice(root) {
    const preset = QUALITY_PRESETS[root.dataset.preset] || QUALITY_PRESETS.standard;
    return {
      id: preset.id,
      maxWidth: readNumber(root, 'swarmcast-width', preset.maxWidth),
      maxHeight: readNumber(root, 'swarmcast-height', preset.maxHeight),
      maxFramerate: readNumber(root, 'swarmcast-fps', preset.maxFramerate),
      maxBitrate: preset.maxBitrate
    };
  }

  paint(root) {
    const choice = this.choice(root);
    const videoCount = root.dataset.video === 'participants'
      ? root.querySelectorAll('input[name="swarmcast-video-member"]:checked').length
      : 1;
    const outgoing = root.dataset.video === 'participants' ? streamQuality(choice, Math.max(1, videoCount)) : displayQuality(choice, this.mod.swarmcastSource);
    const source = this.mod.swarmcastSource;
    const write = (selector, value) => {
      const node = root.querySelector(selector);
      if (node) node.textContent = value;
    };
    write('[data-size]', `${choice.maxWidth}×${choice.maxHeight}`);
    write('[data-rate]', `${choice.maxFramerate} fps`);
    write('[data-source]', source?.width && source?.height ? `${source.width}×${source.height}` : 'Not shared yet');
    write('[data-outgoing]', root.dataset.video === 'participants' ? `${outgoing.maxWidth}×${outgoing.maxHeight} per stream` : `${outgoing.maxWidth}×${outgoing.maxHeight}`);
    write('[data-outgoing-rate]', `${outgoing.maxFramerate} fps`);
    write('[data-bitrate]', root.dataset.video === 'participants' ? `${kbps(outgoing.maxBitrate)} per stream` : kbps(outgoing.maxBitrate));
  }

  configFrom(root) {
    const checked = (name) =>
      [...root.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
    const video = root.querySelector('input[name="swarmcast-video"]:checked')?.value || 'interface';
    const screen = video === 'interface';
    const choice = this.choice(root);
    return {
      video: {
        mode: screen ? 'interface' : 'subset',
        participants: checked('swarmcast-video-member')
      },
      audio: {
        mode: screen ? 'everyone' : 'subset',
        participants: checked('swarmcast-audio-member')
      },
      quality: {
        preset: choice.id,
        maxWidth: choice.maxWidth,
        maxHeight: choice.maxHeight,
        maxFramerate: choice.maxFramerate
      }
    };
  }

  async confirm(root) {
    if (root.dataset.state === 'starting' || this.mod.swarmcastStarting) return false;
    const config = this.configFrom(root);
    const active = !!this.mod.swarmcast;
    this.showState(root, 'starting');
    const started = active
      ? await this.mod.reviseBroadcast(config)
      : await this.mod.startBroadcast(config);
    if (started && this.mod.swarmcast) {
      this.showState(root, 'live');
      return true;
    }
    this.showState(root, this.mod.swarmcast ? 'editing' : 'settings');
    this.showError(root, active
      ? 'The broadcast settings could not be changed'
      : 'The broadcast could not be started');
    return false;
  }

  async terminate(root) {
    if (!this.mod.swarmcast || root.dataset.state === 'starting') return false;
    try {
      await this.mod.stopBroadcast();
    } catch (err) {
      this.showError(root, err?.message || 'Swarmcast could not be stopped');
      this.showState(root, 'live');
      return false;
    }
    if (this.mod.swarmcast) {
      this.showError(root, 'Swarmcast is still running');
      this.showState(root, 'live');
      return false;
    }
    this.showError(root, '');
    this.showState(root, 'settings');
    return true;
  }
}

module.exports = SwarmcastSetup;
