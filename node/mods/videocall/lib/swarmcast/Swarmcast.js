const MAX_SLOTS = 4;
const GRACE_INTERVAL = 30000;
const UPWARD_MIN = 45000;
const UPWARD_SPAN = 30000;
const ADMISSION_TIMEOUT = 20000;
const ADMISSION_ATTEMPTS = 8;
const RECOVERY_GAP = 2000;
const FAILURE_GRACE = 5000;
const DEPARTURE_GRACE = 3000;

function mediaApi() {
  return require('../swarmcast');
}

class Swarmcast {
  constructor({ id, callId, broadcaster, show = 'participants', mod = null, max_slots = MAX_SLOTS } = {}) {
    this.id = id;
    this.callId = callId;
    this.broadcaster = broadcaster;
    this.show = show === 'interface' ? 'interface' : 'participants';
    this.inputs = [];
    this.outputs = [];
    this.mod = mod;
    this.max_slots = max_slots;
    this.children = Array.from({ length: this.max_slots }, () => null);
    this.parent = '';
    this.grandparent = '';
    this.siblings = Array.from({ length: this.max_slots }, () => null);
    this.tree_path = broadcaster || '';
    this.depth = 0;
    this.parent_status = '';
    this.parent_disconnected_at = 0;
    this.grace_interval = GRACE_INTERVAL;
    this.parent_mids = new Map();
    this.pending_parent = '';
    this.recovering = false;
    this.recovery_targets = [];
    this.recovery_timer = null;
    this.upward_timer = null;
    this.attempt_timer = null;
    this.attempt_token = 0;
    this.failure_timer = null;
    this.failure_token = 0;
    this.admission_attempted = new Set();
    this.parent_link = '';
    this.media_forwarded = false;
    this.events_bound = false;
    this.upstreams = new Map();
    this.former_children = [];
    this.notified_children = new Set();
    this.departing = false;
    this.ended = false;
  }

  static get DEPARTURE_GRACE() {
    return DEPARTURE_GRACE;
  }

  document() {
    return {
      id: this.id,
      callId: this.callId,
      broadcaster: this.broadcaster,
      show: this.show,
      inputs: this.inputs.map((input) => ({
        id: input.id,
        kind: input.kind,
        label: input.label,
        participant: input.participant
      })),
      outputs: this.outputs.map((output) => ({
        id: output.id,
        role: output.role || 'video',
        kind: output.kind || 'camera',
        label: output.label,
        participant: output.participant || '',
        inputs: (output.inputs || []).slice(),
        ...(output.role === 'audio' ? { muted: !!output.muted } : {}),
        ...((output.role || 'video') !== 'audio' && (output.kind || 'camera') !== 'interface'
          ? { camera: output.camera || 'live' }
          : {})
      }))
    };
  }

  addCamera({ registryId, participant, label }) {
    let input = this.inputs.find((item) => item.kind === 'camera' && item.participant === participant);
    if (!input) {
      input = {
        id: `cam-${this.inputs.length + 1}`,
        kind: 'camera',
        label,
        participant,
        registryId
      };
      this.inputs.push(input);
      this.outputs.push({
        id: input.id,
        label,
        inputs: [input.id]
      });
      return input;
    }
    input.registryId = registryId;
    input.label = label;
    const output = this.outputs.find((item) => item.inputs.length === 1 && item.inputs[0] === input.id);
    if (output) output.label = label;
    return input;
  }

  removeParticipant(participant) {
    const before = this.outputs.length;
    this.inputs = this.inputs.filter((input) => input.participant !== participant);
    this.outputs = this.outputs.filter((output) => output.participant !== participant);
    return this.outputs.length !== before;
  }

  streamFor(output, streams) {
    const registryId =
      output.registryId || this.inputs.find((input) => input.id === output.inputs?.[0])?.registryId;
    if (!registryId || !streams?.get) return null;
    const media = streams.get(registryId)?.mediaStream || null;
    if (!media || !output.role) return media;
    const kind = output.role === 'audio' ? 'audio' : 'video';
    const view = {
      getTracks: () => (media.getTracks?.() || []).filter((track) => track.kind === kind)
    };
    if (output.id === 'interface' || output.kind === 'interface') {
      const tracks = view.getTracks();
      mediaApi().broadcastDiagnostic('output', {
        publication: this.id,
        output: output.id,
        registryId,
        resolvedTracks: tracks.map((track) => track.id),
        readyState: tracks.map((track) => track.readyState),
        enabled: tracks.map((track) => track.enabled),
        muted: tracks.map((track) => track.muted)
      });
    }
    return view;
  }

  selfKey() {
    return this.mod?.publicKey || '';
  }

  childFor(public_key) {
    return this.children.find((child) => child && child.public_key === public_key) || null;
  }

  hasPeer(public_key) {
    return !!(this.childFor(public_key) || public_key === this.parent || public_key === this.pending_parent);
  }

  isCallMember(public_key) {
    return !!this.mod?.room_obj?.call_peers?.includes(public_key);
  }

  slotFree(slot, now = Date.now()) {
    if (!slot) return true;
    if (slot.status === 'pending' || slot.status === 'online') return false;
    return !!(slot.disconnected_at && now - slot.disconnected_at > this.grace_interval);
  }

  freeSlotCount() {
    const now = Date.now();
    return this.children.filter((slot) => this.slotFree(slot, now)).length;
  }

  addChild(public_key, status = 'online') {
    if (!public_key || public_key === this.selfKey()) return null;
    const existing = this.childFor(public_key);
    if (existing) return existing;
    const now = Date.now();
    let index = this.children.findIndex((slot) => slot == null);
    if (index < 0) {
      index = this.children.findIndex((slot) => this.slotFree(slot, now) && slot);
    }
    if (index < 0) return null;
    const admitted = status === 'online';
    const record = {
      public_key,
      tree_path: this.tree_path ? `${this.tree_path}/${public_key}` : public_key,
      status: admitted ? 'online' : 'pending',
      disconnected_at: 0,
      connected_at: admitted ? now : 0,
      media_streams: [],
      last_map: '',
      downstream: null,
      downstream_known: false,
      reported_children: null,
      free_slots: null,
      link_state: admitted ? 'subscribed' : 'reserved',
      admission_token: 1
    };
    this.children[index] = record;
    this.rememberFormer(public_key);
    this.noteState();
    return record;
  }

  rememberFormer(public_key) {
    if (!public_key || public_key === this.selfKey()) return;
    if (!this.former_children.includes(public_key)) this.former_children.push(public_key);
    this.mod?.persistSwarmcastState?.();
  }

