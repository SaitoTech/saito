/**
 * A Swarmcast publication is a description of media outputs.
 * Registry ids stay on this object and are removed from the document
 * sent to subscribers. One input on an output publishes that input's
 * own stream. Several inputs name a composite; the composed MediaStream
 * is recorded privately on the output and is not created here.
 */
class SwarmcastPublication {
  constructor({ id, callId, broadcaster }) {
    this.id = id;
    this.callId = callId;
    this.broadcaster = broadcaster;
    this.inputs = [];
    this.outputs = [];
    this.viewers = new Map();
    this.receivers = new Set();
  }

  document() {
    return {
      id: this.id,
      callId: this.callId,
      broadcaster: this.broadcaster,
      inputs: this.inputs.map((input) => ({
        id: input.id,
        kind: input.kind,
        label: input.label,
        participant: input.participant
      })),
      outputs: this.outputs.map((output) => ({
        id: output.id,
        label: output.label,
        inputs: output.inputs.slice()
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
    const removed = new Set(
      this.inputs.filter((input) => input.participant === participant).map((input) => input.id)
    );
    if (!removed.size) return false;
    this.inputs = this.inputs.filter((input) => !removed.has(input.id));
    this.outputs = this.outputs.flatMap((output) => {
      output.inputs = output.inputs.filter((id) => !removed.has(id));
      return output.inputs.length ? [output] : [];
    });
    return true;
  }

  streamFor(output, streams) {
    const registryId =
      output.registryId || this.inputs.find((input) => input.id === output.inputs[0])?.registryId;
    if (!registryId || !streams?.get) return null;
    return streams.get(registryId)?.mediaStream || null;
  }
}

function liveTracks(stream) {
  return (stream?.getTracks?.() || []).filter(
    (track) => (track.kind === 'audio' || track.kind === 'video') && track.readyState !== 'ended'
  );
}

function syncSenders(pc, senders, outputs, streamFor) {
  const wanted = new Set(outputs.map((output) => output.id));
  for (const output of outputs) {
    const tracks = liveTracks(streamFor(output));
    const bound = senders.filter((item) => item.outputId === output.id && !item.retired);
    if (!tracks.length) {
      console.info('SWARMCAST MEDIA TRACE', 'sync', output.id, 'none', 'addTrack', 'no');
    }
    for (const track of tracks) {
      const sameKind = bound.filter((item) => item.kind === track.kind);
      if (sameKind.length) {
        const current = sameKind[0];
        const ended = current.sender.track && current.sender.track.readyState === 'ended';
        if (current.sender.track !== track && !ended && typeof current.sender.replaceTrack === 'function') {
          console.info('SWARMCAST MEDIA TRACE', 'sync', output.id, track.kind, 'addTrack', 'no');
          Promise.resolve(current.sender.replaceTrack(track)).catch((err) => {
            console.error('Swarmcast replaceTrack', err);
          });
          continue;
        }
        if (!ended) {
          console.info('SWARMCAST MEDIA TRACE', 'sync', output.id, track.kind, 'addTrack', 'no');
          continue;
        }
        retireSender(pc, current);
      }
      try {
        const sender = pc.addTrack(track);
        console.info('SWARMCAST MEDIA TRACE', 'sync', output.id, track.kind, 'addTrack', 'yes');
        senders.push({ outputId: output.id, kind: track.kind, sender });
      } catch (err) {
        console.info('SWARMCAST MEDIA TRACE', 'sync', output.id, track.kind, 'addTrack', 'failed');
        console.error('Swarmcast addTrack', err);
      }
    }
    for (const item of bound) {
      if (!tracks.some((track) => track.kind === item.kind)) {
        retireSender(pc, item);
      }
    }
  }
  for (const item of senders) {
    if (!item.retired && !wanted.has(item.outputId)) {
      retireSender(pc, item);
    }
  }
  for (let i = senders.length - 1; i >= 0; i--) {
    if (senders[i].retired) senders.splice(i, 1);
  }
}

function retireSender(pc, item) {
  item.retired = true;
  try {
    pc.removeTrack(item.sender);
  } catch (err) {
    console.error('Swarmcast removeTrack', err);
  }
}

function trackMap(senders, pc) {
  const transceivers = typeof pc.getTransceivers === 'function' ? pc.getTransceivers() : [];
  const byOutput = new Map();
  for (const item of senders) {
    const transceiver = transceivers.find((entry) => entry.sender === item.sender);
    if (!transceiver?.mid) return null;
    if (transceiver.direction === 'inactive' || transceiver.stopped) continue;
    if (!byOutput.has(item.outputId)) byOutput.set(item.outputId, []);
    byOutput.get(item.outputId).push({ mid: transceiver.mid, kind: item.kind });
  }
  return [...byOutput.entries()].map(([id, mids]) => ({ id, mids }));
}

module.exports = {
  SwarmcastPublication,
  syncSenders,
  trackMap
};
