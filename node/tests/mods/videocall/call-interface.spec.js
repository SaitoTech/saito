const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.MouseEvent = dom.window.MouseEvent;

const CallInterfaceEmbedded = require('../../../mods/videocall/lib/ui/embedded_interface');

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
  const ui = new CallInterfaceEmbedded(app, mod, document.body);
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
    expect(source).toMatch(/if \(this\.browser_active\) \{[\s\S]*new CallInterfaceFullScreen/);
    expect(source).toMatch(/new CallInterfaceEmbedded\(app, this, settings\?\.container\)/);
    expect(source).not.toMatch(/settings\.ui ===|ui === 'custom'|ui === 'large'|ui === 'video'/);
    expect(source).not.toMatch(/CallInterfaceFloat|CallOverlay|call-interface-video|stream-mirror/);
    expect(source).not.toMatch(/removeAllListeners/);

    const meeting = fs.readFileSync(
      path.join(__dirname, '../../../mods/videocall/lib/ui/full_screen_interface.template.js'),
      'utf8'
    );
    expect(meeting).toMatch(/id="stun-chatbox"/);
    expect(meeting).toMatch(/video-container-large/);
    expect(meeting).toMatch(/class="counter"/);

    const meetingCode = fs.readFileSync(
      path.join(__dirname, '../../../mods/videocall/lib/ui/full_screen_interface.js'),
      'utf8'
    );
    expect(meetingCode).toMatch(/removeListener/);
    expect(meetingCode).not.toMatch(/removeAllListeners|StreamMirror/);
    expect(meetingCode).toMatch(/respondTo\('call-actions'/);
    expect(meetingCode).toMatch(/respondTo\('record-actions'/);
  });
});

describe('CallInterfaceEmbedded', () => {
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
    connection.emit('add-local-stream-request', stream(false));
    connection.emit('add-remote-stream-request', 'peer-a', stream(false));
    connection.emit('add-remote-stream-request', 'peer-a', stream(false));

    expect(document.getElementById('stream_local-key')).not.toBeNull();
    expect(document.getElementById('stream_peer-a')).not.toBeNull();
    expect(document.querySelectorAll('.videocall-panel')).toHaveLength(2);
    expect(document.querySelectorAll('audio')).toHaveLength(0);
    expect(document.querySelector('#stream_peer-a video').srcObject).toBeTruthy();
    expect(document.getElementById('stream_peer-a').textContent).toMatch(/Connecting/);
    connection.emit('stun-update-connection-message', 'peer-a', 'connected');
    expect(document.getElementById('stream_peer-a').textContent).toMatch(/Waiting for video/);
    connection.emit('peer-toggle-video-status', { public_key: 'peer-a', enabled: false });
    expect(document.getElementById('stream_peer-a').textContent).toMatch(/Camera off/);
    connection.emit('stun-update-connection-message', 'peer-a', 'failed');
    expect(document.getElementById('stream_peer-a').textContent).toMatch(/Connection failed/);
    expect(document.querySelector('#videocall-controls .audio-control')).not.toBeNull();
    expect(document.querySelector('#videocall-controls .disconnect-control')).not.toBeNull();
  });

  test('reconnect keeps the same window, position, and size', () => {
    const harnessed = harness();
    ui = harnessed.ui;
    const { connection } = harnessed;
    connection.emit('add-remote-stream-request', 'peer-a', stream(true));
    const panel = document.getElementById('stream_peer-a');
    panel.style.left = '80px';
    panel.style.top = '90px';
    panel.style.width = '300px';
    panel.style.height = '200px';
    const video = panel.querySelector('video');

    connection.emit('remove-peer-box', 'peer-a');
    expect(document.getElementById('stream_peer-a')).toBe(panel);
    expect(panel.textContent).toMatch(/disconnected/);

    const replacement = stream(true);
    connection.emit('add-remote-stream-request', 'peer-a', replacement);
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
    connection.emit('add-remote-stream-request', 'peer-a', stream(true));
    connection.emit('add-remote-stream-request', 'peer-b', stream(true));
    const a = document.getElementById('stream_peer-a');
    const b = document.getElementById('stream_peer-b');
    const bLeft = b.style.left;

    connection.emit('remove-peer-box', 'peer-a');
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
    connection.emit('add-remote-stream-request', 'peer-a', stream(true));
    connection.emit('add-remote-stream-request', 'peer-b', stream(true));
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
    connection.emit('add-remote-stream-request', 'peer-a', stream(true));
    connection.emit('add-remote-stream-request', 'peer-b', stream(true));
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
    const other = () => {};
    connection.on('add-remote-stream-request', other);
    connection.emit('add-remote-stream-request', 'peer-a', stream(true));

    ui.destroy();
    ui.destroy();

    expect(connection.count('add-remote-stream-request')).toBe(1);
    expect(document.querySelector('.videocall-panel')).toBeNull();
    connection.emit('add-remote-stream-request', 'peer-b', stream(true));
    expect(document.getElementById('stream_peer-b')).toBeNull();
  });

  test('timer starts when a remote participant has media', () => {
    jest.useFakeTimers();
    const harnessed = harness();
    ui = harnessed.ui;
    const { connection } = harnessed;
    connection.emit('add-local-stream-request', stream(false));
    connection.emit('add-remote-stream-request', 'peer-a', stream(false));
    const timer = document.querySelector('.videocall-timer');
    expect(timer.textContent).toBe('00:00');
    jest.advanceTimersByTime(2000);
    expect(timer.textContent).toBe('00:02');
    jest.useRealTimers();
  });
});
