const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.MouseEvent = dom.window.MouseEvent;

const VideoCallPopup = require('../../../mods/videocall/lib/ui/videocall-popup');

function emitter() {
  const handlers = {};
  return {
    on(event, handler) {
      handlers[event] = handlers[event] || [];
      handlers[event].push(handler);
    },
    removeListener(event, handler) {
      handlers[event] = (handlers[event] || []).filter((item) => item !== handler);
    },
    emit(event, ...args) {
      (handlers[event] || []).forEach((handler) => handler(...args));
    },
    count(event) {
      return (handlers[event] || []).length;
    }
  };
}

function stream(hasVideo) {
  return {
    getVideoTracks: () => (hasVideo ? [{}] : []),
    getAudioTracks: () => [{ enabled: true, muted: false }]
  };
}

function harness() {
  document.body.innerHTML = '';
  const connection = emitter();
  const app = {
    connection,
    keychain: { returnIdentifierByPublicKey: () => 'peer' },
    browser: {
      addElementToDom(html, parent) {
        const holder = document.createElement('div');
        (parent || document.body).insertAdjacentElement('beforeend', holder);
        holder.outerHTML = html;
      }
    }
  };
  const mod = { publicKey: 'local-key', streams: { audioEnabled: true, videoEnabled: true } };
  const ui = new VideoCallPopup(app, mod, document.body);
  return { app, connection, ui };
}

function size(el) {
  Object.defineProperty(el, 'offsetWidth', {
    configurable: true,
    get() {
      return parseFloat(this.style.width) || 240;
    }
  });
  Object.defineProperty(el, 'offsetHeight', {
    configurable: true,
    get() {
      return parseFloat(this.style.height) || 180;
    }
  });
}

