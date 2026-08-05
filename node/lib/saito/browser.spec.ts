import Browser from './browser';

describe('browser themes', () => {
  let app: any;
  let activeModule: any;
  let browser: Browser;
  let setAttribute: jest.Mock;

  beforeEach(() => {
    activeModule = {
      is_game_template: false,
      slug: 'chat',
      theme_options: { dark: 'fa-solid fa-moon' }
    };
    setAttribute = jest.fn();

    (global as any).document = {
      documentElement: {
        classList: { contains: jest.fn(() => false) },
        setAttribute
      },
      querySelector: jest.fn(() => null)
    };

    app = {
      BROWSER: 1,
      options: { theme: {} },
      modules: { returnActiveModule: jest.fn(() => activeModule) },
      storage: { saveOptions: jest.fn() }
    };

    browser = new Browser(app);
  });

  afterEach(() => {
    delete (global as any).document;
  });

  test('falls back to dark when NFT themes are unavailable', () => {
    expect(browser.checkNFTThemes()).toBeNull();

    browser.switchTheme('noir');

    expect(setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
    expect(app.options.theme.chat).toBe('dark');
  });

  test('does not allow lite on non-game modules', () => {
    browser.switchTheme('lite');

    expect(setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
  });

  test('forces lite for game modules without saving it as a preference', () => {
    activeModule.is_game_template = true;

    browser.switchTheme('dark');

    expect(setAttribute).toHaveBeenCalledWith('data-theme', 'lite');
    expect(app.options.theme.chat).toBeUndefined();
    expect(app.storage.saveOptions).not.toHaveBeenCalled();
  });
});
