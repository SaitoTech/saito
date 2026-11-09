const MAX_SLOTS = 4;
const GRACE_INTERVAL = 30000;
const UPWARD_MIN = 45000;
const UPWARD_SPAN = 30000;

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
    this.events_bound = false;
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
    return !!(slot.disconnected_at && now - slot.disconnected_at > this.grace_interval);
  }

  freeSlotCount() {
    const now = Date.now();
    return this.children.filter((slot) => this.slotFree(slot, now)).length;
  }

  addChild(public_key) {
    if (!public_key || public_key === this.selfKey()) return null;
    const existing = this.childFor(public_key);
    if (existing) return existing;
    const now = Date.now();
    let index = this.children.findIndex((slot) => slot == null);
    if (index < 0) {
      index = this.children.findIndex((slot) => this.slotFree(slot, now) && slot);
    }
    if (index < 0) return null;
    const record = {
      public_key,
      tree_path: this.tree_path ? `${this.tree_path}/${public_key}` : public_key,
      status: 'online',
      disconnected_at: 0,
      media_streams: [],
      last_map: ''
    };
    this.children[index] = record;
    return record;
  }

  updateChild(public_key, patch = {}) {
    const child = this.childFor(public_key);
    if (!child) return null;
    if (patch.tree_path != null) child.tree_path = patch.tree_path;
    if (patch.status) child.status = patch.status;
    if (patch.disconnected_at != null) child.disconnected_at = patch.disconnected_at;
    if (patch.last_map != null) child.last_map = patch.last_map;
    if (patch.free_slots != null) child.free_slots = patch.free_slots;
    if (!patch || !Object.keys(patch).length) {
      child.status = 'online';
      child.disconnected_at = 0;
    }
    return child;
  }

  removeChild(public_key) {
    const index = this.children.findIndex((child) => child && child.public_key === public_key);
    if (index < 0) return false;
    this.children[index] = null;
    return true;
  }

  childSummaries() {
    return this.children.map((child) => {
      if (!child) return null;
      return {
        public_key: child.public_key,
        tree_path: child.tree_path,
        status: child.status,
        disconnected_at: child.disconnected_at || 0
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
        disconnected_at: child.disconnected_at || 0
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

  candidateIndex() {
    for (let index = 0; index < this.children.length; index += 1) {
      const child = this.children[index];
      if (!child || child.status !== 'online') continue;
      if (child.free_slots == null || child.free_slots > 0) return index;
    }
    return -1;
  }

  async sendSwarmUpdate(direction, target = '') {
    const mod = this.mod;
    if (!mod?.sendSwarmcast) return;
    const admission = direction === 'down' && !!target;
    let children = this.childSummaries();
    if (admission) {
      const index = this.candidateIndex();
      if (index < 0) {
        await mod.sendSwarmcast(target, 'video-call-swarmcast-join-response', {
          publicationId: this.id,
          callId: this.callId,
          contact: this.selfKey(),
          state: 'unavailable',
          reason: '',
          publication: null
        });
        return;
      }
      children = children.map((child, childIndex) => (childIndex === index ? child : null));
    }
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
      status: 'online',
      free_slots: this.freeSlotCount(),
      children,
      publication: this.document(),
      admission
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
      this.updateChild(peer, {
        tree_path: message.tree_path,
        status: message.status || 'online',
        free_slots: message.free_slots
      });
      return;
    }
    if (message.direction !== 'down') return;
    const listed = (message.children || []).some((child) => child && child.public_key === this.selfKey());
    if (message.admission && !listed) {
      const candidate = (message.children || []).find((child) => child && child.public_key);
      if (!candidate) return;
      const view = this.mod?.swarmcastView;
      if (view && !view.closed) {
        view.receiveAdmission(message);
        return;
      }
      this.joinNewParent(candidate.public_key);
      return;
    }
    if (peer !== this.parent && peer !== this.pending_parent && this.parent) return;
    if (!this.parent) this.parent = message.public_key || peer || this.parent;
    this.grandparent = message.parent || '';
    const stem = message.tree_path || message.public_key || this.parent;
    this.tree_path = this.selfKey() ? `${stem}/${this.selfKey()}` : stem;
    this.depth = Number(message.depth || 0) + 1;
    this.retainSiblings(message.children);
    if (message.publication) this.adoptPublication(message.publication);
    this.sendSwarmUpdate('down').catch((err) => console.error(err));
  }

  async onConnectionRequest(public_key, message = {}) {
    const mod = this.mod;
    const data = message || {};
    const live = !!this.id && (!data.publicationId || data.publicationId === this.id);
    const in_call = this.isCallMember(public_key);
    let child = this.childFor(public_key);
    const peer = mod?.peerManager?.peers?.get(public_key);
    const foreign = !!(peer && !child);
    const occupied = !!(live && (in_call || foreign));
    if (live && !occupied && !child) {
      child = this.addChild(public_key);
      if (!child) {
        await this.sendSwarmUpdate('down', public_key);
        return;
      }
      if (!peer) mod.peers.connect(public_key, { role: 'answer' });
    }
    if (live && !occupied && child && child.disconnected_at) {
      child.status = 'online';
      child.disconnected_at = 0;
    }
    const accepted = live && !occupied && !!this.childFor(public_key);
    await mod.sendSwarmcast(public_key, 'video-call-swarmcast-join-response', {
      publicationId: data.publicationId || this.id,
      callId: data.callId || this.callId,
      contact: this.selfKey() || mod.publicKey,
      state: accepted ? 'ready' : 'unavailable',
      reason: occupied ? 'existing-call-connection' : '',
      publication: accepted ? this.document() : null
    });
  }

  receiveJoinResponse(data) {
    if (!data) return;
    if (data.state !== 'ready' || !data.contact) {
      if (this.recovering) this.advanceRecovery();
      return;
    }
    if (this.pending_parent && data.contact !== this.pending_parent) return;
    this.parent = data.contact;
    this.pending_parent = data.contact;
    this.parent_status = 'online';
    this.parent_disconnected_at = 0;
    this.recovering = false;
    this.recovery_targets = [];
    const origin = data.publication?.broadcaster || this.broadcaster;
    if (data.contact === origin) {
      this.grandparent = '';
      this.depth = 1;
      this.tree_path = `${origin}/${this.selfKey()}`;
    }
    if (data.publication) this.adoptPublication(data.publication);
  }

  async joinNewParent(public_key) {
    const mod = this.mod;
    if (!mod || !public_key || public_key === this.selfKey()) return false;
    this.pending_parent = public_key;
    this.recovering = true;
    try {
      await mod.sendSwarmcast(public_key, 'video-call-swarmcast-join-request', {
        publicationId: this.id,
        callId: this.callId
      });
    } catch (err) {
      console.error(err);
      this.advanceRecovery();
      return false;
    }
    if (!mod.peerManager?.peers?.get(public_key)) {
      mod.peers.connect(public_key, {
        role: 'offer',
        onReady: (peerId) => {
          Promise.resolve(mod.peerManager.sendJoinTransaction(peerId)).catch((err) => console.error(err));
        }
      });
    }
    return true;
  }

  advanceRecovery() {
    const next = this.recovery_targets.shift();
    if (next) {
      this.joinNewParent(next);
      return;
    }
    if (this.broadcaster && this.pending_parent !== this.broadcaster) {
      this.recovery_targets = [];
      this.joinNewParent(this.broadcaster);
    }
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
    child.status = 'offline';
    if (!child.disconnected_at) child.disconnected_at = Date.now();
    if (!this.isCallMember(public_key)) {
      this.mod?.peerManager?.removePeerConnection?.(public_key);
    }
  }

  onChildReconnected(public_key) {
    const child = this.childFor(public_key);
    if (!child) return;
    if (child.disconnected_at && Date.now() - child.disconnected_at > this.grace_interval) {
      this.removeChild(public_key);
      this.addChild(public_key);
    } else {
      child.status = 'online';
      child.disconnected_at = 0;
    }
    this.updateMediaStreams(public_key);
  }

  onParentDisconnected() {
    if (!this.parent && !this.pending_parent) return;
    if (this.recovering) return;
    const view = this.mod?.swarmcastView;
    const has_children = this.children.some(Boolean);
    if (view && !view.closed && !has_children) return;
    this.parent_status = 'offline';
    this.parent_disconnected_at = Date.now();
    const self = this.selfKey();
    const index = this.siblings.findIndex((slot) => slot && slot.public_key === self);
    clearTimeout(this.recovery_timer);
    if (this.depth <= 1 || !this.grandparent) {
      this.joinNewParent(this.broadcaster);
      return;
    }
    if (index <= 0) {
      this.joinNewParent(this.grandparent);
      return;
    }
    const slot_zero = this.siblings[0]?.public_key;
    const targets = [];
    if (slot_zero && slot_zero !== self) targets.push(slot_zero);
    for (let cursor = 1; cursor < this.siblings.length; cursor += 1) {
      const key = this.siblings[cursor]?.public_key;
      if (!key || key === self || key === slot_zero) continue;
      targets.push(key);
    }
    this.recovery_targets = targets;
    this.recovering = true;
    this.recovery_timer = setTimeout(() => {
      const next = this.recovery_targets.shift();
      if (next) this.joinNewParent(next);
      else this.joinNewParent(this.broadcaster);
    }, index * 2000);
  }

  onParentReconnected(public_key) {
    if (public_key !== this.parent && public_key !== this.pending_parent) return;
    if (!this.parent) this.parent = public_key;
    this.parent_status = 'online';
    this.parent_disconnected_at = 0;
    this.recovering = false;
    this.subscribeToParent();
    this.pushBroadcast();
  }

  subscribeToParent() {
    const mod = this.mod;
    const contact = this.parent || this.pending_parent;
    if (!mod?.sendSwarmcast || !contact || !this.id) return;
    if (mod.swarmcastView && !mod.swarmcastView.closed) return;
    const connected = mod.peerManager?.hasConnectionWithPeer?.(contact);
    if (connected === false) return;
    const output_ids = (this.outputs || []).map((output) => output.id);
    mod
      .sendSwarmcast(contact, 'video-call-swarmcast-subscribe', {
        publicationId: this.id,
        callId: this.callId,
        outputIds: output_ids
      })
      .catch((err) => console.error(err));
  }

  receiveParentTracks(data) {
    if (data?.publication) this.adoptPublication(data.publication);
    this.parent_mids = new Map((data?.outputs || []).map((output) => [output.id, output.mids || []]));
    this.pushBroadcast();
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
  }

  pushBroadcast() {
    if (!this.mod) return;
    for (const child of this.children) {
      if (!child) continue;
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
      if (!pc) continue;
      this.updateMediaStreams(child.public_key);
    }
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
    if (!outputs) {
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
    if (this.isCallMember(from)) {
      console.info('SWARMCAST MEDIA TRACE', 'acceptBroadcastSubscribe', from, 'requested', requested, 'child', 'call member');
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
      child = this.addChild(from);
      if (!child) {
        console.info('SWARMCAST MEDIA TRACE', 'acceptBroadcastSubscribe', from, 'requested', requested, 'child', 'full');
        return;
      }
    }
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

  clearChildren() {
    for (let index = 0; index < this.children.length; index += 1) this.children[index] = null;
  }
}

module.exports = Swarmcast;