  noteUpstream(public_key, patch = {}) {
    if (!public_key) return null;
    let row = this.upstreams.get(public_key);
    if (!row) {
      row = {
        public_key,
        tree_path: '',
        depth: null,
        grandparent: '',
        siblings: [],
        link: '',
        mids: new Map(),
        usable: false
      };
      this.upstreams.set(public_key, row);
    }
    if (patch.tree_path != null) row.tree_path = patch.tree_path;
    if (patch.depth != null) row.depth = patch.depth;
    if (patch.grandparent != null) row.grandparent = patch.grandparent;
    if (patch.siblings) row.siblings = patch.siblings;
    if (patch.link) row.link = patch.link;
    if (patch.mids) row.mids = patch.mids;
    if (patch.usable != null) row.usable = !!patch.usable;
    return row;
  }

  upstreamUsable(public_key) {
    if (!public_key) return false;
    if (public_key === this.parent) {
      return ['mapped', 'forwarding'].includes(this.parent_link) && this.parent_mids.size > 0;
    }
    return !!this.upstreams.get(public_key)?.usable;
  }

  tracksLive(public_key, mids) {
    const pc = this.mod?.peerManager?.peers?.get(public_key);
    if (!pc || !mids || !mids.size || typeof pc.getTransceivers !== 'function') return false;
    for (const list of mids.values()) {
      for (const item of list || []) {
        const transceiver = pc.getTransceivers().find((entry) => entry.mid === item.mid);
        const track = transceiver?.receiver?.track;
        if (track && track.readyState !== 'ended' && (!item.kind || track.kind === item.kind)) return true;
      }
    }
    return false;
  }

  pathContains(public_key, path = this.tree_path) {
    if (!public_key || !path) return false;
    return String(path).split('/').filter(Boolean).includes(public_key);
  }

  holdingLiveParent(next = '') {
    return !!(this.parent && this.parent !== next && this.upstreamUsable(this.parent));
  }

  abandonCandidate() {
    const failed = this.pending_parent;
    clearTimeout(this.attempt_timer);
    this.attempt_timer = null;
    this.attempt_token += 1;
    this.recovering = false;
    this.pending_parent = this.parent || '';
    if (failed && failed !== this.parent) {
      this.upstreams.delete(failed);
      if (!this.isCallMember(failed)) {
        try {
          this.mod?.peerManager?.removePeerConnection?.(failed);
        } catch (err) {
          console.error(err);
        }
      }
    }
    this.noteState();
  }

  updateChild(public_key, patch = {}) {
    const child = this.childFor(public_key);
    if (!child) return null;
    if (patch.tree_path != null) child.tree_path = patch.tree_path;
    if (patch.status) child.status = patch.status;
    if (patch.disconnected_at != null) child.disconnected_at = patch.disconnected_at;
    if (patch.last_map != null) child.last_map = patch.last_map;
    if ('free_slots' in patch) child.free_slots = patch.free_slots;
    if ('downstream' in patch) child.downstream = patch.downstream;
    if ('downstream_known' in patch) child.downstream_known = patch.downstream_known;
    if ('reported_children' in patch) child.reported_children = patch.reported_children;
    if (!patch || !Object.keys(patch).length) {
      child.status = 'online';
      child.disconnected_at = 0;
      child.connected_at = Date.now();
    }
    this.noteState();
    return child;
  }

  clearChildTimers(child) {
    if (!child) return;
    clearTimeout(child.admission_timer);
    clearTimeout(child.grace_timer);
    child.admission_timer = null;
    child.grace_timer = null;
  }

  removeChild(public_key) {
    const index = this.children.findIndex((child) => child && child.public_key === public_key);
    if (index < 0) return false;
    this.clearChildTimers(this.children[index]);
    this.children[index] = null;
    this.noteState();
    return true;
  }

  noteState() {
    this.mod?.app?.connection?.emit?.('swarmcast-state', this);
  }

  setMaxSlots(count) {
    const next = Math.floor(Number(count));
    if (!Number.isFinite(next) || next < 0) return { ok: false, pending: false, reason: 'Capacity must be zero or greater' };
    if (this.capacity_pending) return { ok: false, pending: true, reason: this.capacity_pending.reason };
    if (next === this.max_slots) return { ok: true, pending: false };
    if (next > this.max_slots) {
      while (this.children.length < next) this.children.push(null);
      this.max_slots = next;
      this.noteState();
      this.announce();
      return { ok: true, pending: false };
    }
    const pending = [];
    for (let index = next; index < this.children.length; index += 1) {
      const child = this.children[index];
      if (!child) continue;
      const connected =
        child.status === 'online' ||
        child.status === 'pending' ||
        this.mod?.peerManager?.peers?.get(child.public_key);
      if (connected) {
        try {
          this.mod?.peerManager?.removePeerConnection?.(child.public_key);
        } catch (err) {
          pending.push(child.public_key);
          continue;
        }
      }
      if (this.mod?.peerManager?.peers?.get(child.public_key)) {
        pending.push(child.public_key);
        continue;
      }
      this.children[index] = null;
    }
    if (pending.length) {
      this.capacity_pending = {
        requested: next,
        public_keys: pending,
        reason: 'Waiting for the last child connections to close'
      };
      this.noteState();
      return { ok: true, pending: true, reason: this.capacity_pending.reason };
    }
    this.children = this.children.slice(0, next);
    this.max_slots = next;
    this.noteState();
    this.announce();
    return { ok: true, pending: false };
  }

  finishCapacity() {
    const pending = this.capacity_pending;
    if (!pending) return false;
    const next = pending.requested;
    for (let index = next; index < this.children.length; index += 1) {
      const child = this.children[index];
      if (!child) continue;
      if (this.mod?.peerManager?.peers?.get(child.public_key)) return false;
      this.children[index] = null;
    }
    this.children = this.children.slice(0, next);
    this.max_slots = next;
    this.capacity_pending = null;
    this.noteState();
    this.announce();
    return true;
  }

  mediaStatus(child) {
    if (child?.status === 'pending') {
      return this.mod?.peerManager?.peers?.get(child.public_key)
        ? 'Waiting for the data channel'
        : 'Admission in progress';
    }
    if (!this.outputs.length) return 'This node has no outputs to forward';
    const pc = this.mod?.peerManager?.peers?.get(child.public_key);
    if (!pc) return 'No peer connection';
    const streams = child.media_streams || [];
    if (!streams.length) return 'Waiting for tracks';
    const failed = streams.some((item) => item.sender?._swarmcastLimitsFailed);
    if (failed) return 'Sender limits failed';
    const live = streams.filter((item) => item.sender?.track && item.sender.track.readyState !== 'ended');
    if (!child.last_map) return 'Track map not sent';
    if (live.length < streams.length) return 'A sender has no live track';
    if (pc.signalingState && pc.signalingState !== 'stable') return `Signaling ${pc.signalingState}`;
    return `Forwarding ${live.length} track${live.length === 1 ? '' : 's'}`;
  }

