const Swarmcast = require('./swarmcast/Swarmcast');
const { bindSwarmcastEvents, unbindSwarmcastEvents } = require('./swarmcast/events');

function liveTracks(stream) {
  return (stream?.getTracks?.() || []).filter(
    (track) => (track.kind === 'audio' || track.kind === 'video') && track.readyState !== 'ended'
  );
}

const QUALITY_PRESETS = {
  economy: { id: 'economy', label: 'Economy', maxWidth: 640, maxHeight: 360, maxFramerate: 10, maxBitrate: 400000 },
  standard: { id: 'standard', label: 'Standard', maxWidth: 960, maxHeight: 540, maxFramerate: 15, maxBitrate: 800000 },
  high: { id: 'high', label: 'High', maxWidth: 1280, maxHeight: 720, maxFramerate: 20, maxBitrate: 1500000 },
  premium: { id: 'premium', label: 'Premium', maxWidth: 1920, maxHeight: 1080, maxFramerate: 30, maxBitrate: 3000000 }
};

const QUALITY_SIZES = [
  { maxWidth: 640, maxHeight: 360 },
  { maxWidth: 960, maxHeight: 540 },
  { maxWidth: 1280, maxHeight: 720 },
  { maxWidth: 1920, maxHeight: 1080 }
];

const QUALITY_RATES = [10, 15, 20, 30];

const BROADCAST_LIMITS = {
  camera: { maxWidth: 1280, maxHeight: 720, maxFramerate: 24, maxBitrate: 900000 },
  interface: {
    maxWidth: QUALITY_PRESETS.standard.maxWidth,
    maxHeight: QUALITY_PRESETS.standard.maxHeight,
    maxFramerate: QUALITY_PRESETS.standard.maxFramerate,
    maxBitrate: QUALITY_PRESETS.standard.maxBitrate
  },
  audio: { maxBitrate: 40000 }
};

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function evenDimension(value) {
  const rounded = Math.max(2, Math.round(value));
  return rounded - (rounded % 2);
}

function displayQuality(choice, source = null) {
  const preset = QUALITY_PRESETS[choice?.id] || choice || QUALITY_PRESETS.standard;
  const settings = source?.capabilities ? source : { ...source };
  const capabilities = source?.capabilities || null;
  const sourceWidth = finiteNumber(settings.width);
  const sourceHeight = finiteNumber(settings.height);
  const sourceRate = finiteNumber(settings.frameRate);
  const widthCap = Math.min(sourceWidth || Infinity, finiteNumber(capabilities?.width?.max) || Infinity);
  const heightCap = Math.min(sourceHeight || Infinity, finiteNumber(capabilities?.height?.max) || Infinity);
  const rateCap = Math.min(sourceRate || Infinity, finiteNumber(capabilities?.frameRate?.max) || Infinity);
  let maxWidth = finiteNumber(choice?.maxWidth) || preset.maxWidth;
  let maxHeight = finiteNumber(choice?.maxHeight) || preset.maxHeight;
  let maxFramerate = finiteNumber(choice?.maxFramerate) || preset.maxFramerate;
  if (Number.isFinite(widthCap)) maxWidth = Math.min(maxWidth, widthCap);
  if (Number.isFinite(heightCap)) maxHeight = Math.min(maxHeight, heightCap);
  if (sourceWidth && sourceHeight && maxWidth && maxHeight) {
    const aspect = sourceWidth / sourceHeight;
    if (maxWidth / maxHeight > aspect) maxWidth = maxHeight * aspect;
    else maxHeight = maxWidth / aspect;
  }
  if (Number.isFinite(rateCap)) maxFramerate = Math.min(maxFramerate, rateCap);
  return {
    maxWidth: evenDimension(maxWidth),
    maxHeight: evenDimension(maxHeight),
    maxFramerate: Math.max(1, Math.round(maxFramerate)),
    maxBitrate: finiteNumber(choice?.maxBitrate) || preset.maxBitrate,
    sourceWidth,
    sourceHeight,
    sourceFrameRate: sourceRate
  };
}

function streamQuality(choice, count) {
  const streams = Math.max(1, Number(count) || 1);
  const scale = 1 / Math.sqrt(streams);
  const single = displayQuality(choice);
  return {
    maxWidth: evenDimension(single.maxWidth * scale),
    maxHeight: evenDimension(single.maxHeight * scale),
    maxFramerate: Math.max(5, Math.round(single.maxFramerate * scale)),
    maxBitrate: Math.max(80000, Math.round(single.maxBitrate / streams))
  };
}

function availableSizes(source) {
  const cap = finiteNumber(source?.width) || finiteNumber(source?.capabilities?.width?.max);
  const sizes = cap ? QUALITY_SIZES.filter((size) => size.maxWidth <= cap && (!source?.height || size.maxHeight <= source.height)) : QUALITY_SIZES;
  return sizes.length ? sizes : [QUALITY_SIZES[0]];
}

function availableRates(source) {
  const cap = finiteNumber(source?.frameRate) || finiteNumber(source?.capabilities?.frameRate?.max);
  const rates = cap ? QUALITY_RATES.filter((rate) => rate <= cap) : QUALITY_RATES;
  return rates.length ? rates : [QUALITY_RATES[0]];
}

function stepQuality(current, direction, kind, source = null) {
  if (kind === 'rate') {
    const rates = availableRates(source);
    let index = rates.findIndex((rate) => rate >= current);
    if (index < 0) index = rates.length - 1;
    const next = Math.min(rates.length - 1, Math.max(0, index + direction));
    return rates[next];
  }
  const sizes = availableSizes(source);
  let index = sizes.findIndex((size) => size.maxWidth >= current);
  if (index < 0) index = sizes.length - 1;
  const next = Math.min(sizes.length - 1, Math.max(0, index + direction));
  return sizes[next];
}

function broadcastLimits(mod) {
  const chosen = mod?.swarmcastLimits || {};
  return {
    camera: { ...BROADCAST_LIMITS.camera, ...chosen.camera },
    interface: { ...BROADCAST_LIMITS.interface, ...chosen.interface },
    audio: { ...BROADCAST_LIMITS.audio, ...chosen.audio }
  };
}

const trackBudgets = new WeakMap();
const interfaceTracks = new WeakSet();

function pipelineTrace(role, stage, fields) {
  console.info('SWARMCAST PIPELINE TRACE', JSON.stringify({
    role,
    stage,
    time: new Date().toISOString(),
    ...fields
  }));
}

function broadcastDiagnostic(stage, fields) {
  console.info('SWARMCAST BROADCAST DIAGNOSTIC', JSON.stringify({
    stage,
    time: new Date().toISOString(),
    ...fields
  }));
}

function captureSnapshot(track) {
  let settings = 'unavailable';
  let constraints = 'unavailable';
  try {
    settings = typeof track?.getSettings === 'function' ? track.getSettings() : 'unavailable';
  } catch (err) {
    settings = err?.name || 'unavailable';
  }
  try {
    constraints = typeof track?.getConstraints === 'function' ? track.getConstraints() : 'unavailable';
  } catch (err) {
    constraints = err?.name || 'unavailable';
  }
  return {
    track: track?.id || 'none',
    kind: track?.kind || 'none',
    readyState: track?.readyState || 'none',
    enabled: track ? track.enabled : 'unavailable',
    muted: track ? track.muted : 'unavailable',
    settings,
    constraints
  };
}

function encodingSnapshot(params) {
  if (!params || !Array.isArray(params.encodings)) return 'unavailable';
  return params.encodings.map((encoding) => ({ ...encoding }));
}

function observeCaptureFrames(mod, stream, track) {
  const publication = mod.swarmcast?.id || 'none';
  const base = { publication, output: 'interface', track: track?.id || 'none' };
  try {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      broadcastDiagnostic('capture-frames', { ...base, result: 'unavailable', reason: 'no document' });
      return;
    }
    const video = document.createElement('video');
    if (!video || typeof video.requestVideoFrameCallback !== 'function') {
      broadcastDiagnostic('capture-frames', { ...base, result: 'unavailable', reason: 'requestVideoFrameCallback unavailable' });
      return;
    }
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.srcObject = stream;
    if (video.style) video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body?.appendChild?.(video);
    mod._swarmcastFrameObserver = video;
    let frames = 0;
    let closed = false;
    const started = Date.now();
    const finish = (reason) => {
      if (closed) return;
      closed = true;
      broadcastDiagnostic('capture-frames', {
        ...base,
        result: frames > 0 ? 'frames observed' : 'no frames',
        reason,
        frames,
        elapsedMs: Date.now() - started,
        videoWidth: typeof video.videoWidth === 'number' ? video.videoWidth : 'unavailable',
        videoHeight: typeof video.videoHeight === 'number' ? video.videoHeight : 'unavailable',
        readyState: track.readyState,
        enabled: track.enabled,
        muted: track.muted
      });
      if (video._swarmcastFrameHandle != null && typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(video._swarmcastFrameHandle);
      }
      video.pause?.();
      video.srcObject = null;
      video.remove?.();
      if (mod._swarmcastFrameObserver === video) mod._swarmcastFrameObserver = null;
    };
    const onFrame = () => {
      frames += 1;
      if (Date.now() - started < 2000) {
        video._swarmcastFrameHandle = video.requestVideoFrameCallback(onFrame);
        return;
      }
      finish('sampled');
    };
    video._swarmcastFrameHandle = video.requestVideoFrameCallback(onFrame);
    const timer = setTimeout(() => finish(frames > 0 ? 'sampled' : 'no frames'), 2500);
    timer.unref?.();
    mod._swarmcastStatTimers ||= [];
    mod._swarmcastStatTimers.push(timer);
    const played = video.play?.();
    if (played?.catch) played.catch((err) => finish(err?.name || 'play failed'));
  } catch (err) {
    broadcastDiagnostic('capture-frames', { ...base, result: 'unavailable', reason: err?.name || 'observer failed' });
  }
}

