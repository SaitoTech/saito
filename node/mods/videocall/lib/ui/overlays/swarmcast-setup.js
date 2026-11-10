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

function operationOf(publication, census) {
  const source = census.depth === 0 && census.parent?.role === 'source';
  const reconnecting = !!publication.recovering || census.grace > 0 || /reconnect/i.test(census.reason || '');
  if (reconnecting) return { id: 'reconnecting', title: 'Reconnecting to Swarmcast' };
  if (!source && publication.parent_status === 'admitted') return { id: 'connecting', title: 'Connecting to Swarmcast' };
  if (census.health === 'disconnected') return { id: 'disconnected', title: 'Swarmcast is disconnected' };
  if (census.health === 'degraded') return { id: 'error', title: 'Swarmcast has a problem' };
  return { id: 'live', title: 'Swarmcast is live' };
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
    this.overlay.showClosable(SwarmcastSetupTemplate(participants(this.mod)), () => {
      this.stopWatch();
    });
    const root = typeof document !== 'undefined' ? document.querySelector('.swarmcast-setup') : null;
    if (!root) return;
    this.attach(root);
    this.showState(root, this.mod.swarmcast ? 'live' : 'settings');
  }

  attach(root) {
    const sync = () => this.sync(root);
    for (const input of root.querySelectorAll('input, select')) {
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
    for (const button of root.querySelectorAll('.swarmcast-slot-step')) {
      button.addEventListener('click', () => {
        const input = root.querySelector('input[name="swarmcast-slots"]');
        const current = Number(input?.value);
        const next = Math.max(0, (Number.isFinite(current) ? Math.floor(current) : 4) + Number(button.dataset.slots));
        if (input) input.value = String(next);
        const label = root.querySelector('[data-slots]');
        if (label) label.textContent = String(next);
      });
    }
    root.querySelector('.swarmcast-setup-start')?.addEventListener('click', () => {
      this.confirm(root);
    });
    root.querySelector('.swarmcast-setup-stop')?.addEventListener('click', () => {
      this.terminate(root);
    });
    root.querySelector('.swarmcast-setup-copy')?.addEventListener('click', async (event) => {
      event.preventDefault();
      const copied = await this.mod.copyBroadcastLink?.();
      const button = root.querySelector('.swarmcast-setup-copy');
      if (!copied || !button) return;
      const icon = button.querySelector('i');
      button.classList.add('is-copied');
      button.setAttribute('aria-label', 'Copied');
      icon?.classList.remove('fa-copy');
      icon?.classList.add('fa-check');
      clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => {
        button.classList.remove('is-copied');
        button.setAttribute('aria-label', 'Copy link');
        icon?.classList.remove('fa-check');
        icon?.classList.add('fa-copy');
      }, 1500);
    });
    root.querySelector('.swarmcast-setup-live')?.addEventListener('click', (event) => {
      const copy = event.target?.closest?.('[data-copy]');
      if (copy) {
        const key = copy.getAttribute('data-copy') || '';
        Promise.resolve(navigator.clipboard?.writeText?.(key)).catch((err) => console.error(err));
        return;
      }
    });
    if (this.mod.swarmcast) this.populate(root, this.mod.swarmcastConfig);
    sync();
  }

  showState(root, state) {
    root.dataset.state = state;
    const heading = root.querySelector('.swarmcast-setup-heading');
    if (heading) heading.textContent = state === 'live' ? 'Swarmcast is live' : 'What do you want to Swarmcast?';
    const mark = root.querySelector('.swarmcast-live-mark');
    if (mark) mark.hidden = true;
    const loading = root.querySelector('.swarmcast-setup-loading');
    if (loading) loading.hidden = state !== 'starting';
    if (root.setAttribute) root.setAttribute('aria-busy', state === 'starting' ? 'true' : 'false');
    const start = root.querySelector('.swarmcast-setup-start');
    if (start) {
      start.disabled = state === 'starting';
      if (state === 'settings') start.textContent = 'Start Swarmcasting';
      if (state === 'editing') start.textContent = 'Update broadcast';
    }
    if (state === 'live') {
      this.paintLive(root);
      if (root.querySelector?.('[data-monitor="listeners"]')) this.watch(root);
    } else {
      if (root.dataset) delete root.dataset.operation;
      this.stopWatch();
    }
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
    clearTimeout(this.copyTimer);
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
    if (!publication || typeof publication.census !== 'function') return;
    const census = publication.census();
    const operation = operationOf(publication, census);
    if (root.dataset) root.dataset.operation = operation.id;
    const heading = root.querySelector('.swarmcast-setup-heading');
    if (heading) heading.textContent = operation.title;
    const view = monitorText(census);
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
    const slots = root.querySelector('input[name="swarmcast-slots"]');
    if (slots) slots.value = view.max_slots;
    const slotLabel = root.querySelector('[data-slots]');
    if (slotLabel) slotLabel.textContent = view.max_slots;
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
    const quality = root.querySelector('select[name="swarmcast-quality"]');
    if (quality) quality.value = preset;
    for (const input of root.querySelectorAll('input[name="swarmcast-quality"]')) {
      input.checked = input.value === preset;
    }
    root.dataset.preset = preset;
    root.dataset.video = screen ? 'interface' : 'participants';
    setField(root, 'swarmcast-width', state.quality?.maxWidth);
    setField(root, 'swarmcast-height', state.quality?.maxHeight);
    setField(root, 'swarmcast-fps', state.quality?.maxFramerate);
    if (Number.isFinite(Number(state.slots))) {
      setField(root, 'swarmcast-slots', Math.max(0, Math.floor(Number(state.slots))));
      const slotLabel = root.querySelector('[data-slots]');
      if (slotLabel) slotLabel.textContent = String(Math.max(0, Math.floor(Number(state.slots))));
    }
    const videoToggle = root.querySelector('input[name="swarmcast-include-video"]');
    if (videoToggle) {
      videoToggle.checked = screen || state.video?.mode === 'everyone' || (state.video?.participants || []).length > 0;
    }
    const audioToggle = root.querySelector('input[name="swarmcast-include-audio"]');
    if (audioToggle) {
      const audioOff = state.audio?.mode === 'none' || (state.audio?.mode === 'subset' && !(state.audio?.participants || []).length);
      audioToggle.checked = !audioOff;
    }
    const start = root.querySelector('.swarmcast-setup-start');
    if (start && this.mod.swarmcast) start.textContent = 'Update broadcast';
  }

  sync(root) {
    const video = root.querySelector('input[name="swarmcast-video"]:checked')?.value || 'interface';
    root.dataset.video = video === 'interface' ? 'interface' : 'participants';
    root.dataset.audio = root.dataset.video === 'interface' ? 'all' : 'participants';
    const presetId = root.querySelector('select[name="swarmcast-quality"]')?.value
      || root.querySelector('input[name="swarmcast-quality"]:checked')?.value
      || 'standard';
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
    const includeVideo = root.querySelector('input[name="swarmcast-include-video"]');
    const cameras = this.mod.streams?.list?.({ kind: 'camera', session: 'call' })?.length || 0;
    const videoCount = root.dataset.video !== 'participants'
      ? 1
      : includeVideo
        ? (includeVideo.checked ? Math.max(1, cameras) : 1)
        : root.querySelectorAll('input[name="swarmcast-video-member"]:checked').length;
    const outgoing = root.dataset.video === 'participants' ? streamQuality(choice, Math.max(1, videoCount)) : displayQuality(choice, this.mod.swarmcastSource);
    const source = this.mod.swarmcastSource;
    const write = (selector, value) => {
      const node = root.querySelector(selector);
      if (node) node.textContent = value;
    };
    write('[data-size]', `${choice.maxWidth} × ${choice.maxHeight}`);
    write('[data-rate]', `${choice.maxFramerate} fps`);
    write('[data-source]', source?.width && source?.height ? `${source.width} × ${source.height}` : 'Not shared yet');
    write('[data-outgoing]', root.dataset.video === 'participants' ? `${outgoing.maxWidth} × ${outgoing.maxHeight} per stream` : `${outgoing.maxWidth} × ${outgoing.maxHeight}`);
    write('[data-outgoing-rate]', `${outgoing.maxFramerate} fps`);
    write('[data-bitrate]', root.dataset.video === 'participants' ? `${kbps(outgoing.maxBitrate)} per stream` : kbps(outgoing.maxBitrate));
  }

  configFrom(root) {
    const checked = (name) =>
      [...root.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
    const video = root.querySelector('input[name="swarmcast-video"]:checked')?.value || 'interface';
    const screen = video === 'interface';
    const choice = this.choice(root);
    const videoToggle = root.querySelector('input[name="swarmcast-include-video"]');
    const audioToggle = root.querySelector('input[name="swarmcast-include-audio"]');
    const slots = root.querySelector('input[name="swarmcast-slots"]');
    const config = {
      video: {
        mode: screen ? 'interface' : videoToggle ? (videoToggle.checked ? 'everyone' : 'subset') : 'subset',
        participants: videoToggle || screen ? [] : checked('swarmcast-video-member')
      },
      audio: {
        mode: screen || (audioToggle && audioToggle.checked) ? 'everyone' : audioToggle ? 'none' : 'subset',
        participants: audioToggle || screen ? [] : checked('swarmcast-audio-member')
      },
      quality: {
        preset: choice.id,
        maxWidth: choice.maxWidth,
        maxHeight: choice.maxHeight,
        maxFramerate: choice.maxFramerate
      }
    };
    if (slots && Number.isFinite(Number(slots.value))) config.slots = Math.max(0, Math.floor(Number(slots.value)));
    return config;
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
      if (this.mod.departBroadcast) await this.mod.departBroadcast();
      else await this.mod.stopBroadcast();
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