  census(now = Date.now()) {
    let online = 0;
    let grace = 0;
    let admissions = 0;
    let available = 0;
    let descendants = 0;
    let descendants_known = true;
    const children = this.children.map((child, slot) => {
      if (!child) {
        available += 1;
        return null;
      }
      const held =
        child.status === 'disconnected' &&
        child.disconnected_at &&
        now - child.disconnected_at <= this.grace_interval;
      let shown = 'expired';
      if (child.status === 'pending') {
        admissions += 1;
        shown = 'pending';
      } else if (child.status === 'online') {
        online += 1;
        shown = 'online';
      } else if (held) {
        grace += 1;
        shown = 'reconnecting';
      } else available += 1;
      if (child.status === 'online') {
        if (child.downstream_known && Number.isFinite(child.downstream)) descendants += child.downstream;
        else descendants_known = false;
      }
      const reported = Array.isArray(child.reported_children) ? child.reported_children : null;
      return {
        slot,
        public_key: child.public_key,
        status: shown,
        link_state: child.link_state || '',
        connected_at: child.connected_at || 0,
        disconnected_at: child.disconnected_at || 0,
        downstream: child.downstream_known ? child.downstream : null,
        downstream_known: !!child.downstream_known,
        reported_children: reported,
        media: this.mediaStatus(child),
        signaling: this.mod?.peerManager?.peers?.get(child.public_key)?.signalingState || ''
      };
    });
    const keys = new Set();
    const self = this.selfKey() || this.broadcaster;
    if (self) keys.add(self);
    if (this.parent) keys.add(this.parent);
    for (const slot of this.siblings || []) if (slot?.public_key) keys.add(slot.public_key);
    for (const child of children) {
      if (!child) continue;
      keys.add(child.public_key);
      for (const reported of child.reported_children || []) if (reported?.public_key) keys.add(reported.public_key);
    }
    let health = 'healthy';
    let reason = online ? 'Direct children are connected and media is forwarded' : 'No children are connected yet';
    if (grace) {
      health = 'degraded';
      reason = 'A child disconnected and the slot is held for reconnection';
    }
    if (children.some((child) => child && child.status === 'online' && child.media !== 'Forwarding 1 track' && !child.media.startsWith('Forwarding ') && child.media !== 'This node has no outputs to forward')) {
      health = 'degraded';
      reason = 'A child connection is missing forwarded media';
    }
    const source = this.depth === 0 && !this.parent;
    const parent = source
      ? { role: 'source', status: 'online', public_key: this.broadcaster || self || '' }
      : {
          role: 'parent',
          status: this.parent_status || (this.parent ? 'online' : 'unknown'),
          public_key: this.parent || this.pending_parent || '',
          link: this.parent_link || ''
        };
    if (!source && (parent.status === 'offline' || parent.status === 'unknown')) {
      health = this.recovering ? 'degraded' : 'disconnected';
      reason = this.recovering ? 'Parent disconnected. Reconnecting through the tree.' : 'Parent is disconnected';
    }
    return {
      max_slots: this.max_slots,
      occupied: online + grace + admissions,
      admissions,
      available,
      grace,
      direct: online,
      listeners: online + descendants,
      listeners_known: descendants_known,
      descendants,
      descendants_known,
      depth: this.depth,
      tree_path: this.tree_path || '',
      parent,
      health,
      reason,
      capacity_pending: this.capacity_pending || null,
      media_forwarded: !!this.media_forwarded,
      known_nodes: keys.size,
      children
    };
  }

  childSummaries() {
    return this.children.map((child) => {
      if (!child) return null;
      return {
        public_key: child.public_key,
        tree_path: child.tree_path,
        status: child.status,
        disconnected_at: child.disconnected_at || 0,
        downstream: child.downstream_known ? child.downstream : null,
        downstream_known: !!child.downstream_known,
        free_slots: child.free_slots == null ? null : child.free_slots,
        link_state: child.link_state || ''
      };
    });
  }

  retainSiblings(children) {
    const source = Array.isArray(children) ? children : [];
    const length = Math.max(source.length, this.max_slots);
    this.siblings = Array.from({ length }, (_, index) => {
      const child = source[index];
      if (!child || !child.public_key) return null;
      return {
        public_key: child.public_key,
        tree_path: child.tree_path || '',
        status: child.status || 'online',
        disconnected_at: child.disconnected_at || 0,
        free_slots: child.free_slots == null ? null : child.free_slots
      };
    });
  }

  adoptPublication(publication) {
    if (!publication) return;
    if (publication.id && this.id && publication.id !== this.id) return;
    this.id = this.id || publication.id;
    this.callId = this.callId || publication.callId;
    this.broadcaster = this.broadcaster || publication.broadcaster;
    if (publication.show) this.show = publication.show;
    if (this.outputs.length) return;
    this.inputs = (publication.inputs || []).map((input) => ({ ...input }));
    this.outputs = (publication.outputs || []).map((output) => ({
      ...output,
      inputs: (output.inputs || []).slice()
    }));
  }

  candidateIndex(exclude = '') {
    const known = [];
    const unknown = [];
    for (let index = 0; index < this.children.length; index += 1) {
      const child = this.children[index];
      if (!child || child.status !== 'online' || child.public_key === exclude) continue;
      if (child.free_slots === 0) continue;
      if (child.free_slots > 0) known.push(index);
      else unknown.push(index);
    }
    if (known.length) return known[0];
    if (unknown.length) return unknown[0];
    return -1;
  }

  announce() {
    this.sendSwarmUpdate('down').catch((err) => console.error(err));
    this.sendSwarmUpdate('up').catch((err) => console.error(err));
  }

  releaseTimers() {
    clearTimeout(this.upward_timer);
    clearTimeout(this.recovery_timer);
    clearTimeout(this.attempt_timer);
    clearTimeout(this.failure_timer);
    this.upward_timer = null;
    this.recovery_timer = null;
    this.attempt_timer = null;
    this.failure_timer = null;
    for (const child of this.children || []) this.clearChildTimers(child);
  }

  channelReady(public_key) {
    const pc = this.mod?.peerManager?.peers?.get(public_key);
    if (!pc) return false;
    const connected =
      pc.connectionState === 'connected' ||
      pc.iceConnectionState === 'connected' ||
      pc.iceConnectionState === 'completed';
    return connected && pc.dc?.readyState === 'open';
  }

  async sendSwarmUpdate(direction, target = '') {
    const mod = this.mod;
    if (!mod?.sendSwarmcast) return;
    const picture = this.census();
    const children = this.childSummaries();
    const message = {
      direction,
      publication_id: this.id,
      publicationId: this.id,
      callId: this.callId,
      public_key: this.selfKey(),
      parent: this.parent,
      grandparent: this.grandparent,
      tree_path: this.tree_path,
      depth: this.depth,
      status: this.parent_status === 'offline' ? 'disconnected' : 'online',
      free_slots: this.freeSlotCount(),
      downstream: picture.descendants,
      downstream_known: picture.descendants_known,
      children,
      publication: this.document(),
      admission: false
    };
    const recipients = [];
    if (target) recipients.push(target);
    else if (direction === 'down') {
      for (const child of this.children) {
        if (child && child.status === 'online') recipients.push(child.public_key);
      }
    } else if (direction === 'up' && this.parent) {
      recipients.push(this.parent);
    }
    for (const public_key of recipients) {
      await mod.sendSwarmcast(public_key, 'video-call-swarmcast-update', message);
    }
  }