function settingsOf(track) {
  const settings = track?.getSettings?.() || {};
  return {
    width: reported(settings, 'width'),
    height: reported(settings, 'height'),
    frameRate: reported(settings, 'frameRate')
  };
}

function reported(object, key) {
  if (!object || !Object.prototype.hasOwnProperty.call(object, key)) return 'unavailable';
  const value = object[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'unavailable';
  return value;
}

function compareCounters(before, after) {
  const keys = ['bytesSent', 'packetsSent', 'framesEncoded', 'framesSent', 'bytesReceived', 'packetsReceived', 'framesReceived', 'framesDecoded'];
  const delta = {};
  for (const key of keys) {
    delta[key] = typeof before?.[key] === 'number' && typeof after?.[key] === 'number' ? after[key] - before[key] : 'unavailable';
  }
  return delta;
}

function statValue(report, key) {
  if (!report || !Object.prototype.hasOwnProperty.call(report, key)) return 'unavailable';
  const value = report[key];
  if (value == null || value === '') return 'unavailable';
  return value;
}

function statKind(report) {
  return report?.kind || report?.mediaType || '';
}

function selectRtpReport(stats, options = {}) {
  const reports = [...(stats?.values?.() || [])];
  const codecs = new Map(reports.filter((report) => report.type === 'codec').map((report) => [report.id, report]));
  const candidates = reports.filter((report) => report.type === options.type && statKind(report) === options.kind);
  const mid = options.mid == null || options.mid === '' ? null : String(options.mid);
  const trackId = options.trackId || null;
  const correlated = candidates.filter((report) => {
    if (trackId && report.trackIdentifier && report.trackIdentifier !== trackId) return false;
    if (mid && report.mid != null && String(report.mid) !== mid) return false;
    return true;
  });
  const byTrack = trackId ? correlated.find((report) => report.trackIdentifier === trackId) : null;
  const byMid = mid ? correlated.find((report) => String(report.mid) === mid) : null;
  let report = null;
  let match = 'none';
  if (byTrack) {
    report = byTrack;
    match = 'track';
  } else if (byMid) {
    report = byMid;
    match = 'mid';
  } else if (options.scoped && correlated.length === 1) {
    report = correlated[0];
    match = 'scoped';
  } else if (candidates.length === 1 && correlated.length === 1) {
    report = correlated[0];
    match = 'only';
  }
  if (!report) {
    return {
      matched: false,
      match: 'none',
      reason: candidates.length ? 'no report correlated to this track' : 'no matching report',
      candidates: candidates.length
    };
  }
  const codec = codecs.get(report.codecId);
  return {
    matched: true,
    match,
    reason: 'matched',
    ssrc: statValue(report, 'ssrc'),
    codec: codec?.mimeType || 'unavailable',
    payloadType: codec ? statValue(codec, 'payloadType') : 'unavailable',
    bytesSent: reported(report, 'bytesSent'),
    packetsSent: reported(report, 'packetsSent'),
    framesEncoded: reported(report, 'framesEncoded'),
    framesSent: reported(report, 'framesSent'),
    bytesReceived: reported(report, 'bytesReceived'),
    packetsReceived: reported(report, 'packetsReceived'),
    packetsLost: reported(report, 'packetsLost'),
    framesReceived: reported(report, 'framesReceived'),
    framesDecoded: reported(report, 'framesDecoded'),
    framesDropped: reported(report, 'framesDropped'),
    frameWidth: reported(report, 'frameWidth'),
    frameHeight: reported(report, 'frameHeight'),
    framesPerSecond: reported(report, 'framesPerSecond'),
    jitter: reported(report, 'jitter'),
    targetBitrate: reported(report, 'targetBitrate'),
    qualityLimitationReason: Object.prototype.hasOwnProperty.call(report, 'qualityLimitationReason') ? report.qualityLimitationReason : 'unavailable',
    nackCount: reported(report, 'nackCount'),
    pliCount: reported(report, 'pliCount')
  };
}

function interpretMedia(role, before, after) {
  const sample = after?.matched ? after : before;
  if (!sample?.matched) return sample?.reason || 'no matching report';
  const delta = compareCounters(before, after);
  const bytes = delta[role === 'outbound' ? 'bytesSent' : 'bytesReceived'];
  const frames = delta[role === 'outbound' ? 'framesEncoded' : 'framesDecoded'];
  const frameName = role === 'outbound' ? 'framesEncoded' : 'framesDecoded';
  const byteName = role === 'outbound' ? 'bytesSent' : 'bytesReceived';
  if (typeof frames === 'number' && frames > 0 && typeof bytes === 'number' && bytes > 0) {
    return role === 'outbound' ? 'frames transmitted' : 'frames decoded';
  }
  if (typeof frames === 'number' && frames > 0 && bytes === 0) {
    return role === 'outbound' ? 'frames encoded but no outbound bytes' : 'frames decoded but no inbound bytes';
  }
  if (typeof bytes === 'number' && bytes > 0 && frames === 0) {
    return role === 'outbound' ? 'outbound bytes increased but no encoded frames' : 'bytes received but no decoded frames';
  }
  if (typeof bytes === 'number' && bytes > 0 && frames === 'unavailable') {
    return `${byteName} increased; ${frameName} unavailable`;
  }
  if (bytes === 0 && (frames === 0 || frames === 'unavailable')) {
    return role === 'outbound' ? 'no outbound frames encoded' : 'no inbound bytes';
  }
  if (bytes === 'unavailable' && frames === 'unavailable') return `report matched; ${byteName} and ${frameName} unavailable`;
  return 'report matched; counters did not establish media flow';
}

function videoTransceiver(pc, sender) {
  return (pc?.getTransceivers?.() || []).find((entry) => entry.sender === sender) || null;
}

function canSend(direction) {
  return direction === 'sendonly' || direction === 'sendrecv';
}

function noteInterfaceLimit(track, fields) {
  if (!interfaceTracks.has(track)) return;
  broadcastDiagnostic('sender-parameters', {
    output: 'interface',
    track: track?.id || 'none',
    ...fields
  });
}

function limitSender(sender, track, limits, pc) {
  if (!sender || typeof sender.getParameters !== 'function' || typeof sender.setParameters !== 'function') return;
  if (sender._swarmcastLimitsFailed === track?.id) return;
  if (pc?.signalingState && pc.signalingState !== 'stable') {
    sender._swarmcastLimitsPending = { track, limits };
    pipelineTrace('broadcaster', 'sender', {
      result: 'deferred',
      reason: 'signaling',
      signaling: pc.signalingState,
      track: track?.id || 'none'
    });
    noteInterfaceLimit(track, { result: 'deferred', reason: 'signaling', signaling: pc.signalingState });
    return;
  }
  if (track?.kind === 'video') {
    const transceiver = videoTransceiver(pc, sender);
    const current = transceiver ? transceiver.currentDirection ?? null : null;
    if (!canSend(current)) {
      sender._swarmcastLimitsPending = { track, limits };
      pipelineTrace('broadcaster', 'sender', {
        result: 'deferred',
        reason: 'direction',
        track: track?.id || 'none',
        currentDirection: current === null ? 'unavailable' : current,
        desired: transceiver?.direction || 'unavailable'
      });
      noteInterfaceLimit(track, {
        result: 'deferred',
        reason: 'direction',
        currentDirection: current === null ? 'unavailable' : current,
        direction: transceiver?.direction || 'unavailable',
        signaling: pc?.signalingState || 'unavailable'
      });
      return;
    }
  }
  if (sender._swarmcastLimitsApplied === track?.id) return;
  const budget = trackBudgets.get(track) || (track?.kind === 'audio' ? limits.audio : limits.camera);
  let before;
  try {
    before = sender.getParameters() || {};
  } catch (err) {
    pipelineTrace('broadcaster', 'sender', { result: 'parameters unreadable', error: err?.name || 'error', track: track?.id || 'none' });
    noteInterfaceLimit(track, { result: 'skipped', reason: err?.name || 'parameters unreadable' });
    return;
  }
  const encodings = before.encodings;
  if (!Array.isArray(encodings) || !encodings.length) {
    sender._swarmcastLimitsPending = { track, limits };
    pipelineTrace('broadcaster', 'sender', {
      result: 'deferred',
      reason: 'no negotiated encoding',
      track: track?.id || 'none'
    });
    noteInterfaceLimit(track, { result: 'deferred', reason: 'no negotiated encoding', parameters: encodingSnapshot(before) });
    return;
  }
  const encoding = encodings[0];
  if (budget.maxBitrate) encoding.maxBitrate = budget.maxBitrate;
  if (budget.maxFramerate && track?.kind === 'video') encoding.maxFramerate = budget.maxFramerate;
  const width = track?.getSettings?.().width;
  if (typeof width === 'number' && budget.maxWidth && width > budget.maxWidth) encoding.scaleResolutionDownBy = width / budget.maxWidth;
  const requested = {
    maxBitrate: encoding.maxBitrate,
    maxFramerate: encoding.maxFramerate,
    scaleResolutionDownBy: encoding.scaleResolutionDownBy,
    active: Object.prototype.hasOwnProperty.call(encoding, 'active') ? encoding.active : 'unavailable'
  };
  if (track?.kind === 'video') before.degradationPreference = 'balanced';
  pipelineTrace('broadcaster', 'sender', {
    result: 'configure',
    track: track?.id || 'none',
    requested,
    degradationPreference: before.degradationPreference || 'unavailable'
  });
  noteInterfaceLimit(track, {
    result: 'configure',
    degradationPreference: before.degradationPreference || 'unavailable',
    encodings: encodingSnapshot(before),
    requested
  });
  Promise.resolve(sender.setParameters(before)).then(() => {
    let after = null;
    let readError = null;
    try {
      after = sender.getParameters?.() || null;
    } catch (err) {
      readError = err;
    }
    const applied = after?.encodings?.[0] || null;
    const activeEncodings = Array.isArray(after?.encodings)
      ? after.encodings.filter((item) => item.active !== false).length
      : null;
    const inactive = applied?.active === false || activeEncodings === 0;
    if (!after || readError || !applied || inactive) {
      sender._swarmcastLimitsFailed = track?.id;
      sender._swarmcastLimitsPending = null;
      pipelineTrace('broadcaster', 'sender', {
        result: inactive ? 'inactive' : 'unconfirmed',
        track: track?.id || 'none',
        error: readError?.name || 'unavailable',
        activeEncodings: activeEncodings === null ? 'unavailable' : activeEncodings
      });
      noteInterfaceLimit(track, {
        result: inactive ? 'rejected' : 'unconfirmed',
        reason: inactive ? 'encoding inactive after setParameters' : (readError?.name || 'readback unavailable'),
        encodings: encodingSnapshot(after)
      });
      return;
    }
    sender._swarmcastLimitsApplied = track?.id;
    sender._swarmcastLimitsPending = null;
    pipelineTrace('broadcaster', 'sender', {
      result: 'applied',
      track: track?.id || 'none',
      applied: {
        maxBitrate: reported(applied, 'maxBitrate'),
        maxFramerate: reported(applied, 'maxFramerate'),
        scaleResolutionDownBy: reported(applied, 'scaleResolutionDownBy'),
        active: Object.prototype.hasOwnProperty.call(applied, 'active') ? applied.active : 'unavailable'
      },
      activeEncodings
    });
    noteInterfaceLimit(track, { result: 'applied', encodings: encodingSnapshot(after), activeEncodings });
  }).catch((err) => {
    sender._swarmcastLimitsFailed = track?.id;
    sender._swarmcastLimitsPending = null;
    pipelineTrace('broadcaster', 'sender', {
      result: 'rejected',
      track: track?.id || 'none',
      error: err?.name || 'error'
    });
    console.error('Swarmcast sender parameters', err);
    noteInterfaceLimit(track, { result: 'rejected', reason: err?.name || 'error' });
  });
}

function noteNegotiationState(senders, state) {
  if (!senders || state === 'stable') return;
  for (const item of senders) {
    if (item.sendNegotiation === 'requested') item.sendNegotiation = 'in-flight';
  }
}

function ensureSendDirection(pc, item) {
  if (!item || item.kind !== 'video') return 'waiting';
  const transceiver = videoTransceiver(pc, item.sender);
  if (!transceiver) return 'waiting';
  const current = transceiver.currentDirection ?? null;
  pipelineTrace('broadcaster', 'negotiation', {
    output: item.outputId,
    track: item.sender.track?.id || 'none',
    mid: transceiver.mid || 'unavailable',
    direction: transceiver.direction || 'unavailable',
    currentDirection: current === null ? 'unavailable' : current,
    negotiation: item.sendNegotiation || 'idle'
  });
  if (canSend(current)) {
    item.sendNegotiation = 'ready';
    return 'ready';
  }
  if (current === null) return 'waiting';
  if (item.sendNegotiation === 'failed') return 'failed';
  if (item.sendNegotiation === 'in-flight') {
    item.sendNegotiation = 'failed';
    pipelineTrace('broadcaster', 'negotiation', {
      output: item.outputId,
      track: item.sender.track?.id || 'none',
      action: 'failed',
      currentDirection: current,
      result: 'renegotiation did not permit sending'
    });
    return 'failed';
  }
  if (item.sendNegotiation === 'requested') return 'waiting';
  item.sendNegotiation = 'requested';
  const previous = transceiver.direction;
  if (previous !== 'sendrecv') transceiver.direction = 'sendrecv';
  pipelineTrace('broadcaster', 'negotiation', {
    output: item.outputId,
    track: item.sender.track?.id || 'none',
    action: 'direction',
    from: current,
    desired: 'sendrecv',
    previous: previous || 'unavailable',
    result: 'awaiting renegotiation',
    currentDirection: current
  });
  if (previous === 'sendrecv' && typeof pc.onnegotiationneeded === 'function') pc.onnegotiationneeded();
  return 'waiting';
}

function settleSenders(pc, senders, limits, context = null) {
  if (!pc || !senders) return;
  for (const item of senders) {
    if (item.retired) continue;
    const track = item.sender?.track;
    if (!track || track.readyState === 'ended') continue;
    if (item.kind === 'video' && ensureSendDirection(pc, item) !== 'ready') continue;
    if (context?.mod && interfaceTracks.has(track) && !item.outboundReadySampled) {
      item.outboundReadySampled = true;
      scheduleOutboundSamples(context.mod, pc, context.peerId, item.outputId, item.sender, track);
    }
    if (item.sender._swarmcastLimitsFailed === track.id) continue;
    if (item.sender._swarmcastLimitsPending || item.sender._swarmcastLimitsApplied !== track.id) {
      limitSender(item.sender, track, limits, pc);
    }
  }
}

function mediaSourceFields(stats, trackId) {
  for (const report of stats?.values?.() || []) {
    if (report.type !== 'media-source' && report.type !== 'track') continue;
    if (statKind(report) && statKind(report) !== 'video') continue;
    if (trackId && report.trackIdentifier && report.trackIdentifier !== trackId) continue;
    return {
      frames: reported(report, 'frames'),
      width: reported(report, 'width'),
      height: reported(report, 'height'),
      framesPerSecond: reported(report, 'framesPerSecond')
    };
  }
  return { frames: 'unavailable', width: 'unavailable', height: 'unavailable', framesPerSecond: 'unavailable' };
}

function scheduleOutboundSamples(mod, pc, peerId, outputId, sender, track) {
  const publication = mod?.swarmcast?.id || 'none';
  const take = (index) => {
    const transceiver = (pc.getTransceivers?.() || []).find((entry) => entry.sender === sender);
    const scoped = typeof sender.getStats === 'function';
    const read = scoped ? sender.getStats() : pc.getStats?.(track);
    if (!read) {
      pipelineTrace('broadcaster', 'outbound', {
        publication,
        broadcaster: mod?.publicKey || 'none',
        child: peerId,
        output: outputId,
        track: track?.id || 'none',
        sample: index,
        matched: false,
        reason: 'statistics unavailable'
      });
      return;
    }
    Promise.resolve(read).then((stats) => {
      const fields = selectRtpReport(stats, {
        type: 'outbound-rtp',
        kind: 'video',
        mid: transceiver?.mid,
        trackId: track?.id,
        scoped
      });
      const slot = mod.swarmcastOutbound ||= new Map();
      const key = `${peerId}:${outputId}`;
      const history = slot.get(key) || [];
      history.push(fields);
      slot.set(key, history);
      const previous = history.length > 1 ? history[history.length - 2] : null;
      pipelineTrace('broadcaster', 'outbound', {
        publication,
        broadcaster: mod?.publicKey || 'none',
        child: peerId,
        output: outputId,
        track: track?.id || 'none',
        senderTrack: sender.track?.id || 'none',
        trackState: sender.track?.readyState || 'none',
        enabled: sender.track ? sender.track.enabled : 'unavailable',
        muted: sender.track ? sender.track.muted : 'unavailable',
        mid: transceiver?.mid || 'unavailable',
        direction: transceiver?.direction || 'unavailable',
        currentDirection: transceiver?.currentDirection ?? 'unavailable',
        sample: history.length,
        ...fields,
        ...(previous ? { delta: compareCounters(previous, fields) } : {})
      });
      if (outputId === 'interface') {
        broadcastDiagnostic('outbound', {
          publication,
          broadcaster: mod?.publicKey || 'none',
          child: peerId,
          output: outputId,
          track: track?.id || 'none',
          senderTrack: sender.track?.id || 'none',
          sameTrack: sender.track === track,
          mid: transceiver?.mid || 'unavailable',
          direction: transceiver?.direction || 'unavailable',
          currentDirection: transceiver?.currentDirection ?? 'unavailable',
          signaling: pc.signalingState || 'unavailable',
          sample: history.length,
          source: mediaSourceFields(stats, track?.id),
          ...fields,
          ...(previous ? { delta: compareCounters(previous, fields) } : {})
        });
      }
      if (previous) summarizeBroadcaster(mod, peerId, outputId, track, transceiver, previous, fields);
    }).catch((err) => {
      pipelineTrace('broadcaster', 'outbound', {
        publication,
        broadcaster: mod?.publicKey || 'none',
        child: peerId,
        output: outputId,
        track: track?.id || 'none',
        sample: index,
        matched: false,
        reason: err?.name || 'statistics failed'
      });
    });
  };
  const first = setTimeout(() => take(1), 1000);
  const second = setTimeout(() => take(2), 3000);
  first.unref?.();
  second.unref?.();
  mod._swarmcastStatTimers ||= [];
  mod._swarmcastStatTimers.push(first, second);
}

function summarizeBroadcaster(mod, peerId, outputId, track, transceiver, before, after) {
  const counters = interpretMedia('outbound', before, after);
  pipelineTrace('broadcaster', 'summary', {
    publication: mod.swarmcast?.id || 'none',
    broadcaster: mod.publicKey || 'none',
    child: peerId,
    output: outputId,
    track: track.id,
    mid: transceiver?.mid || 'unavailable',
    ssrc: after?.ssrc || 'unavailable',
    codec: after?.codec || 'unavailable',
    capture: track.muted === true ? 'live track is muted' : track.readyState === 'live' ? 'live' : track.readyState || 'unavailable',
    settings: settingsOf(track),
    direction: transceiver?.direction || 'unavailable',
    currentDirection: transceiver?.currentDirection ?? 'unavailable',
    counters,
    transmission: canSend(transceiver?.currentDirection) ? counters : 'direction does not permit sending'
  });
}

function syncSenders(pc, senders, outputs, streamFor, limits = BROADCAST_LIMITS, context = null) {
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
          Promise.resolve(current.sender.replaceTrack(track))
            .then(() => limitSender(current.sender, track, limits, pc))
            .catch((err) => {
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
        limitSender(sender, track, limits, pc);
        if (interfaceTracks.has(track)) {
          const transceiver = videoTransceiver(pc, sender);
          let parameters = 'unavailable';
          try {
            parameters = typeof sender.getParameters === 'function' ? sender.getParameters() : 'unavailable';
          } catch (err) {
            parameters = err?.name || 'unavailable';
          }
          broadcastDiagnostic('sender', {
            publication: context?.mod?.swarmcast?.id || 'none',
            broadcaster: context?.mod?.publicKey || 'none',
            child: context?.peerId || 'none',
            peer: context?.peerId || 'none',
            output: output.id,
            addedTrack: track.id,
            senderTrack: sender.track?.id || 'none',
            sameTrack: sender.track === track,
            kind: sender.track?.kind || track.kind,
            mid: transceiver?.mid ?? 'unavailable',
            direction: transceiver?.direction || 'unavailable',
            currentDirection: transceiver?.currentDirection ?? 'unavailable',
            signaling: pc.signalingState || 'unavailable',
            degradationPreference: parameters?.degradationPreference || 'unavailable',
            encodings: encodingSnapshot(parameters)
          });
        }
        if (interfaceTracks.has(track) && context?.mod) {
          scheduleOutboundSamples(context.mod, pc, context.peerId, output.id, sender, track);
        }
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


class Swarmcasts {
  constructor(mod) {
    this.mod = mod;
  }

  async sendSwarmcast(publicKey, request, data = {}) {
    const mod = this.mod;
  const tx = await mod.app.wallet.createUnsignedTransactionWithDefaultFee(publicKey);
  tx.msg = {
    module: 'Videocall',
    request,
    call_id: data.callId || mod.swarmcast?.callId || mod.swarmcastRoute?.callId || mod.room_obj?.call_id,
    data
  };
  await tx.sign();
  const peer = mod.peers.get(publicKey) || mod.peers.add(publicKey);
  if (!peer.send(tx)) {
    mod.app.connection.emit('relay-transaction', tx);
  }
  }

  async toggleBroadcast() {
    const mod = this.mod;

  if (mod.swarmcast) {
    this.stopBroadcast();
    notify('Broadcast stopped', 1500);
    return;
  }
  this.showSetup();
  }

  showSetup() {
    const mod = this.mod;
    const SwarmcastSetup = require('./ui/overlays/swarmcast-setup');
    if (!this.setup) this.setup = new SwarmcastSetup(mod.app, mod);
    this.setup.render();
  }

  async startBroadcast(config) {
    const mod = this.mod;

  if (!config || mod.swarmcast || mod.swarmcastStarting) return false;
  mod.swarmcastStarting = true;
  try {
    return await this.openBroadcast(config);
  } finally {
    mod.swarmcastStarting = false;
  }
  }

  async reviseBroadcast(config) {
    const mod = this.mod;
    if (!config || !mod.swarmcast || mod.swarmcastStarting) return false;
    const publication = mod.swarmcast;
    const previous = {
      show: publication.show,
      outputs: publication.outputs.slice(),
      inputs: publication.inputs.slice(),
      selection: mod.swarmcastSelection,
      config: mod.swarmcastConfig,
      limits: mod.swarmcastLimits,
      cameraQuality: mod.swarmcastCameraQuality,
      captureId: mod.swarmcastCaptureId
    };
    const link = mod.swarmcastLink;
    mod.swarmcastStarting = true;
    try {
      const selection = normalizeSelection(config);
      const videoEntries = this.selectedEntries(selection.video);
      const audioEntries = this.selectedEntries(selection.audio);
      if (!videoEntries.length && !audioEntries.length && selection.video.mode !== 'interface') {
        notify('Choose something to show or hear', 2000);
        return false;
      }
      const nextInterface = selection.video.mode === 'interface';
      this.applyBroadcastQuality(config, selection, videoEntries);
      if (nextInterface && publication.show !== 'interface') await this.captureInterface();
      else if (nextInterface) await this.refitCapture();
      else if (publication.show === 'interface') this.releaseCapture();
      publication.show = nextInterface ? 'interface' : 'participants';
      this.reconcileSelection(selection);
      mod.swarmcastSelection = selection;
      if (Number.isFinite(Number(config.slots))) publication.setMaxSlots(config.slots);
      this.rememberConfig(selection, config);
      mod.swarmcastLink = link;
      this.reapplyLimits();
      this.pushBroadcast();
      this.renderBroadcastBar();
      this.noteProfile();
      return true;
    } catch (err) {
      console.error(err);
      publication.show = previous.show;
      publication.outputs = previous.outputs;
      publication.inputs = previous.inputs;
      mod.swarmcastSelection = previous.selection;
      mod.swarmcastConfig = previous.config;
      mod.swarmcastLimits = previous.limits;
      mod.swarmcastCameraQuality = previous.cameraQuality;
      mod.swarmcastLink = link;
      if (publication.show !== 'interface' && mod.swarmcastCaptureId && mod.swarmcastCaptureId !== previous.captureId) {
        this.releaseCapture();
      }
      notify(err?.message || 'The broadcast settings could not be changed', 2500);
      return false;
    } finally {
      mod.swarmcastStarting = false;
    }
  }

  applyBroadcastQuality(config, selection, videoEntries) {
    const mod = this.mod;
    if (!config?.quality) return;
    const preset = QUALITY_PRESETS[config.quality.preset] || QUALITY_PRESETS.standard;
    const chosen = {
      id: preset.id,
      maxWidth: finiteNumber(config.quality.maxWidth) || preset.maxWidth,
      maxHeight: finiteNumber(config.quality.maxHeight) || preset.maxHeight,
      maxFramerate: finiteNumber(config.quality.maxFramerate) || preset.maxFramerate,
      maxBitrate: preset.maxBitrate
    };
    mod.swarmcastLimits = { ...(mod.swarmcastLimits || {}) };
    if (selection.video.mode === 'interface') {
      mod.swarmcastCameraQuality = null;
      mod.swarmcastLimits.interface = chosen;
      return;
    }
    const scaled = streamQuality(chosen, videoEntries.length);
    mod.swarmcastCameraQuality = scaled;
    mod.swarmcastLimits.camera = scaled;
  }

  async openBroadcast(config) {
    const mod = this.mod;

  if (!mod.room_obj?.call_id || !mod.streams?.active) {
    notify('Join a call before broadcasting', 2000);
    return false;
  }
  const selection = normalizeSelection(config);
  const videoEntries = this.selectedEntries(selection.video);
  const audioEntries = this.selectedEntries(selection.audio);
  this.applyBroadcastQuality(config, selection, videoEntries);
  if (!videoEntries.length && !audioEntries.length && selection.video.mode !== 'interface') {
    notify('Choose something to show or hear', 2000);
    return false;
  }
  const bytes = new Uint8Array(9);
  const random = globalThis.crypto || require('crypto').webcrypto;
  random.getRandomValues(bytes);
  const id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  mod.swarmcastSelection = selection;
  mod.swarmcastCamera = new Map();
  mod.swarmcastMuted = new Map();
  const slots = Number(config?.slots);
  mod.swarmcast = new Swarmcast({
    id,
    callId: mod.room_obj.call_id,
    broadcaster: mod.publicKey,
    show: selection.video.mode === 'interface' ? 'interface' : 'participants',
    mod,
    ...(Number.isFinite(slots) && slots >= 0 ? { max_slots: Math.floor(slots) } : {})
  });
  try {
    if (selection.video.mode === 'interface') await this.captureInterface();
    else for (const entry of videoEntries) this.noteVideo(entry);
    for (const entry of audioEntries) this.noteAudio(entry);
  } catch (err) {
    console.error(err);
    this.stopBroadcast();
    notify(err?.message || 'The broadcast could not be started', 2500);
    return false;
  }
  this.setBroadcasting(true);
  this.listenForBroadcastChanges();
  this.bindBroadcastSources();
  const origin = globalThis.window?.location?.origin || '';
  const url =
    `${origin}/videocall/swarmcast/${id}` +
    `?broadcaster=${encodeURIComponent(mod.publicKey)}` +
    `&call_id=${encodeURIComponent(mod.room_obj.call_id)}`;
  let link = url;
  try {
    link = await mod.createShortLink(url);
  } catch (err) {
    console.error(err);
  }
  mod.swarmcastLink = link;
  this.rememberConfig(selection, config);
  mod.persistSwarmcastState?.();
  try {
    await navigator.clipboard.writeText(link);
    notify('Broadcast link copied to clipboard', 1500);
  } catch (err) {
    console.error(err);
    notify(link, 4000);
  }
  this.renderBroadcastBar();
  this.noteProfile();
  return !!mod.swarmcast;
  }

  async copyBroadcastLink() {
    const link = this.mod.swarmcastLink;
    if (!link) return false;
    try {
      await navigator.clipboard.writeText(link);
      notify('Broadcast link copied to clipboard', 1500);
      this.markLinkCopied();
      return true;
    } catch (err) {
      console.error(err);
      notify(link, 4000);
      return false;
    }
  }

  noteProfile() {
    const profile = this.broadcastProfile();
    this.mod.swarmcastProfile = profile;
    console.info(
      'SWARMCAST MEDIA TRACE',
      'profile',
      profile.mode,
      'video',
      profile.videoOutputs,
      'audio',
      profile.audioOutputs,
      'frameLoop',
      profile.frameLoop
    );
  }

  broadcastProfile() {
    const mod = this.mod;
    const publication = mod.swarmcast;
    const outputs = publication?.outputs || [];
    return {
      mode: publication?.show === 'interface' ? 'capture' : 'forward',
      videoOutputs: outputs.filter((output) => output.role !== 'audio').length,
      audioOutputs: outputs.filter((output) => output.role === 'audio').length,
      composer: false,
      audioContext: false,
      frameLoop: false,
      limits: broadcastLimits(mod),
      capture: mod.swarmcastCaptureSettings || null
    };
  }

  publishCallCameras() {
    const selection = this.mod.swarmcastSelection;
    if (!selection || selection.video?.mode === 'interface') return;
    for (const entry of this.selectedEntries(selection.video)) this.noteVideo(entry);
    for (const entry of this.selectedEntries(selection.audio)) this.noteAudio(entry);
  }

  callCameras() {
    return this.mod.streams?.list?.({ kind: 'camera', session: 'call' }) || [];
  }

  participantKey(entry) {
    if (!entry) return '';
    return entry.origin === 'local' ? this.mod.publicKey : entry.peerId;
  }

  selectedEntries(choice) {
    const cameras = this.callCameras();
    if (!choice || choice.mode === 'none' || choice.mode === 'interface') return [];
    if (choice.mode === 'everyone') return cameras;
    if (choice.mode === 'me') {
      return cameras.filter((entry) => this.participantKey(entry) === this.mod.publicKey);
    }
    if (choice.mode === 'one') {
      return cameras.filter((entry) => this.participantKey(entry) === choice.participant);
    }
    const chosen = new Set(choice.participants || []);
    return cameras.filter((entry) => chosen.has(this.participantKey(entry)));
  }

  entrySelected(entry, choice) {
    if (!entry || entry.kind !== 'camera' || entry.session !== 'call') return false;
    return this.selectedEntries(choice).some((item) => item.id === entry.id);
  }

  listenForBroadcastChanges() {
    const mod = this.mod;
    if (mod.swarmcast) {
      mod.swarmcast.mod = mod;
      bindSwarmcastEvents(mod.swarmcast);
    }

  mod._onBroadcastStream = (entry) => this.noteBroadcastCamera(entry);
  mod._onBroadcastStreamRemoved = (entry) => {
    if (!mod.swarmcast || entry?.kind !== 'camera' || entry.session !== 'call') return;
    const participant = entry.origin === 'local' ? mod.publicKey : entry.peerId;
    if (!participant || !mod.swarmcast.removeParticipant(participant)) return;
    this.pushBroadcast();
  };
  mod._onBroadcastCamera = (data) => this.noteCameraSignal(data);
  mod._onBroadcastMute = (data) => this.noteMuteSignal(data);
  mod._onBroadcastSourceTrack = () => this.syncBroadcastSources();
  mod.app.connection.on('videocall-stream-added', mod._onBroadcastStream);
  mod.app.connection.on('videocall-stream-updated', mod._onBroadcastStream);
  mod.app.connection.on('videocall-stream-removed', mod._onBroadcastStreamRemoved);
  mod.app.connection.on('videocall-peer-video-changed', mod._onBroadcastCamera);
  mod.app.connection.on('videocall-peer-audio-changed', mod._onBroadcastMute);
  }

  syncBroadcastSources() {
    const mod = this.mod;

  if (!mod.swarmcast) return;
  const seen = new Set();
  for (const output of mod.swarmcast.outputs || []) {
    if (!output.registryId || seen.has(output.registryId)) continue;
    seen.add(output.registryId);
    const entry = mod.streams?.get?.(output.registryId);
    if (entry?.kind === 'camera' && entry.session === 'call') this.noteBroadcastCamera(entry);
  }
  this.pushBroadcast();
  }

  bindBroadcastSources() {
    const mod = this.mod;

  if (!mod._onBroadcastSourceTrack) mod._onBroadcastSourceTrack = () => this.syncBroadcastSources();
  const next = new Set();
  const registryIds = [
    ...(mod.swarmcast?.outputs || []).map((output) => output.registryId),
    ...(mod.swarmcast?.inputs || []).map((input) => input.registryId)
  ];
  for (const registryId of registryIds) {
    const stream = mod.streams?.get?.(registryId)?.mediaStream;
    if (stream?.addEventListener) next.add(stream);
  }
  for (const stream of mod._broadcastSources || []) {
    if (!next.has(stream)) stream.removeEventListener('addtrack', mod._onBroadcastSourceTrack);
  }
  for (const stream of next) {
    if (!mod._broadcastSources?.has(stream)) stream.addEventListener('addtrack', mod._onBroadcastSourceTrack);
  }
  mod._broadcastSources = next;
  }

  clearBroadcastSources() {
    const mod = this.mod;

  for (const stream of mod._broadcastSources || []) {
    stream.removeEventListener?.('addtrack', mod._onBroadcastSourceTrack);
  }
  mod._broadcastSources = null;
  }

  noteBroadcastCamera(entry) {
    const selection = this.mod.swarmcastSelection;
    if (!this.mod.swarmcast || !selection) return;
    let changed = false;
    if (selection.video.mode !== 'interface' && this.entrySelected(entry, selection.video)) {
      this.noteVideo(entry);
      changed = true;
    }
    if (this.entrySelected(entry, selection.audio)) {
      this.noteAudio(entry);
      changed = true;
    }
    if (!changed) return;
    this.bindBroadcastSources();
    this.pushBroadcast();
  }

  noteVideo(entry) {
    this.noteChannel(entry, 'video');
  }

  noteAudio(entry) {
    const audible = (entry?.mediaStream?.getAudioTracks?.() || []).some((track) => track.readyState !== 'ended');
    if (!audible) return;
    this.noteChannel(entry, 'audio');
  }

  noteChannel(entry, role) {
    const mod = this.mod;
    const publication = mod.swarmcast;
    if (!publication || !entry) return;
    const participant = this.participantKey(entry);
    const label = entry.origin === 'local' ? 'You' : mod.app.keychain.returnUsername(entry.peerId);
    const existing = publication.outputs.find((output) => output.role === role && output.participant === participant);
    const camera = role === 'video' ? this.cameraState(entry, participant) : undefined;
    const muted = role === 'audio' ? this.audioMuted(entry, participant) : undefined;
    if (existing) {
      existing.registryId = entry.id;
      existing.label = label;
      if (role === 'video') existing.camera = camera;
      if (role === 'audio') existing.muted = muted;
      return;
    }
    if (role === 'video' && mod.swarmcastCameraQuality) {
      for (const track of entry.mediaStream?.getVideoTracks?.() || []) {
        if (track.readyState !== 'ended') trackBudgets.set(track, mod.swarmcastCameraQuality);
      }
    }
    const count = publication.outputs.filter((output) => output.role === role).length + 1;
    publication.outputs.push({
      id: `${role === 'audio' ? 'aud' : 'cam'}-${count}`,
      role,
      kind: role === 'audio' ? 'audio' : 'camera',
      label,
      participant,
      registryId: entry.id,
      ...(role === 'video' ? { camera } : { muted })
    });
    publication.inputs.push({
      id: `${role === 'audio' ? 'aud' : 'cam'}-${count}`,
      kind: role === 'audio' ? 'audio' : 'camera',
      label,
      participant,
      registryId: entry.id
    });
  }

  cameraState(entry, participant) {
    if (this.mod.swarmcastCamera?.has(participant)) {
      return this.mod.swarmcastCamera.get(participant) ? 'live' : 'disabled';
    }
    const video = (entry.mediaStream?.getVideoTracks?.() || []).filter((track) => track.readyState !== 'ended');
    if (!video.length || video.every((track) => track.enabled === false)) return 'disabled';
    if (entry.origin === 'local' && this.mod.streams?.videoEnabled === false) return 'disabled';
    return 'live';
  }

  audioMuted(entry, participant) {
    if (this.mod.swarmcastMuted?.has(participant)) return !this.mod.swarmcastMuted.get(participant);
    const audio = (entry.mediaStream?.getAudioTracks?.() || []).filter((track) => track.readyState !== 'ended');
    if (!audio.length) return true;
    return audio.every((track) => track.enabled === false);
  }

  noteCameraSignal(data) {
    const mod = this.mod;
    if (!mod.swarmcast || !data) return;
    const participant = data.public_key === 'local' ? mod.publicKey : data.public_key;
    if (!participant) return;
    mod.swarmcastCamera ||= new Map();
    mod.swarmcastCamera.set(participant, !!data.enabled);
    const output = mod.swarmcast.outputs.find(
      (item) => item.role === 'video' && item.kind === 'camera' && item.participant === participant
    );
    if (!output) return;
    output.camera = data.enabled ? 'live' : 'disabled';
    this.pushBroadcast();
  }

  noteMuteSignal(data) {
    const mod = this.mod;
    if (!mod.swarmcast || !data) return;
    const participant = data.public_key === 'local' ? mod.publicKey : data.public_key;
    if (!participant) return;
    mod.swarmcastMuted ||= new Map();
    mod.swarmcastMuted.set(participant, !!data.enabled);
    const output = mod.swarmcast.outputs.find((item) => item.role === 'audio' && item.participant === participant);
    if (!output) return;
    output.muted = !data.enabled;
    this.pushBroadcast();
  }

  async captureInterface() {
    const mod = this.mod;
    const devices = globalThis.navigator?.mediaDevices;
    if (!devices?.getDisplayMedia) {
      throw new Error('This browser cannot capture the call interface');
    }
    let limits = broadcastLimits(mod).interface;
    const publication = mod.swarmcast?.id || 'none';
    let stream;
    try {
      stream = await devices.getDisplayMedia({
      video: {
        width: { max: limits.maxWidth },
        height: { max: limits.maxHeight },
        frameRate: { ideal: limits.maxFramerate, max: limits.maxFramerate }
      },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      monitorTypeSurfaces: 'exclude',
      surfaceSwitching: 'exclude'
      });
    } catch (err) {
      broadcastDiagnostic('capture', {
        publication,
        output: 'interface',
        result: 'error',
        error: err?.name || 'error',
        message: err?.message || 'unavailable'
      });
      throw err;
    }
    for (const track of stream.getAudioTracks?.() || []) {
      track.stop?.();
      stream.removeTrack?.(track);
    }
    const video = stream.getVideoTracks?.()[0];
    if (video) {
      const settings = typeof video.getSettings === 'function' ? video.getSettings() : {};
      const capabilities = typeof video.getCapabilities === 'function' ? video.getCapabilities() : null;
      const fitted = displayQuality(limits, { ...settings, capabilities });
      limits = {
        maxWidth: fitted.maxWidth,
        maxHeight: fitted.maxHeight,
        maxFramerate: fitted.maxFramerate,
        maxBitrate: fitted.maxBitrate
      };
      mod.swarmcastSource = {
        width: fitted.sourceWidth,
        height: fitted.sourceHeight,
        frameRate: fitted.sourceFrameRate
      };
      mod.swarmcastOutgoing = { ...limits };
      mod.swarmcastLimits = { ...(mod.swarmcastLimits || {}), interface: { ...limits } };
    }
    const requested = {
      width: { max: limits.maxWidth },
      height: { max: limits.maxHeight },
      frameRate: { ideal: limits.maxFramerate, max: limits.maxFramerate }
    };
    let constraintResult = 'not applied';
    if (video?.applyConstraints) {
      try {
        await video.applyConstraints(requested);
        constraintResult = 'applied';
      } catch (err) {
        constraintResult = err?.name || 'rejected';
        broadcastDiagnostic('capture', {
          publication,
          output: 'interface',
          result: 'constraint error',
          error: err?.name || 'error',
          message: err?.message || 'unavailable',
          ...captureSnapshot(video)
        });
        pipelineTrace('broadcaster', 'capture', {
          publication: mod.swarmcast?.id || 'none',
          output: 'interface',
          track: video.id,
          constraintResult,
          error: err?.message || constraintResult,
          settings: settingsOf(video)
        });
      }
    }
    if (video) {
      video.contentHint = 'motion';
      trackBudgets.set(video, limits);
      interfaceTracks.add(video);
      const note = (event) => pipelineTrace('broadcaster', 'capture', {
        publication: mod.swarmcast?.id || 'none',
        output: 'interface',
        track: video.id,
        event,
        readyState: video.readyState,
        enabled: video.enabled,
        muted: video.muted,
        settings: settingsOf(video)
      });
      video.addEventListener?.('mute', () => note('mute'));
      video.addEventListener?.('unmute', () => note('unmute'));
      const onEnded = () => {
        note('ended');
        if (this.mod.swarmcast && this.mod.swarmcastCaptureId) this.stopBroadcast();
      };
      video.addEventListener?.('ended', onEnded);
      mod._onCaptureEnded = onEnded;
      mod._captureVideo = video;
      broadcastDiagnostic('capture', {
        publication,
        output: 'interface',
        constraintResult,
        ...captureSnapshot(video)
      });
      const noteBroadcast = (event) => broadcastDiagnostic('capture', {
        publication: mod.swarmcast?.id || 'none',
        output: 'interface',
        event,
        ...captureSnapshot(video)
      });
      video.addEventListener?.('mute', () => noteBroadcast('mute'));
      video.addEventListener?.('unmute', () => noteBroadcast('unmute'));
      video.addEventListener?.('ended', () => noteBroadcast('ended'));
      observeCaptureFrames(mod, stream, video);
      pipelineTrace('broadcaster', 'capture', {
        publication: mod.swarmcast?.id || 'none',
        output: 'interface',
        track: video.id,
        kind: video.kind,
        readyState: video.readyState,
        enabled: video.enabled,
        muted: video.muted,
        requested,
        constraintResult,
        settings: settingsOf(video)
      });
    } else {
      broadcastDiagnostic('capture', {
        publication,
        output: 'interface',
        result: 'no video track',
        streamTracks: (stream.getTracks?.() || []).map((item) => ({ id: item.id, kind: item.kind }))
      });
    }
    mod.swarmcastCaptureSettings = video?.getSettings?.() || null;
    mod.swarmcastFrameLoop = null;
    const entry = mod.streams.register({
      source: mod.publicKey,
      kind: 'display',
      origin: 'local',
      session: 'broadcast',
      availability: 'live',
      disposition: 'owned',
      mediaStream: stream
    });
    mod.swarmcastCaptureId = entry.id;
    mod.swarmcast.outputs.push({
      id: 'interface',
      role: 'video',
      kind: 'interface',
      label: 'Video call',
      participant: '',
      registryId: entry.id
    });
    broadcastDiagnostic('register', {
      publication,
      output: 'interface',
      registryId: entry.id,
      track: video?.id || 'none',
      streamTracks: (stream.getTracks?.() || []).map((item) => ({ id: item.id, kind: item.kind, readyState: item.readyState }))
    });
  }

  rememberConfig(selection, config) {
    const modeLimits = selection.video.mode === 'interface'
      ? broadcastLimits(this.mod).interface
      : broadcastLimits(this.mod).camera;
    const quality = config?.quality || {};
    this.mod.swarmcastConfig = {
      video: {
        mode: selection.video.mode,
        participants: (selection.video.participants || []).slice()
      },
      audio: {
        mode: selection.audio.mode,
        participants: (selection.audio.participants || []).slice()
      },
      quality: {
        preset: quality.preset || modeLimits.id || 'standard',
        maxWidth: finiteNumber(quality.maxWidth) || modeLimits.maxWidth,
        maxHeight: finiteNumber(quality.maxHeight) || modeLimits.maxHeight,
        maxFramerate: finiteNumber(quality.maxFramerate) || modeLimits.maxFramerate
      },
      slots: Number.isFinite(Number(config?.slots))
        ? Math.max(0, Math.floor(Number(config.slots)))
        : this.mod.swarmcast?.max_slots
    };
  }

  reconcileSelection(selection) {
    const mod = this.mod;
    const publication = mod.swarmcast;
    const screen = selection.video.mode === 'interface';
    const videoKeys = new Set(
      (screen ? [] : this.selectedEntries(selection.video)).map((entry) => this.participantKey(entry))
    );
    const audioKeys = new Set(this.selectedEntries(selection.audio).map((entry) => this.participantKey(entry)));
    const keep = (item) => {
      if (item.kind === 'interface') return screen;
      if (item.role === 'audio' || item.kind === 'audio') return audioKeys.has(item.participant);
      return videoKeys.has(item.participant);
    };
    publication.outputs = publication.outputs.filter(keep);
    publication.inputs = publication.inputs.filter(keep);
    if (!screen) {
      for (const entry of this.selectedEntries(selection.video)) this.noteVideo(entry);
    }
    for (const entry of this.selectedEntries(selection.audio)) this.noteAudio(entry);
    if (!screen && mod.swarmcastCameraQuality) {
      for (const entry of this.selectedEntries(selection.video)) {
        for (const track of entry.mediaStream?.getVideoTracks?.() || []) {
          if (track.readyState !== 'ended') trackBudgets.set(track, mod.swarmcastCameraQuality);
        }
      }
    }
  }

  async refitCapture() {
    const mod = this.mod;
    const video = mod._captureVideo;
    if (!video || video.readyState === 'ended') {
      await this.captureInterface();
      return;
    }
    const settings = typeof video.getSettings === 'function' ? video.getSettings() : {};
    const capabilities = typeof video.getCapabilities === 'function' ? video.getCapabilities() : null;
    const fitted = displayQuality(broadcastLimits(mod).interface, { ...settings, capabilities });
    const limits = {
      maxWidth: fitted.maxWidth,
      maxHeight: fitted.maxHeight,
      maxFramerate: fitted.maxFramerate,
      maxBitrate: fitted.maxBitrate
    };
    mod.swarmcastLimits = { ...(mod.swarmcastLimits || {}), interface: { ...limits } };
    mod.swarmcastOutgoing = { ...limits };
    mod.swarmcastSource = {
      width: fitted.sourceWidth,
      height: fitted.sourceHeight,
      frameRate: fitted.sourceFrameRate
    };
    trackBudgets.set(video, limits);
    if (typeof video.applyConstraints !== 'function') return;
    try {
      await video.applyConstraints({
        width: { max: limits.maxWidth },
        height: { max: limits.maxHeight },
        frameRate: { ideal: limits.maxFramerate, max: limits.maxFramerate }
      });
    } catch (err) {
      console.error(err);
    }
  }

  releaseCapture() {
    const mod = this.mod;
    const captureVideo = mod._captureVideo;
    const onCaptureEnded = mod._onCaptureEnded;
    if (captureVideo && onCaptureEnded) captureVideo.removeEventListener?.('ended', onCaptureEnded);
    mod._captureVideo = null;
    mod._onCaptureEnded = null;
    for (const timer of mod._swarmcastStatTimers || []) clearTimeout(timer);
    mod._swarmcastStatTimers = [];
    const observer = mod._swarmcastFrameObserver;
    if (observer) {
      if (observer._swarmcastFrameHandle != null && typeof observer.cancelVideoFrameCallback === 'function') {
        observer.cancelVideoFrameCallback(observer._swarmcastFrameHandle);
      }
      observer.pause?.();
      observer.srcObject = null;
      observer.remove?.();
      mod._swarmcastFrameObserver = null;
    }
    const captureId = mod.swarmcastCaptureId;
    mod.swarmcastCaptureId = null;
    mod.swarmcastCaptureSettings = null;
    mod.swarmcastFrameLoop = null;
    mod.swarmcastSource = null;
    mod.swarmcastOutgoing = null;
    if (captureId) mod.streams?.remove?.(captureId);
    else captureVideo?.stop?.();
  }

  reapplyLimits() {
    const mod = this.mod;
    const limits = broadcastLimits(mod);
    for (const child of mod.swarmcast?.children || []) {
      if (!child) continue;
      const peerId = child.public_key;
      const pc = mod.peerManager?.peers?.get(peerId);
      for (const item of child.media_streams || []) {
        const track = item.sender?.track;
        if (!track || track.readyState === 'ended') continue;
        item.sender._swarmcastLimitsApplied = null;
        item.sender._swarmcastLimitsFailed = null;
        item.sender._swarmcastLimitsPending = null;
        limitSender(item.sender, track, limits, pc);
      }
    }
  }

  renderBroadcastBar() {
    const doc = globalThis.document;
    if (!doc || typeof doc.querySelector !== 'function' || typeof doc.querySelectorAll !== 'function') return;
    doc.querySelectorAll('.swarmcast-live').forEach((node) => node.remove?.());
    const link = this.mod.swarmcast && this.mod.swarmcastLink;
    if (!link) return;
    // The link, copy, and settings bar belongs on the full-screen stage.
    // The embedded call only has floating windows and #videocall-controls.
    const stage = doc.querySelector('#stun-chatbox .video-container-large, #small-audio-chatbox');
    if (!stage || typeof stage.insertAdjacentHTML !== 'function') return;
    const html = broadcastLinkMarkup(link);
    stage.insertAdjacentHTML('beforeend', html);
    const bar = doc.querySelector('.swarmcast-live');
    const copy = bar?.querySelector('.swarmcast-live-copy');
    const settings = bar?.querySelector('.swarmcast-live-settings');
    if (copy) copy.onclick = () => this.copyBroadcastLink();
    if (settings) settings.onclick = () => this.showSetup();
  }

  markLinkCopied() {
    const note = globalThis.document?.querySelector?.('.swarmcast-live-copied');
    if (!note) return;
    note.hidden = false;
    note.textContent = 'Link copied';
  }

  stopBroadcast(options = {}) {
    const mod = this.mod;
    const notify = options.notify !== false;

  const publication = mod.swarmcast;
  if (!publication) return;
  mod.swarmcast = null;
  mod.swarmcastLink = null;
  mod.swarmcastConfig = null;
  mod.swarmcastNeedsResume = false;
  this.setBroadcasting(false);
  this.clearBroadcastSources();
  const forget = (name, listener) => {
    if (listener) mod.app.connection.removeListener?.(name, listener);
  };
  unbindSwarmcastEvents(publication);
  forget('videocall-stream-added', mod._onBroadcastStream);
  forget('videocall-stream-updated', mod._onBroadcastStream);
  forget('videocall-stream-removed', mod._onBroadcastStreamRemoved);
  forget('videocall-peer-video-changed', mod._onBroadcastCamera);
  forget('videocall-peer-audio-changed', mod._onBroadcastMute);
  mod._onBroadcastCamera = null;
  mod._onBroadcastMute = null;
  this.releaseCapture();
  mod.swarmcastSelection = null;
  mod.swarmcastCamera = null;
  mod.swarmcastMuted = null;
  if (notify) {
    const peers = [...new Set([...publication.distributionPeers(), ...(publication.former_children || [])])];
    for (const peerId of peers) {
      mod.sendSwarmcast(peerId, 'video-call-swarmcast-ended', {
        publicationId: publication.id,
        callId: publication.callId,
        broadcaster: publication.broadcaster
      })
        .catch((err) => console.error(err))
        .finally(() => {
          if (!mod.room_obj?.call_peers?.includes(peerId)) {
            mod.peerManager?.removePeerConnection?.(peerId);
          }
        });
    }
  }
  publication.clearChildren();
  publication.releaseTimers?.();
  mod.clearSwarmcastRecovery?.();
  this.hideDeparture();
  }

  showResume() {
    const doc = globalThis.document;
    const mod = this.mod;
    if (!doc || typeof doc.createElement !== 'function' || !mod.swarmcastNeedsResume) return;
    if (doc.querySelector('.swarmcast-resume')) return;
    const curtain = doc.createElement('div');
    curtain.className = 'swarmcast-depart swarmcast-resume';
    curtain.innerHTML = '<div class="swarmcast-depart-card"><p>Restoring screen capture</p><button type="button">Resume</button></div>';
    curtain.querySelector('button').onclick = async () => {
      try {
        await this.captureInterface();
        this.pushBroadcast();
        mod.swarmcastNeedsResume = false;
        curtain.remove();
      } catch (err) {
        console.error(err);
      }
    };
    doc.body?.appendChild(curtain);
  }

  showDeparture(text) {
    const doc = globalThis.document;
    if (!doc || typeof doc.createElement !== 'function') return;
    let curtain = doc.querySelector('.swarmcast-depart');
    if (!curtain) {
      curtain = doc.createElement('div');
      curtain.className = 'swarmcast-depart';
      curtain.innerHTML = '<div class="swarmcast-depart-card"><div class="swarmcast-depart-spin"></div><p></p></div>';
      doc.body?.appendChild(curtain);
    }
    const line = curtain.querySelector('p');
    if (line) line.textContent = text;
  }

  hideDeparture() {
    globalThis.document?.querySelector?.('.swarmcast-depart')?.remove?.();
  }

  async depart() {
    const publication = this.mod.swarmcast;
    if (!publication || publication.departing) return;
    publication.departing = true;
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const step = 400;
    try {
      this.showDeparture('Notifying peers…');
      const notice = publication.announceDeparture();
      await pause(step);
      this.showDeparture('Notifying children…');
      await notice;
      await pause(step);
      this.showDeparture('Allowing the network to rebalance…');
      await pause(Math.max(0, Swarmcast.DEPARTURE_GRACE - step * 2));
      this.showDeparture('Exiting…');
    } finally {
      if (this.mod.swarmcast === publication) this.stopBroadcast({ notify: false });
      this.hideDeparture();
    }
  }

  setBroadcasting(active) {
    const mod = this.mod;
    this.renderBroadcastBar();

  const control =
    typeof document !== 'undefined' &&
    typeof document.getElementById === 'function' &&
    (document.getElementById(mod.swarmcastControlId) || document.getElementById(mod.broadcastControlId));
  if (!control) return;
  const label = control.querySelector('label');
  const icon = control.querySelector('i');
  control.classList.toggle('recording', active);
  icon?.classList.toggle('recording', active);
  control.title = active ? 'Stop Swarmcast' : 'Swarmcast';
  if (label) label.innerText = active ? 'Stop' : 'Swarmcast';
  }

  watchBroadcastNegotiation(peerId, pc) {
    const mod = this.mod;

  if (!pc || pc.swarmcastNegotiationWatched || typeof pc.addEventListener !== 'function') return;
  pc.swarmcastNegotiationWatched = true;
  pc.addEventListener('negotiationneeded', () => {
    pipelineTrace('broadcaster', 'negotiation', {
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

  pushBroadcast() {
    const publication = this.mod.swarmcast;
    if (!publication) return;
    publication.mod = this.mod;
    publication.pushBroadcast();
  }

  publishTrackMap(peerId) {
    const publication = this.mod.swarmcast;
    if (!publication) return;
    publication.mod = this.mod;
    publication.publishTrackMap(peerId);
  }

  async handlePeerTransaction(tx, txmsg) {
    const mod = this.mod;

  const from = tx.from[0].publicKey;
  const data = txmsg.data || {};
  if (txmsg.request === 'video-call-swarmcast-join-request') {
    await this.answerBroadcastJoin(from, data);
    return;
  }
  if (txmsg.request === 'video-call-swarmcast-join-response') {
    if (!mod.swarmcast && data.state === 'ready' && data.publication) {
      mod.swarmcast = new Swarmcast({
        id: data.publication.id,
        callId: data.publication.callId || data.callId,
        broadcaster: data.publication.broadcaster,
        show: data.publication.show,
        mod
      });
      bindSwarmcastEvents(mod.swarmcast);
    }
    if (mod.swarmcast) {
      mod.swarmcast.mod = mod;
      mod.swarmcast.receiveJoinResponse(data);
    }
    mod.swarmcastView?.receiveJoin(data);
    return;
  }
  if (txmsg.request === 'video-call-swarmcast-update') {
    if (mod.swarmcast) {
      mod.swarmcast.mod = mod;
      mod.swarmcast.receiveSwarmUpdate(data, from);
    } else {
      mod.swarmcastView?.receiveAdmission(data);
    }
    return;
  }
  if (txmsg.request === 'video-call-swarmcast-subscribe') {
    const requested = Array.isArray(data.outputIds) ? data.outputIds.join(',') : '';
    console.info(
      'SWARMCAST MEDIA TRACE',
      'subscribe received',
      from,
      'publication',
      data.publicationId || '',
      'outputs',
      requested
    );
    this.acceptBroadcastSubscribe(from, data);
    return;
  }
  if (txmsg.request === 'video-call-swarmcast-tracks') {
    if (mod.swarmcast && (from === mod.swarmcast.parent || from === mod.swarmcast.pending_parent || mod.swarmcast.upstreams?.has(from))) {
      mod.swarmcast.mod = mod;
      mod.swarmcast.receiveParentTracks(data, from);
    }
    mod.swarmcastView?.receiveTracks(data);
    return;
  }
  if (txmsg.request === 'video-call-swarmcast-parent-available') {
    if (mod.swarmcast) {
      mod.swarmcast.mod = mod;
      mod.swarmcast.receiveParentAvailable(data, from);
    }
    return;
  }
  if (txmsg.request === 'video-call-swarmcast-parent-leaving') {
    if (mod.swarmcast) {
      mod.swarmcast.mod = mod;
      mod.swarmcast.receiveParentLeaving(data, from);
    }
    return;
  }
  if (txmsg.request === 'video-call-swarmcast-ended') {
    mod.swarmcastView?.receiveEnded(data);
    if (mod.swarmcast && data?.publicationId === mod.swarmcast.id && !mod.swarmcast.ended) {
      mod.swarmcast.receivePublicationEnded(data);
      this.stopBroadcast({ notify: false });
    }
  }
  }

  async answerBroadcastJoin(from, data) {
    const mod = this.mod;
    const publication = mod.swarmcast;
    if (!publication) {
      await mod.sendSwarmcast(from, 'video-call-swarmcast-join-response', {
        publicationId: data?.publicationId,
        callId: data?.callId,
        contact: mod.publicKey,
        state: 'unavailable',
        reason: '',
        publication: null
      });
      return;
    }
    publication.mod = mod;
    await publication.onConnectionRequest(from, data);
  }

  acceptBroadcastSubscribe(from, data) {
    const publication = this.mod.swarmcast;
    if (!publication) return;
    publication.mod = this.mod;
    publication.acceptBroadcastSubscribe(from, data);
  }
}

function notify(message, duration) {
  if (typeof siteMessage === 'function') siteMessage(message, duration);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
  });
}

function broadcastLinkMarkup(link) {
  const safe = escapeHtml(link);
  return `<div class="swarmcast-live" data-active="yes">
    <div class="swarmcast-transcript">
      <div class="swarmcast-transcript-log"></div>
      <a class="swarmcast-live-link swarmcast-transcript-link" href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>
    </div>
    <button type="button" class="swarmcast-live-copy">Copy link</button>
    <button type="button" class="swarmcast-live-settings">Settings</button>
    <p class="swarmcast-live-copied" hidden>Link copied</p>
  </div>`;
}

function choice(config, fallback) {
  const mode = ['none', 'me', 'one', 'everyone', 'subset', 'interface'].includes(config?.mode)
    ? config.mode
    : fallback;
  return {
    mode,
    participant: config?.participant || '',
    participants: Array.isArray(config?.participants) ? config.participants.filter(Boolean) : []
  };
}

function normalizeSelection(config) {
  const video = choice(config?.video, 'me');
  if (video.mode === 'none') video.mode = 'me';
  const audio = config?.includeAllAudio ? { mode: 'everyone', participant: '', participants: [] } : choice(config?.audio, 'none');
  if (audio.mode === 'interface') audio.mode = 'everyone';
  return { video, audio };
}

function recoveryBlocked(record, tabId, now = Date.now()) {
  if (!record || record.status !== 'live') return false;
  if (!record.owner || !tabId || record.owner === tabId) return false;
  return now - Number(record.heartbeat || 0) < 15000;
}

function restorePublication(mod, record) {
  if (!mod || !record || record.status !== 'live' || !record.publication_id) return null;
  const tab = typeof mod.recoveryTabId === 'function' ? mod.recoveryTabId() : record.owner;
  if (recoveryBlocked(record, tab)) return null;
  const slots = Number(record.max_slots);
  const pub = new Swarmcast({
    id: record.publication_id,
    callId: record.call_id,
    broadcaster: record.broadcaster,
    show: record.show,
    mod,
    ...(Number.isFinite(slots) && slots >= 0 ? { max_slots: slots } : {})
  });
  pub.former_children = Array.isArray(record.former_children) ? record.former_children.slice() : [];
  if (record.active_parent) {
    pub.parent = record.active_parent;
    pub.noteUpstream(record.active_parent, { link: 'down' });
  }
  mod.swarmcast = pub;
  mod.swarmcastLink = record.link || '';
  mod.swarmcastConfig = record.config || null;
  mod.swarmcastNeedsResume = record.show === 'interface' && record.broadcaster === mod.publicKey;
  bindSwarmcastEvents(pub);
  return pub;
}

module.exports = {
  Swarmcast,
  Swarmcasts,
  recoveryBlocked,
  restorePublication,
  syncSenders,
  trackMap,
  pipelineTrace,
  reported,
  compareCounters,
  settleSenders,
  noteNegotiationState,
  selectRtpReport,
  interpretMedia,
  QUALITY_PRESETS,
  displayQuality,
  streamQuality,
  stepQuality,
  broadcastLimits,
  broadcastDiagnostic
};
