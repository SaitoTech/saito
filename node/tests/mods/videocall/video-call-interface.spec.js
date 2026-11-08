const { JSDOM } = require('jsdom');
const { EventEmitter } = require('events');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;

const VideoCallInterface = require('../../../mods/videocall/lib/ui/video_call_interface');
const Meeting = require('../../../mods/videocall/lib/ui/meeting');
const Windows = require('../../../mods/videocall/lib/ui/windows');

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

describe('VideoCallInterface', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('meeting mode constructs the meeting presentation', () => {
    const ui = new VideoCallInterface(app(), mod(), 'meeting');
    expect(ui.presentation).toBeInstanceOf(Meeting);
    expect(typeof ui.switchLayout).toBe('function');
    expect(typeof ui.updateRoomLink).toBe('function');
    expect(typeof ui.showSettings).toBe('function');
    expect(typeof ui.updateConnectionStrength).toBe('function');
    ui.destroy();
  });

  test('windows mode constructs the floating windows and omits meeting operations', () => {
    const ui = new VideoCallInterface(app(), mod(), 'windows', document.body);
    expect(ui.presentation).toBeInstanceOf(Windows);
    expect(ui.switchLayout).toBeUndefined();
    expect(ui.updateRoomLink).toBeUndefined();
    expect(ui.showSettings).toBeUndefined();
    expect(ui.updateConnectionStrength).toBeUndefined();
    ui.destroy();
  });

  test('shared methods delegate to the active presentation', () => {
    const ui = new VideoCallInterface(app(), mod(), 'windows', document.body);
    const stream = {
      getVideoTracks: () => [{}],
      getAudioTracks: () => [{ enabled: true, muted: false }]
    };

    ui.receiveRemoteStream('peer-a', stream);
    expect(document.getElementById('stream_peer-a')).not.toBeNull();

    ui.participantLeft('peer-a');
    expect(document.getElementById('stream_peer-a').textContent).toMatch(/disconnected/);

    ui.participantKicked('peer-a');
    expect(document.getElementById('stream_peer-a')).toBeNull();
    ui.destroy();
  });

  test('meeting-only operations are forwarded only to the meeting', () => {
    const ui = new VideoCallInterface(app(), mod(), 'meeting');
    const calls = [];
    ui.presentation.switchLayout = (...args) => calls.push(args);
    ui.presentation.updateConnectionStrength = (...args) => calls.push(args);

    ui.switchLayout('gallery', true);
    ui.updateConnectionStrength('peer-a', 4.2);
    ui.presentControlId = 'present-button';

    expect(calls).toEqual([
      ['gallery', true],
      ['peer-a', 4.2]
    ]);
    expect(ui.presentation.presentControlId).toBe('present-button');
    expect(ui.presentControlId).toBe('present-button');
    ui.destroy();
  });

  test('destroy delegates and removes the meeting listeners', () => {
    const context = app();
    const ui = new VideoCallInterface(context, mod(), 'meeting');
    expect(context.connection.listenerCount('videocall-call-started')).toBe(1);

    ui.destroy();
    ui.destroy();

    expect(context.connection.listenerCount('videocall-call-started')).toBe(0);
  });

  test('destroy through the facade removes floating windows', () => {
    const ui = new VideoCallInterface(app(), mod(), 'windows', document.body);
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
});