  receiveSwarmUpdate(message, peer) {
    if (!message) return;
    const publication_id = message.publicationId || message.publication_id;
    if (publication_id && this.id && publication_id !== this.id) return;
    if (message.direction === 'up') {
      if (!this.childFor(peer)) return;
      const downstream = Number.isFinite(Number(message.downstream)) ? Number(message.downstream) : null;
      this.updateChild(peer, {
        tree_path: message.tree_path,
        free_slots: message.free_slots == null ? null : message.free_slots,
        downstream,
        downstream_known: message.downstream_known !== false && downstream != null,
        reported_children: Array.isArray(message.children) ? message.children : null
      });
      return;
    }
    if (message.direction !== 'down') return;
    const listed = (message.children || []).some((child) => child && child.public_key === this.selfKey());
    if (message.admission && !listed) {
      const candidate = (message.children || []).find((child) => child && child.public_key);
      this.noteReferral(peer, candidate?.public_key, candidate?.free_slots);
      return;
    }
    if (this.pending_parent && this.pending_parent !== this.parent && peer !== this.pending_parent) return;
    const topology = {
      grandparent: message.parent || '',
      tree_path: message.tree_path || message.public_key || peer,
      depth: Number(message.depth || 0) + 1,
      siblings: Array.isArray(message.children) ? message.children : []
    };
    const active = !this.parent || peer === this.parent;
    if (!active) {
      if (peer === this.pending_parent || this.upstreams.has(peer)) {
        this.noteUpstream(peer, topology);
        this.prepareCandidate(peer);
      }
      return;
    }
    this.noteUpstream(peer, topology);
    if (!this.parent) this.parent = message.public_key || peer || this.parent;
    this.grandparent = message.parent || '';
    const stem = message.tree_path || message.public_key || this.parent;
    this.tree_path = this.selfKey() ? `${stem}/${this.selfKey()}` : stem;
    this.depth = Number(message.depth || 0) + 1;
    this.retainSiblings(message.children);
    if (message.publication) this.adoptPublication(message.publication);
    this.noteState();
    this.sendSwarmUpdate('down').catch((err) => console.error(err));
  }

  answerChild(public_key) {
    const mod = this.mod;
    if (!mod?.peers?.connect || mod.peerManager?.peers?.get(public_key)) return;
    mod.peers.connect(public_key, { role: 'answer' });
  }

  armAdmission(child) {
    if (!child) return;
    this.clearChildTimers(child);
    const token = child.admission_token;
    child.admission_timer = setTimeout(() => {
      const current = this.childFor(child.public_key);
      if (!current || current.admission_token !== token || current.status !== 'pending') return;
      if (this.channelReady(child.public_key)) {
        this.onChildReconnected(child.public_key);
        return;
      }
      this.releaseAdmission(child.public_key);
    }, ADMISSION_TIMEOUT);
    child.admission_timer.unref?.();
  }

  releaseAdmission(public_key) {
    const child = this.childFor(public_key);
    if (!child || child.status !== 'pending') return;
    child.admission_token = (child.admission_token || 0) + 1;
    this.removeChild(public_key);
    if (!this.isCallMember(public_key)) this.mod?.peerManager?.removePeerConnection?.(public_key);
    this.finishCapacity();
    this.announce();
  }

  async replyJoin(public_key, data, accepted, reason) {
    const mod = this.mod;
    if (!mod?.sendSwarmcast) return;
    let candidate = '';
    let candidate_free_slots = null;
    if (!accepted && reason !== 'existing-call-connection') {
      const index = this.candidateIndex(public_key);
      const chosen = index < 0 ? null : this.children[index];
      candidate = chosen?.public_key || '';
      candidate_free_slots = chosen ? (chosen.free_slots == null ? null : chosen.free_slots) : null;
    }
    await mod.sendSwarmcast(public_key, 'video-call-swarmcast-join-response', {
      publicationId: data.publicationId || this.id,
      callId: data.callId || this.callId,
      contact: this.selfKey() || mod.publicKey,
      state: accepted ? 'ready' : 'unavailable',
      reason: accepted ? '' : reason || 'full',
      candidate,
      candidate_free_slots,
      publication: accepted ? this.document() : null
    });
  }

  async onConnectionRequest(public_key, message = {}) {
    const data = message || {};
    const live = !!this.id && (!data.publicationId || data.publicationId === this.id);
    let child = this.childFor(public_key);
    if (!live) {
      await this.replyJoin(public_key, data, false, '');
      return;
    }
    if (this.pathContains(public_key)) {
      await this.replyJoin(public_key, data, false, 'cycle');
      return;
    }
    if (child && (child.status === 'pending' || child.status === 'online')) {
      this.answerChild(public_key);
      if (child.status === 'pending') this.armAdmission(child);
      await this.replyJoin(public_key, data, true, '');
      return;
    }
    if (child && child.status === 'disconnected') {
      if (this.slotFree(child)) {
        this.removeChild(public_key);
        child = null;
      } else {
        child.status = 'pending';
        child.disconnected_at = 0;
        child.link_state = 'reserved';
        child.admission_token = (child.admission_token || 0) + 1;
        this.answerChild(public_key);
        this.armAdmission(child);
        this.noteState();
        this.announce();
        await this.replyJoin(public_key, data, true, '');
        return;
      }
    }
    if (!child) {
      child = this.addChild(public_key, 'pending');
      if (!child) {
        await this.replyJoin(public_key, data, false, 'full');
        return;
      }
      this.answerChild(public_key);
      this.armAdmission(child);
      this.announce();
    }
    await this.replyJoin(public_key, data, !!this.childFor(public_key), this.childFor(public_key) ? '' : 'full');
  }

  receiveJoinResponse(data) {
    if (!data) return;
    if (data.state !== 'ready' || !data.contact) {
      if (this.attempt_token && this.pending_parent) {
        if (this.holdingLiveParent(this.pending_parent)) this.abandonCandidate();
        else this.noteRefusal(data);
      }
      return;
    }
    if (this.attempt_token) {
      if (!this.pending_parent || data.contact !== this.pending_parent) return;
    } else if (this.pending_parent && data.contact !== this.pending_parent) {
      return;
    }
    const seeking = !!this.attempt_token;
    const keep = this.holdingLiveParent(data.contact);
    if (!keep) this.invalidateParentMedia();
    this.pending_parent = data.contact;
    this.noteUpstream(data.contact, { link: 'signalling' });
    if (!keep) {
      this.parent_status = 'admitted';
      this.parent_link = 'signalling';
    }
    if (!keep && (!seeking || !this.parent)) this.parent = data.contact;
    const origin = data.publication?.broadcaster || this.broadcaster;
    if (!seeking && data.contact === origin) {
      this.grandparent = '';
      this.depth = 1;
      this.tree_path = `${origin}/${this.selfKey()}`;
    }
    if (data.publication) this.adoptPublication(data.publication);
    this.openParentConnection(data.contact);
    this.noteState();
  }

