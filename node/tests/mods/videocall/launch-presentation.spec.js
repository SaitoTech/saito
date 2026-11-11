const Videocall = require('../../../mods/videocall/videocall');
const CallLaunch = require('../../../mods/videocall/lib/ui/splash');
const splash = require('../../../mods/videocall/lib/ui/splash.template');
const fullTemplate = require('../../../mods/videocall/lib/ui/videocall-full.template');

function choice(mod, checked) {
  const previous = global.document;
  global.document = {
    getElementById(id) {
      if (id !== 'embedded_call_switch') return null;
      return { checked };
    }
  };
  try {
    return CallLaunch.prototype.presentationChoice.call({ mod });
  } finally {
    global.document = previous;
  }
}

describe('landing screen presentation', () => {
  test('a direct launch defaults to standalone and a host launch defaults to embedded', () => {
    const direct = splash({}, { browser_active: 1 }, []);
    const hosted = splash({}, { browser_active: 0 }, []);

    expect(direct).toContain('>embedded<');
    expect(direct).not.toContain('id="embedded_call_switch" checked');
    expect(hosted).toContain('id="embedded_call_switch" checked');
    expect(direct).not.toContain('video_call_switch');
  });

  test('the landing toggle chooses the interface and the host context is the fallback', () => {
    const created = Object.create(Videocall.prototype);

    created.browser_active = 0;
    expect(choice({ browser_active: 0 }, true)).toBe('embedded');
    expect(choice({ browser_active: 0 }, false)).toBe('standalone');
    expect(created.callPresentation({})).toBe('embedded');

    created.browser_active = 1;
    expect(choice({ browser_active: 1 }, false)).toBe('standalone');
    expect(created.callPresentation({ video: true, audio: false })).toBe('standalone');
    expect(created.callPresentation({ presentation: 'embedded', video: true })).toBe('embedded');
    expect(created.callPresentation({ presentation: 'standalone' })).toBe('standalone');
  });

  test('changing the choice does not replace an interface that is already open', () => {
    const created = Object.create(Videocall.prototype);
    const existing = { name: 'open-call' };
    created.CallInterface = existing;
    created.browser_active = 0;
    created.standalonePresentation = false;

    created.initializeCallInterface({ presentation: 'standalone', video: true, audio: true });

    expect(created.CallInterface).toBe(existing);
    expect(created.standalonePresentation).toBe(false);
  });

  test('standalone from a host application uses the full-screen shell', () => {
    const hostedStandalone = fullTemplate({ browser_active: 0, standalonePresentation: true });
    const embeddedShell = fullTemplate({ browser_active: 0, standalonePresentation: false });
    const direct = fullTemplate({ browser_active: 1, standalonePresentation: true });

    expect(hostedStandalone).toContain('stun-overlay-container');
    expect(hostedStandalone).not.toContain('minimizer');
    expect(embeddedShell).toContain('minimizer');
    expect(direct).toContain('saito-video-container');
    expect(direct).not.toContain('minimizer');
  });
});