describe('call presentation selection', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../../mods/videocall/videocall.js'),
    'utf8'
  );

  test('chooses the meeting only when this page is videocall', () => {
    expect(source).toMatch(/new VideoCallFull\(this\.app, this, true\)/);
    expect(source).toMatch(/new VideoCallPopup\(this\.app, this, settings\?\.container\)/);
    expect(source).toMatch(/this\.browser_active/);
    expect(source).not.toMatch(/VideoCallInterface|new Meeting\(|new Windows\(/);
    expect(source).not.toMatch(/settings\.ui ===|ui === 'custom'|ui === 'large'|ui === 'video'/);
    expect(source).not.toMatch(/CallInterfaceFloat|CallOverlay|call-interface-video|stream-mirror/);
    expect(source).not.toMatch(/removeAllListeners/);

    const meeting = fs.readFileSync(
      path.join(__dirname, '../../../mods/videocall/lib/ui/videocall-full.template.js'),
      'utf8'
    );
    expect(meeting).toMatch(/id="stun-chatbox"/);
    expect(meeting).toMatch(/video-container-large/);
    expect(meeting).toMatch(/class="counter"/);

    const meetingCode = fs.readFileSync(
      path.join(__dirname, '../../../mods/videocall/lib/ui/videocall-full.js'),
      'utf8'
    );
    expect(meetingCode).toMatch(/removeListener/);
    expect(meetingCode).not.toMatch(/removeAllListeners|StreamMirror/);
    expect(meetingCode).toMatch(/respondTo\('call-actions'/);
    expect(meetingCode).toMatch(/respondTo\('record-actions'/);
    expect(meetingCode).toMatch(/new VideoBox\(/);

    const popupCode = fs.readFileSync(
      path.join(__dirname, '../../../mods/videocall/lib/ui/videocall-popup.js'),
      'utf8'
    );
    expect(popupCode).toMatch(/new VideoBox\(/);
    expect(popupCode).toMatch(/require\('\.\/videobox'\)/);
    expect(meetingCode).toMatch(/require\('\.\/videobox'\)/);
  });
});

describe('VideoCallPopup', () => {
  let ui;

  afterEach(() => {
    ui?.destroy();
    ui = null;
    jest.useRealTimers();
  });

  test('one window per public key, including audio-only', () => {
    const harnessed = harness();
    ui = harnessed.ui;
    const { connection } = harnessed;
    ui.receiveLocalStream(stream(false));
    ui.receiveRemoteStream('peer-a', stream(false));
    ui.receiveRemoteStream('peer-a', stream(false));

    expect(document.getElementById('stream_local-key')).not.toBeNull();
    expect(document.getElementById('stream_peer-a')).not.toBeNull();
    expect(document.querySelectorAll('.videocall-panel')).toHaveLength(2);
    expect(document.querySelectorAll('audio')).toHaveLength(0);
    expect(document.querySelector('#stream_peer-a video').srcObject).toBeTruthy();
    expect(document.getElementById('stream_peer-a').textContent).toMatch(/Connecting/);
    connection.emit('stun-update-connection-message', 'peer-a', 'connected');
    expect(document.getElementById('stream_peer-a').textContent).toMatch(/Waiting for video/);
    connection.emit('videocall-peer-video-changed', { public_key: 'peer-a', enabled: false });
    expect(document.getElementById('stream_peer-a').textContent).toMatch(/Camera off/);
    connection.emit('stun-update-connection-message', 'peer-a', 'failed');
    expect(document.getElementById('stream_peer-a').textContent).toMatch(/Connection failed/);
    expect(document.querySelector('#videocall-controls .audio-control')).not.toBeNull();
    expect(document.querySelector('#videocall-controls .disconnect-control')).not.toBeNull();
    expect(document.querySelector('#videocall-controls .swarmcast-control')).not.toBeNull();
  });

  test('the embedded Swarmcast control opens the shared overlay', () => {
    const harnessed = harness();
    ui = harnessed.ui;
    let opened = 0;
    ui.mod.showSwarmcast = () => {
      opened += 1;
    };
    ui.receiveLocalStream(stream(false));
    document.querySelector('#swarmcast-control').click();
    expect(opened).toBe(1);
    expect(ui.mod.swarmcast).toBeUndefined();
  });

  test('reconnect keeps the same window, position, and size', () => {
    const harnessed = harness();
    ui = harnessed.ui;
    const { connection } = harnessed;
    ui.receiveRemoteStream('peer-a', stream(true));
    const panel = document.getElementById('stream_peer-a');
    panel.style.left = '80px';
    panel.style.top = '90px';
    panel.style.width = '300px';
    panel.style.height = '200px';
    const video = panel.querySelector('video');

    ui.participantLeft('peer-a');
    expect(document.getElementById('stream_peer-a')).toBe(panel);
    expect(panel.textContent).toMatch(/disconnected/);

    const replacement = stream(true);
    ui.receiveRemoteStream('peer-a', replacement);
    expect(document.getElementById('stream_peer-a')).toBe(panel);
    expect(panel.style.left).toBe('80px');
    expect(panel.style.top).toBe('90px');
    expect(panel.style.width).toBe('300px');
    expect(panel.querySelector('video')).toBe(video);
    expect(video.srcObject).toBe(replacement);
  });

  test('one participant leaving or being kicked does not move the other', () => {
    const harnessed = harness();
    ui = harnessed.ui;
    const { connection } = harnessed;
    ui.receiveRemoteStream('peer-a', stream(true));
    ui.receiveRemoteStream('peer-b', stream(true));
    const a = document.getElementById('stream_peer-a');
    const b = document.getElementById('stream_peer-b');
    const bLeft = b.style.left;

    ui.participantLeft('peer-a');
    expect(document.getElementById('stream_peer-b').style.left).toBe(bLeft);

    ui.drop('peer-a');
    expect(document.getElementById('stream_peer-a')).toBeNull();
    expect(document.getElementById('stream_peer-b')).toBe(b);
    expect(b.style.left).toBe(bLeft);
  });

  test('resize changes one window and respects the minimum', () => {
    const harnessed = harness();
    ui = harnessed.ui;
    const { connection } = harnessed;
    ui.receiveRemoteStream('peer-a', stream(true));
    ui.receiveRemoteStream('peer-b', stream(true));
    const a = document.getElementById('stream_peer-a');
    const b = document.getElementById('stream_peer-b');
    size(a);
    size(b);

    const left = parseFloat(a.style.left);
    const top = parseFloat(a.style.top);
    const bLeft = b.style.left;

    a.querySelector('.videocall-resize').dispatchEvent(
      new MouseEvent('mousedown', { button: 0, clientX: 0, clientY: 0, bubbles: true })
    );
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: -80, clientY: -40 }));
    document.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));

    expect(a.style.width).toBe('320px');
    expect(a.style.height).toBe('220px');
    expect(parseFloat(a.style.left) + 320).toBe(left + 240);
    expect(parseFloat(a.style.top) + 220).toBe(top + 180);
    expect(b.style.width).toBe('');
    expect(b.style.left).toBe(bLeft);

    a.querySelector('.videocall-resize').dispatchEvent(
      new MouseEvent('mousedown', { button: 0, clientX: 0, clientY: 0, bubbles: true })
    );
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 400, clientY: 400 }));
    document.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));

    expect(a.style.width).toBe('160px');
    expect(a.style.height).toBe('120px');
    expect(b.style.width).toBe('');
    expect(b.style.left).toBe(bLeft);
  });

  test('drag moves one window', () => {
    const harnessed = harness();
    ui = harnessed.ui;
    const { connection } = harnessed;
    ui.receiveRemoteStream('peer-a', stream(true));
    ui.receiveRemoteStream('peer-b', stream(true));
    const a = document.getElementById('stream_peer-a');
    const b = document.getElementById('stream_peer-b');
    const bLeft = b.style.left;

    a.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 10, clientY: 10, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 25 }));
    document.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));

    expect(parseFloat(a.style.left)).toBeGreaterThan(parseFloat('16'));
    expect(b.style.left).toBe(bLeft);
  });

  test('destroy removes only this interface listeners', () => {
    const harnessed = harness();
    ui = harnessed.ui;
    const { connection } = harnessed;
    ui.receiveRemoteStream('peer-a', stream(true));

    ui.destroy();
    ui.destroy();

    expect(connection.count('add-remote-stream-request')).toBe(0);
    expect(document.querySelector('.videocall-panel')).toBeNull();
    ui.receiveRemoteStream('peer-b', stream(true));
    expect(document.getElementById('stream_peer-b')).toBeNull();
  });

  test('timer starts when a remote participant has media', () => {
    jest.useFakeTimers();
    const harnessed = harness();
    ui = harnessed.ui;
    const { connection } = harnessed;
    ui.receiveLocalStream(stream(false));
    ui.receiveRemoteStream('peer-a', stream(false));
    const timer = document.querySelector('.videocall-timer');
    expect(timer.textContent).toBe('00:00');
    jest.advanceTimersByTime(2000);
    expect(timer.textContent).toBe('00:02');
    jest.useRealTimers();
  });
});