  enqueueCandidate(public_key, free_slots) {
    if (!public_key || public_key === this.selfKey()) return;
    if (public_key === this.parent && this.parent_status === 'offline') return;
    if (this.admission_attempted.has(public_key)) return;
    if (free_slots === 0) return;
    if (this.recovery_targets.includes(public_key)) return;
    const known = Number(free_slots);
    if (known > 0) this.recovery_targets.unshift(public_key);
    else this.recovery_targets.push(public_key);
  }

  noteReferral(_from, public_key, free_slots) {
    if (!this.attempt_token || !this.pending_parent) return;
    this.enqueueCandidate(public_key, free_slots);
    this.advanceRecovery();
  }

  noteRefusal(data = {}) {
    const from = data.contact || '';
    if (this.pending_parent && from && from !== this.pending_parent) return;
    this.enqueueCandidate(data.candidate, data.candidate_free_slots);
    this.advanceRecovery();
  }

  takeTarget() {
    while (this.recovery_targets.length) {
      const next = this.recovery_targets.shift();
      if (!next || next === this.selfKey() || this.admission_attempted.has(next)) continue;
      return next;
    }
    return '';
  }

  failSeeking() {
    clearTimeout(this.attempt_timer);
    this.attempt_timer = null;
    clearTimeout(this.recovery_timer);
    this.recovery_timer = null;
    this.recovering = false;
    this.recovery_targets = [];
    this.pending_parent = '';
    this.noteState();
  }

  armAttempt(public_key, token) {
    clearTimeout(this.attempt_timer);
    this.attempt_timer = setTimeout(() => {
      if (this.attempt_token !== token || this.pending_parent !== public_key) return;
      if (this.parent === public_key && ['channel', 'subscribed', 'mapped', 'forwarding'].includes(this.parent_link)) return;
      if (this.channelReady(public_key)) {
        this.commitParent(public_key);
        return;
      }
      this.advanceRecovery();
    }, ADMISSION_TIMEOUT);
    this.attempt_timer.unref?.();
  }

  async joinNewParent(public_key) {
    const mod = this.mod;
    if (!mod || !public_key || public_key === this.selfKey()) return false;
    if (this.admission_attempted.has(public_key)) return false;
    if (this.admission_attempted.size >= ADMISSION_ATTEMPTS) {
      this.failSeeking();
      return false;
    }
    const token = ++this.attempt_token;
    this.admission_attempted.add(public_key);
    this.pending_parent = public_key;
    this.recovering = true;
    try {
      await mod.sendSwarmcast(public_key, 'video-call-swarmcast-join-request', {
        publicationId: this.id,
        callId: this.callId,
        broadcaster: this.broadcaster,
        tree_path: this.tree_path
      });
    } catch (err) {
      console.error(err);
      if (this.attempt_token === token) this.advanceRecovery();
      return false;
    }
    if (this.attempt_token !== token || this.pending_parent !== public_key) return true;
    this.armAttempt(public_key, token);
    return true;
  }

  advanceRecovery() {
    if (!this.recovering && !this.attempt_token) return;
    this.recovering = true;
    const next = this.takeTarget();
    if (next) {
      this.joinNewParent(next);
      return;
    }
    if (
      this.broadcaster &&
      this.broadcaster !== this.selfKey() &&
      !this.admission_attempted.has(this.broadcaster)
    ) {
      this.joinNewParent(this.broadcaster);
      return;
    }
    this.failSeeking();
  }

  openParentConnection(public_key) {
    const mod = this.mod;
    if (!mod?.peers?.connect || !public_key) return;
    const view = mod.swarmcastView;
    if (view && !view.closed && view.phase === 'joining') return;
    if (mod.peerManager?.peers?.get(public_key)) return;
    const token = this.attempt_token;
    mod.peers.connect(public_key, {
      role: 'offer',
      onReady: (peerId) => {
        if (token && this.attempt_token !== token) return;
        if (this.pending_parent !== public_key && this.parent !== public_key) return;
        Promise.resolve(mod.peerManager.sendJoinTransaction(peerId)).catch((err) => console.error(err));
      }
    });
  }

  onNewChild(public_key) {
    const child = this.addChild(public_key);
    if (!child) return null;
    this.updateMediaStreams(public_key);
    return child;
  }

  onChildDisconnected(public_key) {
    const child = this.childFor(public_key);
    if (!child || this.isCallMember(public_key)) return;
    if (child.status === 'pending') {
      this.releaseAdmission(public_key);
      return;
    }
    child.status = 'disconnected';
    child.link_state = 'down';
    if (!child.disconnected_at) child.disconnected_at = Date.now();
    this.armGrace(child);
    if (!this.isCallMember(public_key)) this.mod?.peerManager?.removePeerConnection?.(public_key);
    this.finishCapacity();
    this.announce();
    this.noteState();
  }

  armGrace(child) {
    if (!child) return;
    clearTimeout(child.grace_timer);
    const token = child.admission_token;
    child.grace_timer = setTimeout(() => {
      const current = this.childFor(child.public_key);
      if (!current || current.admission_token !== token || current.status === 'online' || current.status === 'pending') return;
      if (this.channelReady(child.public_key)) {
        this.onChildReconnected(child.public_key);
        return;
      }
      this.removeChild(child.public_key);
      this.mod?.peerManager?.removePeerConnection?.(child.public_key);
      this.announce();
    }, this.grace_interval);
    child.grace_timer.unref?.();
  }

  onChildLink(public_key, kind) {
    const child = this.childFor(public_key);
    if (!child || child.status === 'expired') return;
    if (kind === 'stun' && child.link_state === 'reserved') child.link_state = 'stun';
    if (kind === 'channel' || this.channelReady(public_key)) this.onChildReconnected(public_key);
    else this.noteState();
  }

  onChildReconnected(public_key) {
    let child = this.childFor(public_key);
    if (!child) return;
    if (child.status === 'disconnected' && this.slotFree(child)) {
      this.removeChild(public_key);
      child = this.addChild(public_key, 'online');
      if (!child) return;
    }
    this.clearChildTimers(child);
    child.status = 'online';
    child.disconnected_at = 0;
    child.connected_at = child.connected_at || Date.now();
    if (child.link_state !== 'subscribed' && child.link_state !== 'mapped') child.link_state = 'channel';
    if (child.link_state === 'subscribed' || child.link_state === 'mapped') this.updateMediaStreams(public_key);
    this.announce();
    this.noteState();
  }

  onLinkFailure(public_key, state) {
    if (state !== 'failed' && state !== 'disconnected' && state !== 'closed') return;
    const child = this.childFor(public_key);
    if (child) {
      if (child.status === 'pending' && (state === 'failed' || state === 'closed')) {
        this.releaseAdmission(public_key);
        return;
      }
      if (child.status !== 'online') return;
      child.status = 'disconnected';
      child.link_state = 'down';
      if (!child.disconnected_at) child.disconnected_at = Date.now();
      this.armGrace(child);
      this.announce();
      this.noteState();
      return;
    }
    if (public_key !== this.parent && public_key !== this.pending_parent) return;
    if (this.pending_parent && public_key !== this.pending_parent) return;
    this.armParentFailure(public_key);
  }

