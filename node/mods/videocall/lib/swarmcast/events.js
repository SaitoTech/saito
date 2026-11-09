function bindSwarmcastEvents(publication) {
  const mod = publication?.mod;
  const connection = mod?.app?.connection;
  if (!publication || !connection || publication.events_bound) return;
  publication.events_bound = true;
  const handlers = {
    close(peerId) {
      if (!mod.swarmcast || mod.swarmcast !== publication) return;
      if (publication.childFor(peerId)) publication.onChildDisconnected(peerId);
      else if (peerId === publication.parent || peerId === publication.pending_parent) publication.onParentDisconnected();
    },
    connected(peerId) {
      if (!mod.swarmcast || mod.swarmcast !== publication) return;
      if (publication.childFor(peerId)) publication.onChildReconnected(peerId);
      else if (peerId === publication.parent || peerId === publication.pending_parent) publication.onParentReconnected(peerId);
    },
    channelClose(peerId) {
      if (!mod.swarmcast || mod.swarmcast !== publication) return;
      if (publication.isCallMember(peerId)) return;
      if (publication.childFor(peerId)) publication.onChildDisconnected(peerId);
      else if (peerId === publication.parent || peerId === publication.pending_parent) publication.onParentDisconnected();
    },
    track(peerId) {
      if (!mod.swarmcast || mod.swarmcast !== publication) return;
      publication.onTrack(peerId);
    },
    signaling(peerId, state) {
      if (!mod.swarmcast || mod.swarmcast !== publication) return;
      publication.onSignalingState(peerId, state);
    }
  };
  publication.event_handlers = handlers;
  connection.on('stun-connection-close', handlers.close);
  connection.on('stun-connection-connected', handlers.connected);
  connection.on('stun-data-channel-close', handlers.channelClose);
  connection.on('stun-track-event', handlers.track);
  connection.on('stun-signaling-state', handlers.signaling);
  publication.scheduleUpward();
}

function unbindSwarmcastEvents(publication) {
  const connection = publication?.mod?.app?.connection;
  const handlers = publication?.event_handlers;
  clearTimeout(publication?.upward_timer);
  clearTimeout(publication?.recovery_timer);
  if (publication) {
    publication.upward_timer = null;
    publication.recovery_timer = null;
    publication.events_bound = false;
    publication.event_handlers = null;
  }
  if (!connection || !handlers) return;
  const forget = (name, listener) => connection.removeListener?.(name, listener);
  forget('stun-connection-close', handlers.close);
  forget('stun-connection-connected', handlers.connected);
  forget('stun-data-channel-close', handlers.channelClose);
  forget('stun-track-event', handlers.track);
  forget('stun-signaling-state', handlers.signaling);
}

module.exports = { bindSwarmcastEvents, unbindSwarmcastEvents };