class DeparturePeerConnection {
  constructor() {
    this.signalingState = 'stable';
    this.connectionState = 'new';
    this.iceConnectionState = 'new';
    this.iceGatheringState = 'new';
  }

  addEventListener() {}

  createDataChannel() {
    return {};
  }

  close() {
    this.connectionState = 'closed';
    this.signalingState = 'closed';
  }
}

global.navigator = dom.window.navigator;

const Videocall = require('../../../mods/videocall/videocall');
const Stun = require('../../../mods/stun/stun');

function departure() {
  document.body.innerHTML = '';
  const connection = emitter();
  const app = {
    BROWSER: 1,
    connection,
    options: { videocall: { settings: { mode: 'default' } }, stun: { settings: {} } },
    keychain: {
      returnUsername: (key) => key,
      returnIdentifierByPublicKey: () => 'peer'
    },
    browser: {
      addElementToDom(html, parent) {
        const holder = document.createElement('div');
        (parent || document.body).insertAdjacentElement('beforeend', holder);
        holder.outerHTML = html;
      }
    },
    storage: { saveOptions() {} }
  };
  const stun = new Stun(app);
  stun.publicKey = 'local-key';
  const call = Object.create(Videocall.prototype);
  call.app = app;
  call.publicKey = 'local-key';
  call.name = 'Videocall';
  call.processedTxs = {};
  call.db_tables = [];
  call.shortlinks_enabled = 0;
  call.layout = 'focus';
  call.screen_share = false;
  call.have_joined_room = Date.now();
  call.peerManager = stun;
  call.room_obj = { call_id: 'room-1', call_peers: ['peer-a', 'peer-b'] };
  const entries = new Map([
    ['peer-a', { id: 'cam-a', kind: 'camera', origin: 'remote', session: 'call', peerId: 'peer-a', availability: 'live', disposition: 'borrowed', mediaStream: stream(true) }],
    ['peer-b', { id: 'cam-b', kind: 'camera', origin: 'remote', session: 'call', peerId: 'peer-b', availability: 'live', disposition: 'borrowed', mediaStream: stream(true) }],
    ['display', { id: 'display', kind: 'display', origin: 'remote', session: 'call', peerId: 'peer-b', availability: 'live', disposition: 'borrowed', mediaStream: stream(true) }]
  ]);
  call.streams = {
    active: true,
    audioEnabled: true,
    videoEnabled: true,
    entries,
    removals: [],
    get remoteStreams() {
      const map = new Map();
      for (const entry of entries.values()) {
        if (entry.kind === 'camera' && entry.peerId) map.set(entry.peerId, entry.mediaStream);
        if (entry.kind === 'display') map.set('presentation', entry.mediaStream);
      }
      return map;
    },
    removePeer(peer, msg) {
      this.removals.push({ peer, msg });
      for (const [id, entry] of [...entries]) {
        if (entry.kind === 'camera' && entry.peerId === peer) {
          entries.delete(id);
          app.connection.emit('videocall-stream-removed', entry);
        }
      }
    },
    clearDisplay() {
      for (const [id, entry] of [...entries]) {
        if (entry.kind === 'display') {
          entries.delete(id);
          app.connection.emit('videocall-stream-removed', entry);
        }
      }
    },
    setCameraCapture() {}
  };
  call.CallInterface = new VideoCallPopup(app, call, document.body);
  return { app, call, stun };
}