  armParentFailure(public_key) {
    clearTimeout(this.failure_timer);
    const token = ++this.failure_token;
    this.failure_timer = setTimeout(() => {
      if (this.failure_token !== token) return;
      if (this.channelReady(public_key)) return;
      if (this.recovering) return;
      this.onParentDisconnected(public_key);
    }, FAILURE_GRACE);
    this.failure_timer.unref?.();
  }

  recoveryStillNeeded() {
    if (this.channelReady(this.parent) && this.parent_status !== 'offline') return false;
    if (['channel', 'subscribed', 'mapped', 'forwarding'].includes(this.parent_link) && this.channelReady(this.parent)) {
      return false;
    }
    return this.parent_status === 'offline' || this.parent_status === 'disconnected' || this.recovering;
  }

  onParentDisconnected(peerId = '', options = {}) {
    const keepMedia = !!options.keepMedia;
    if (peerId && peerId !== this.parent && peerId !== this.pending_parent) return;
    if (this.recovering && this.pending_parent && peerId && peerId === this.pending_parent && peerId !== this.parent) {
      this.advanceRecovery();
      return;
    }
    if (this.recovering) {
      if (peerId && peerId === this.parent && this.pending_parent && this.pending_parent !== this.parent) {
        if (!keepMedia) {
          this.parent_status = 'offline';
          this.parent_link = 'down';
          this.parent_disconnected_at = Date.now();
          this.invalidateParentMedia();
          const failed = this.upstreams.get(this.parent);
          if (failed) failed.usable = false;
          this.requestMedia(this.pending_parent);
        }
      }
      return;
    }
    if (!this.parent && !this.pending_parent) return;
    if (!keepMedia) {
      this.parent_status = 'offline';
      this.parent_link = 'down';
      this.parent_disconnected_at = Date.now();
      this.invalidateParentMedia();
      const failed = this.upstreams.get(this.parent);
      if (failed) failed.usable = false;
    }
    this.admission_attempted = new Set();
    this.recovery_targets = [];
    clearTimeout(this.recovery_timer);
    this.noteState();
    const self = this.selfKey();
    const index = this.siblings.findIndex((slot) => slot && slot.public_key === self);
    if (this.depth <= 1 || !this.grandparent) {
      this.joinNewParent(this.broadcaster);
      return;
    }
    if (index <= 0) {
      this.joinNewParent(this.grandparent);
      return;
    }
    const slot_zero = this.siblings[0];
    const targets = [];
    const add = (slot) => {
      const key = slot?.public_key;
      if (!key || key === self || targets.includes(key) || slot.free_slots === 0) return;
      targets.push(key);
    };
    add(slot_zero);
    for (let cursor = 1; cursor < this.siblings.length; cursor += 1) add(this.siblings[cursor]);
    this.recovery_targets = targets;
    this.recovering = true;
    const retain = keepMedia;
    this.recovery_timer = setTimeout(() => {
      if (!retain && !this.recoveryStillNeeded()) return;
      if (!retain && this.channelReady(this.parent)) return;
      const next = this.takeTarget();
      if (next) this.joinNewParent(next);
      else this.joinNewParent(this.broadcaster);
    }, Math.max(index, 1) * RECOVERY_GAP);
    this.recovery_timer.unref?.();
  }

  onParentLink(public_key, kind) {
    if (public_key !== this.parent && public_key !== this.pending_parent) return;
    if (this.pending_parent && public_key !== this.pending_parent) return;
    if (kind === 'channel' || this.channelReady(public_key)) {
      if (this.recovering && !this.pending_parent && public_key === this.parent) {
        clearTimeout(this.recovery_timer);
        this.recovery_timer = null;
        this.recovering = false;
        this.parent_status = 'online';
        this.parent_link = 'channel';
        this.parent_disconnected_at = 0;
        this.subscribeToParent();
        this.pushBroadcast();
        this.announce();
        this.noteState();
        return;
      }
      this.candidateReady(public_key);
      return;
    }
    if (kind === 'stun') {
      this.parent_link = 'stun';
      this.noteState();
    }
  }

  onParentReconnected(public_key) {
    this.onParentLink(public_key, 'stun');
  }

  invalidateParentMedia() {
    this.parent_mids = new Map();
    if (['mapped', 'forwarding', 'subscribed'].includes(this.parent_link)) this.parent_link = 'down';
    this.media_forwarded = false;
    for (const child of this.children) {
      if (!child) continue;
      child.last_map = '';
    }
  }

  commitParent(public_key) {
    if (!public_key) return;
    if (this.pending_parent && public_key !== this.pending_parent) return;
    const previous = this.parent;
    this.parent = public_key;
    this.pending_parent = public_key;
    this.parent_status = 'online';
    this.parent_link = 'channel';
    this.parent_disconnected_at = 0;
    clearTimeout(this.attempt_timer);
    this.attempt_timer = null;
    clearTimeout(this.recovery_timer);
    this.recovery_timer = null;
    clearTimeout(this.failure_timer);
    this.failure_timer = null;
    if (previous && previous !== public_key) {
      this.parent_mids = new Map();
      this.media_forwarded = false;
    }
    if (previous && previous !== public_key && !this.isCallMember(previous)) {
      try {
        this.mod?.peerManager?.removePeerConnection?.(previous);
      } catch (err) {
        console.error(err);
      }
    }
    const row = this.upstreams.get(public_key);
    if (row?.depth != null) {
      this.depth = row.depth;
      this.grandparent = row.grandparent || '';
      if (row.tree_path) this.tree_path = this.selfKey() ? `${row.tree_path}/${this.selfKey()}` : row.tree_path;
      if (row.siblings?.length) this.retainSiblings(row.siblings);
    }
    const origin = this.broadcaster;
    if (public_key === origin) {
      this.grandparent = '';
      this.depth = 1;
      this.tree_path = `${origin}/${this.selfKey()}`;
    }
    if (row?.usable && row.mids?.size) {
      this.parent_mids = row.mids;
      this.parent_link = 'mapped';
    }
    this.recovering = false;
    this.recovery_targets = [];
    this.admission_attempted = new Set();
    this.subscribeToParent();
    this.pushBroadcast();
    this.announce();
    this.noteState();
    this.mod?.persistSwarmcastState?.();
  }

  subscribeToParent() {
    this.subscribeUpstream(this.parent || this.pending_parent);
  }

