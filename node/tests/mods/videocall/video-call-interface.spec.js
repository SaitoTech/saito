const { JSDOM } = require('jsdom');
const { EventEmitter } = require('events');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;

const VideoCallFull = require('../../../mods/videocall/lib/ui/videocall-full');
const VideoCallPopup = require('../../../mods/videocall/lib/ui/videocall-popup');
const VideoBox = require('../../../mods/videocall/lib/ui/videobox');

function app() {
  return {
    connection: new EventEmitter(),
    keychain: { returnIdentifierByPublicKey: () => 'peer', returnUsername: (key) => key },
    browser: {
      addElementToDom(html, parent) {
        const holder = document.createElement('div');
        (parent || document.body).insertAdjacentElement('beforeend', holder);
        holder.outerHTML = html;
      }
    }
  };
}

function mod() {
  return { publicKey: 'local-key', layout: 'focus', streams: { audioEnabled: true, videoEnabled: true } };
}

describe('Video Call interfaces', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('full-page mode constructs VideoCallFull', () => {
    const ui = new VideoCallFull(app(), mod(), true);
    expect(ui).toBeInstanceOf(VideoCallFull);
    expect(typeof ui.switchLayout).toBe('function');
    expect(typeof ui.updateRoomLink).toBe('function');
    expect(typeof ui.showSettings).toBe('function');
    expect(typeof ui.updateConnectionStrength).toBe('function');
    ui.destroy();
  });

  test('popup mode constructs VideoCallPopup and omits full-page operations', () => {
    const ui = new VideoCallPopup(app(), mod(), document.body);
    expect(ui).toBeInstanceOf(VideoCallPopup);
    expect(ui.switchLayout).toBeUndefined();
    expect(ui.updateRoomLink).toBeUndefined();
    expect(ui.showSettings).toBeUndefined();
    expect(ui.updateConnectionStrength).toBeUndefined();
    ui.destroy();
  });

  test('shared methods delegate to the active presentation', () => {
    const ui = new VideoCallPopup(app(), mod(), document.body);
    const stream = {
      getVideoTracks: () => [{}],
      getAudioTracks: () => [{ enabled: true, muted: false }]
    };

    ui.receiveRemoteStream('peer-a', stream);
    expect(ui.panels.get('peer-a')).toBeInstanceOf(VideoBox);
    expect(document.getElementById('stream_peer-a')).not.toBeNull();

    ui.participantLeft('peer-a');
    expect(document.getElementById('stream_peer-a').textContent).toMatch(/disconnected/);

    ui.participantKicked('peer-a');
    expect(document.getElementById('stream_peer-a')).toBeNull();
    ui.destroy();
  });

  test('full-page interface owns layout and connection updates', () => {
    const ui = new VideoCallFull(app(), mod(), true);
    ui.presentControlId = 'present-button';
    expect(typeof ui.switchLayout).toBe('function');
    expect(typeof ui.updateConnectionStrength).toBe('function');
    expect(ui.presentControlId).toBe('present-button');
    ui.destroy();
  });

  test('destroy delegates and removes the meeting listeners', () => {
    const context = app();
    const ui = new VideoCallFull(context, mod(), true);
    expect(context.connection.listenerCount('videocall-call-started')).toBe(1);

    ui.destroy();
    ui.destroy();

    expect(context.connection.listenerCount('videocall-call-started')).toBe(0);
  });

  test('destroy through the facade removes floating windows', () => {
    const ui = new VideoCallPopup(app(), mod(), document.body);
    ui.receiveRemoteStream('peer-a', {
      getVideoTracks: () => [{}],
      getAudioTracks: () => [{ enabled: true, muted: false }]
    });

    ui.destroy();
    ui.destroy();

    expect(document.querySelector('.videocall-panel')).toBeNull();
    ui.receiveRemoteStream('peer-b', {
      getVideoTracks: () => [{}],
      getAudioTracks: () => [{ enabled: true, muted: false }]
    });
    expect(document.getElementById('stream_peer-b')).toBeNull();
  });

  test('floating windows follow registry add and remove', () => {
    const context = app();
    const ui = new VideoCallPopup(context, mod(), document.body);
    const video = {
      getTracks: () => [{ kind: 'video' }],
      getVideoTracks: () => [{ kind: 'video' }],
      getAudioTracks: () => []
    };
    const entry = {
      id: 's1',
      source: 'peer-a',
      kind: 'camera',
      origin: 'remote',
      session: 'call',
      availability: 'live',
      disposition: 'borrowed',
      mediaStream: video,
      peerId: 'peer-a'
    };

    context.connection.emit('videocall-stream-added', entry);
    expect(document.getElementById('stream_peer-a')).not.toBeNull();
    expect(document.querySelector('#stream_peer-a video').srcObject).toBe(video);

    context.connection.emit('videocall-stream-added', {
      ...entry,
      id: 'external',
      kind: 'external',
      origin: 'application',
      session: 'standalone',
      peerId: null
    });
    expect(document.querySelectorAll('.videocall-panel')).toHaveLength(1);

    context.connection.emit('videocall-stream-removed', entry);
    expect(document.getElementById('stream_peer-a').textContent).toMatch(/disconnected/);
    ui.destroy();
  });
});