function transaction(request, from, extra = {}) {
  return {
    signature: `${request}-${from}-${extra.signature || '1'}`,
    timestamp: Date.now(),
    from: [{ publicKey: from }],
    isTo: () => true,
    isFrom: (key) => key === from,
    returnMessage: () => ({
      module: 'Stun',
      request,
      call_id: 'room-1',
      ...extra.message
    })
  };
}

describe('participant departure', () => {
  const previousPeerConnection = global.RTCPeerConnection;

  beforeAll(() => {
    global.RTCPeerConnection = DeparturePeerConnection;
    global.siteMessage = () => {};
    global.salert = () => {};
    global.AudioContext = class {
      createMediaStreamSource() {
        return { connect() {} };
      }
      createAnalyser() {
        return { fftSize: 0, frequencyBinCount: 0, getByteFrequencyData() {} };
      }
    };
    global.requestAnimationFrame = () => 0;
    global.cancelAnimationFrame = () => {};
    window.requestAnimationFrame = () => 0;
    window.cancelAnimationFrame = () => {};
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  afterAll(() => {
    global.RTCPeerConnection = previousPeerConnection;
  });

  test('ordinary departure removes the peer from the room and from Stun', async () => {
    const { app, call, stun } = departure();
    stun.createPeerConnection('peer-a');
    stun.createPeerConnection('peer-b');

    await call.handlePeerTransaction(app, transaction('peer-left', 'peer-a'));

    expect(call.room_obj.call_peers).toEqual(['peer-b']);
    expect(stun.peers.has('peer-a')).toBe(false);
    expect(call.streams.remoteStreams.has('peer-a')).toBe(false);
    expect(call.streams.removals).toEqual([{ peer: 'peer-a', msg: 'left the meeting' }]);
    expect(document.getElementById('stream_peer-b')).toBeNull();
  });

  test('a kick broadcast removes the kicked peer connection for an observer', async () => {
    const { app, call, stun } = departure();
    stun.createPeerConnection('peer-a');
    const tx = transaction('peer-kick-broadcast', 'peer-b', {
      message: { data: { kicked_peer: 'peer-a' } }
    });

    await call.handlePeerTransaction(app, tx);

    expect(call.room_obj.call_peers).toEqual(['peer-b']);
    expect(stun.peers.has('peer-a')).toBe(false);
    expect(call.streams.removals[0].msg).toBe('was kicked out of the call');
  });

  test('stun-connection-close uses the same departure cleanup', () => {
    const { app, call, stun } = departure();
    const live = new Videocall(app);
    live.peerManager = stun;
    live.room_obj = call.room_obj;
    live.streams = call.streams;
    live.CallInterface = call.CallInterface;
    live.publicKey = 'local-key';
    live.screen_share = false;
    stun.createPeerConnection('peer-a');

    app.connection.emit('stun-connection-close', 'peer-a');

    expect(call.room_obj.call_peers).toEqual(['peer-b']);
    expect(stun.peers.has('peer-a')).toBe(false);
    expect(call.streams.removals).toEqual([{ peer: 'peer-a', msg: ' has no connection' }]);
    live.CallInterface = null;
  });

  test('cleanup is safe when Stun already removed the connection', () => {
    const { call, stun } = departure();
    stun.createPeerConnection('peer-a');
    stun.removePeerConnection('peer-a');

    expect(() => call.disconnect('peer-a')).not.toThrow();

    expect(stun.peers.has('peer-a')).toBe(false);
    expect(call.room_obj.call_peers).toEqual(['peer-b']);
    expect(call.streams.removals).toHaveLength(1);
  });

  test('a repeated departure notification does not repeat the interface update', () => {
    const { call, stun } = departure();
    stun.createPeerConnection('peer-a');
    const left = jest.spyOn(call.CallInterface, 'participantLeft');

    call.disconnect('peer-a');
    call.disconnect('peer-a');

    expect(left).toHaveBeenCalledTimes(1);
    expect(call.streams.removals).toHaveLength(1);
    expect(stun.peers.has('peer-a')).toBe(false);
    expect(call.room_obj.call_peers).toEqual(['peer-b']);
  });

  test('departure of the presenter clears the presentation and leaves local capture alone', () => {
    const { call } = departure();
    call.screen_share = 'peer-a';
    call.CallInterface.receiveRemoteStream('presentation', stream(true));
    const track = { stop: jest.fn() };
    call.streams.presentationStream = { getTracks: () => [track] };
    const stopped = jest.spyOn(call.CallInterface, 'presentationStopped');

    call.disconnect('peer-a');

    expect(call.screen_share).toBeNull();
    expect(stopped).toHaveBeenCalledTimes(1);
    expect(call.streams.remoteStreams.has('presentation')).toBe(false);
    expect(document.getElementById('stream_presentation')).toBeNull();
    expect(track.stop).not.toHaveBeenCalled();
  });

  test('departure of someone else leaves the current presentation in place', () => {
    const { call } = departure();
    call.screen_share = 'peer-b';
    call.CallInterface.receiveRemoteStream('presentation', stream(true));
    const stopped = jest.spyOn(call.CallInterface, 'presentationStopped');

    call.disconnect('peer-a');

    expect(call.screen_share).toBe('peer-b');
    expect(stopped).not.toHaveBeenCalled();
    expect(call.streams.remoteStreams.has('presentation')).toBe(true);
    expect(document.getElementById('stream_presentation')).not.toBeNull();
  });

  test('reconnecting the same public key creates a new peer connection', () => {
    jest.useFakeTimers();
    const { call, stun } = departure();
    stun.createPeerConnection('peer-a');
    const first = stun.peers.get('peer-a');
    let late = false;
    first.iceRestartTimer = setTimeout(() => {
      late = true;
    }, 1000);
    call.CallInterface.receiveRemoteStream('peer-a', stream(true));
    const panel = document.getElementById('stream_peer-a');
    panel.style.left = '80px';
    panel.style.top = '90px';
    panel.style.width = '300px';

    call.disconnect('peer-a');
    call.room_obj.call_peers.push('peer-a');
    stun.createPeerConnection('peer-a');
    jest.advanceTimersByTime(1000);

    const second = stun.peers.get('peer-a');
    expect(second).not.toBe(first);
    expect(first.signalingState).toBe('closed');
    expect(late).toBe(false);
    expect(second.iceRestartTimer).toBeNull();
    call.CallInterface.receiveRemoteStream('peer-a', stream(true));
    expect(document.getElementById('stream_peer-a')).toBe(panel);
    expect(panel.style.left).toBe('80px');
    expect(panel.style.top).toBe('90px');
    expect(panel.style.width).toBe('300px');
  });

  test('removing one peer leaves the other connection in a three-party call', () => {
    const { call, stun } = departure();
    stun.createPeerConnection('peer-a');
    stun.createPeerConnection('peer-b');
    const remaining = stun.peers.get('peer-b');

    call.disconnect('peer-a');

    expect(stun.peers.get('peer-b')).toBe(remaining);
    expect(remaining.signalingState).toBe('stable');
    expect(call.room_obj.call_peers).toEqual(['peer-b']);
    expect(call.streams.remoteStreams.has('peer-b')).toBe(true);
  });
});