  subscribeUpstream(contact) {
    const mod = this.mod;
    if (!mod?.sendSwarmcast || !contact || !this.id) return;
    const connected = mod.peerManager?.hasConnectionWithPeer?.(contact);
    if (connected === false) return;
    const row = this.noteUpstream(contact, {});
    if (row.mediaRequested && row.link !== 'channel' && contact !== this.parent) return;
    row.mediaRequested = true;
    if (contact === this.parent) {
      if (!['mapped', 'forwarding'].includes(this.parent_link)) this.parent_link = 'subscribed';
    } else this.noteUpstream(contact, { link: 'subscribed' });
    const output_ids = (this.outputs || []).map((output) => output.id);
    mod
      .sendSwarmcast(contact, 'video-call-swarmcast-subscribe', {
        publicationId: this.id,
        callId: this.callId,
        outputIds: output_ids
      })
      .catch((err) => console.error(err));
  }

  requestMedia(public_key) {
    if (!public_key || public_key === this.parent) return;
    this.subscribeUpstream(public_key);
  }

  prepareCandidate(public_key) {
    if (!public_key || public_key === this.parent) return;
    const row = this.upstreams.get(public_key);
    if (!row) return;
    const live = this.holdingLiveParent(public_key);
    if (!live) {
      if (row.usable) this.commitParent(public_key);
      return;
    }
    if (row.depth == null) return;
    if (!(row.depth < this.depth)) {
      if (!row.mediaRequested) this.abandonCandidate();
      return;
    }
    if (!row.usable) {
      this.requestMedia(public_key);
      return;
    }
    this.commitParent(public_key);
  }

  candidateReady(public_key) {
    if (this.holdingLiveParent(public_key)) {
      this.pending_parent = public_key;
      this.noteUpstream(public_key, { link: 'channel' });
      this.prepareCandidate(public_key);
      this.noteState();
      return;
    }
    this.commitParent(public_key);
  }

  receiveParentTracks(data, from = '') {
    const source = from || this.pending_parent || this.parent;
    const mids = new Map((data?.outputs || []).map((output) => [output.id, output.mids || []]));
    const usable = this.tracksLive(source, mids);
    this.noteUpstream(source, { mids, link: 'mapped', usable });
    if (source && source !== this.parent && this.parent) {
      this.prepareCandidate(source);
      return;
    }
    if (data?.publication) this.adoptPublication(data.publication);
    this.parent_mids = mids;
    this.parent_link = 'mapped';
    this.pushBroadcast();
    this.notifyFormerChildren();
    this.noteState();
  }

  forwardedStream(output) {
    const mids = this.parent_mids?.get?.(output.id) || [];
    const pc = this.mod?.peerManager?.peers?.get(this.parent);
    if (!pc || !mids.length || typeof pc.getTransceivers !== 'function') return null;
    const tracks = [];
    for (const item of mids) {
      const transceiver = pc.getTransceivers().find((entry) => entry.mid === item.mid);
      const track = transceiver?.receiver?.track;
      if (track && track.readyState !== 'ended' && (!item.kind || track.kind === item.kind)) tracks.push(track);
    }
    if (!tracks.length) return null;
    return { getTracks: () => tracks };
  }

  mediaFor(output) {
    const local = this.streamFor(output, this.mod?.streams);
    if ((local?.getTracks?.() || []).length) return local;
    return this.forwardedStream(output);
  }

  watchBroadcastNegotiation(peerId, pc) {
    if (!pc || pc.swarmcastNegotiationWatched || typeof pc.addEventListener !== 'function') return;
    pc.swarmcastNegotiationWatched = true;
    pc.addEventListener('negotiationneeded', () => {
      mediaApi().pipelineTrace('broadcaster', 'negotiation', {
        peer: peerId,
        event: 'negotiationneeded',
        signaling: pc.signalingState,
        handledBy: 'stun',
        result: 'desired direction is unchanged until the answer is applied'
      });
      const kinds =
        typeof pc.getSenders === 'function'
          ? pc.getSenders()
              .map((sender) => sender.track?.kind)
              .filter(Boolean)
              .join(',')
          : '';
      console.info(
        'SWARMCAST MEDIA TRACE',
        'negotiationneeded',
        peerId,
        'signaling',
        pc.signalingState,
        'tracks',
        kinds || 'none'
      );
    });
  }

  updateMediaStreams(public_key) {
    const child = this.childFor(public_key);
    const pc = this.mod?.peerManager?.peers?.get(public_key);
    if (!child || !pc) {
      console.info(
        'SWARMCAST MEDIA TRACE',
        'updateMediaStreams',
        public_key,
        'child',
        child ? 'yes' : 'no',
        'peer',
        pc ? 'yes' : 'no'
      );
      return;
    }
    if (child.link_state !== 'subscribed' && child.link_state !== 'mapped') return;
    const api = mediaApi();
    this.watchBroadcastNegotiation(public_key, pc);
    api.syncSenders(
      pc,
      child.media_streams,
      this.outputs,
      (output) => this.mediaFor(output),
      api.broadcastLimits(this.mod),
      { mod: this.mod, peerId: public_key }
    );
    this.publishTrackMap(public_key);
    this.noteState();
  }

  pushBroadcast() {
    if (!this.mod) return;
    let waiting = 0;
    let forwarded = 0;
    for (const child of this.children) {
      if (!child || child.status === 'pending') continue;
      const pc = this.mod.peerManager?.peers?.get(child.public_key);
      const output_ids = this.outputs.map((output) => output.id).join(',');
      console.info(
        'SWARMCAST MEDIA TRACE',
        'pushBroadcast',
        child.public_key,
        'outputs',
        output_ids || 'none',
        'peer',
        pc ? 'yes' : 'no'
      );
      if (!pc || child.status !== 'online') continue;
      waiting += 1;
      this.updateMediaStreams(child.public_key);
      const live = (child.media_streams || []).some(
        (item) => item.sender?.track && item.sender.track.readyState !== 'ended'
      );
      if (live && child.last_map) forwarded += 1;
    }
    if (!waiting) {
      this.media_forwarded =
        this.parent_link === 'mapped' || this.parent_link === 'forwarding' || (this.depth === 0 && !this.parent);
    } else {
      this.media_forwarded = forwarded === waiting;
      if (this.media_forwarded) this.parent_link = 'forwarding';
    }
    this.notifyFormerChildren();
  }

  publishTrackMap(public_key) {
    const child = this.childFor(public_key);
    const pc = this.mod?.peerManager?.peers?.get(public_key);
    if (!child || !pc) {
      console.info(
        'SWARMCAST MEDIA TRACE',
        'tracks withheld',
        public_key,
        !child ? 'no child' : 'no peer connection'
      );
      return;
    }
    if (pc.signalingState !== 'stable') {
      console.info('SWARMCAST MEDIA TRACE', 'tracks withheld', public_key, 'signaling', pc.signalingState);
      return;
    }
    const outputs = mediaApi().trackMap(child.media_streams, pc);
    if (!outputs || (!outputs.length && !child.last_map)) {
      console.info(
        'SWARMCAST MEDIA TRACE',
        'tracks withheld',
        public_key,
        'mids not ready',
        'senders',
        child.media_streams.length
      );
      return;
    }
    const data = {
      publicationId: this.id,
      callId: this.callId,
      publication: this.document(),
      outputs
    };
    const encoded = JSON.stringify(data);
    if (child.last_map === encoded) {
      console.info('SWARMCAST MEDIA TRACE', 'tracks withheld', public_key, 'unchanged');
      return;
    }
    const mids = outputs
      .map((output) => `${output.id}:${(output.mids || []).map((item) => item.mid).join('+')}`)
      .join(',');
    console.info('SWARMCAST MEDIA TRACE', 'tracks sent', public_key, 'outputs', outputs.length, 'mids', mids);
    child.last_map = encoded;
    child.link_state = 'mapped';
    this.mod.sendSwarmcast(public_key, 'video-call-swarmcast-tracks', data).catch((err) => {
      console.error(err);
      if (child.last_map === encoded) child.last_map = '';
    });
  }

  acceptBroadcastSubscribe(from, data = {}) {
    const requested = Array.isArray(data.outputIds) ? data.outputIds.length : 0;
    if (!this.id || data.publicationId !== this.id) {
      console.info('SWARMCAST MEDIA TRACE', 'acceptBroadcastSubscribe', from, 'requested', requested, 'child', 'rejected');
      return;
    }
    const pc = this.mod?.peerManager?.peers?.get(from);
    if (!pc) {
      console.info('SWARMCAST MEDIA TRACE', 'acceptBroadcastSubscribe', from, 'requested', requested, 'child', 'no peer connection');
      return;
    }
    let child = this.childFor(from);
    const added = !child;
    if (!child) {
      child = this.addChild(from, 'online');
      if (!child) {
        console.info('SWARMCAST MEDIA TRACE', 'acceptBroadcastSubscribe', from, 'requested', requested, 'child', 'full');
        return;
      }
    }
    if (child.status === 'pending' || child.status === 'disconnected') {
      this.clearChildTimers(child);
      child.status = 'online';
      child.disconnected_at = 0;
      child.connected_at = child.connected_at || Date.now();
    }
    child.link_state = 'subscribed';
    console.info(
      'SWARMCAST MEDIA TRACE',
      'acceptBroadcastSubscribe',
      from,
      'requested',
      requested,
      'child',
      added ? 'added' : 'existing'
    );
    this.updateMediaStreams(from);
    this.announce();
  }

  onSignalingState(public_key, state) {
    const child = this.childFor(public_key);
    const pc = this.mod?.peerManager?.peers?.get(public_key);
    const api = mediaApi();
    if (child) api.noteNegotiationState(child.media_streams, state);
    if (state !== 'stable') return;
    if (pc && child) api.settleSenders(pc, child.media_streams, api.broadcastLimits(this.mod), { mod: this.mod, peerId: public_key });
    this.publishTrackMap(public_key);
  }

  onTrack(public_key) {
    if (public_key === this.parent || public_key === this.pending_parent) this.pushBroadcast();
  }

  scheduleUpward() {
    clearTimeout(this.upward_timer);
    const delay = UPWARD_MIN + Math.floor(Math.random() * UPWARD_SPAN);
    this.upward_timer = setTimeout(() => {
      this.sendSwarmUpdate('up').catch((err) => console.error(err));
      this.scheduleUpward();
    }, delay);
    this.upward_timer.unref?.();
  }

  distributionPeers() {
    return this.children.map((child) => child && child.public_key).filter(Boolean);
  }

  canForward() {
    if (!this.parent && (this.depth === 0 || this.selfKey() === this.broadcaster)) return !!this.media_forwarded;
    return this.upstreamUsable(this.parent);
  }

  notifyFormerChildren() {
    if (!this.mod?.sendSwarmcast || !this.canForward() || this.departing || this.ended) return;
    const picture = {
      publicationId: this.id,
      callId: this.callId,
      broadcaster: this.broadcaster,
      tree_path: this.tree_path,
      depth: this.depth,
      free_slots: this.freeSlotCount()
    };
    for (const key of this.former_children) {
      if (!key || this.notified_children.has(key)) continue;
      const child = this.childFor(key);
      if (child && (child.status === 'online' || child.status === 'pending')) continue;
      this.notified_children.add(key);
      Promise.resolve(this.mod.sendSwarmcast(key, 'video-call-swarmcast-parent-available', picture)).catch((err) => {
        console.error(err);
        this.notified_children.delete(key);
      });
    }
  }

  receiveParentAvailable(message, from) {
    if (!message || this.departing || this.ended) return;
    const publication = message.publicationId || message.publication_id;
    if (publication && this.id && publication !== this.id) return;
    if (message.broadcaster && this.broadcaster && message.broadcaster !== this.broadcaster) return;
    if (!from || from === this.selfKey() || from === this.parent) return;
    if (this.pathContains(this.selfKey(), message.tree_path)) return;
    if (message.free_slots === 0) return;
    const reported = Number(message.depth);
    const nextDepth = Number.isFinite(reported) ? reported + 1 : null;
    if (this.holdingLiveParent(from) && nextDepth != null && this.depth > 0 && nextDepth >= this.depth) return;
    this.noteUpstream(from, { depth: nextDepth, tree_path: message.tree_path || '', link: 'invited' });
    if (this.pending_parent && this.pending_parent !== this.parent && this.pending_parent !== from) return;
    this.joinNewParent(from);
  }

  receiveParentLeaving(message, from) {
    if (!message || message.publicationId !== this.id || this.ended) return;
    if (from !== this.parent && from !== this.pending_parent) return;
    this.onParentDisconnected(from, { keepMedia: true });
  }

  async announceDeparture() {
    const root = this.selfKey() === this.broadcaster && !this.parent;
    const request = root ? 'video-call-swarmcast-ended' : 'video-call-swarmcast-parent-leaving';
    const peers = [...new Set([...this.distributionPeers(), ...this.former_children])];
    const data = { publicationId: this.id, callId: this.callId, broadcaster: this.broadcaster };
    for (const peer of peers) {
      if (!peer || peer === this.selfKey()) continue;
      await this.mod?.sendSwarmcast?.(peer, request, data);
    }
    return { root, request, peers };
  }

  receivePublicationEnded(message) {
    if (!message || message.publicationId !== this.id || this.ended) return;
    this.ended = true;
    this.departing = true;
    const peers = [...new Set([...this.distributionPeers(), ...this.former_children])];
    const data = { publicationId: this.id, callId: this.callId, broadcaster: this.broadcaster };
    for (const peer of peers) {
      if (!peer) continue;
      Promise.resolve(
        this.mod?.sendSwarmcast?.(peer, 'video-call-swarmcast-ended', data)
      ).catch((err) => console.error(err));
    }
    this.former_children = [];
    this.releaseTimers();
    this.mod?.clearSwarmcastRecovery?.();
  }

  clearChildren() {
    for (const child of this.children) this.clearChildTimers(child);
    for (let index = 0; index < this.children.length; index += 1) this.children[index] = null;
  }
}

module.exports = Swarmcast;
