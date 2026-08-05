const mockOverlayRender = jest.fn();

jest.mock('../../../lib/saito/ui/saito-image-overlay/saito-image-overlay', () =>
  jest.fn().mockImplementation(() => ({ render: mockOverlayRender }))
);

const Manager = require('./manager');
const TweetGalleryTemplate = require('./tweet-gallery.template');
const SaitoImageOverlay = require('../../../lib/saito/ui/saito-image-overlay/saito-image-overlay');

describe('RedSquare tweet galleries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders indexed, keyboard-accessible images and escapes their sources', () => {
    const html = TweetGalleryTemplate({
      images: ['data:image/png;base64,one', 'https://example.com/image.jpg?label="quoted"&n=2']
    });

    expect(html).toContain('class="gallery count-2"');
    expect(html).toContain('data-index="0"');
    expect(html).toContain('data-index="1"');
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('alt="Tweet image 2 of 2"');
    expect(html).toContain('label=&quot;quoted&quot;&amp;n=2');
  });

  test('opens the selected gallery image without treating it as tweet navigation', () => {
    const listeners: Record<string, (event: any) => void> = {};
    const root = {
      dataset: {},
      contains: jest.fn(() => true),
      addEventListener: jest.fn((type, listener) => {
        listeners[type] = listener;
      })
    };
    const gallery = {
      querySelectorAll: jest.fn(() => [firstImage, secondImage])
    };
    const firstImage = {
      closest: jest.fn((selector) => (selector === '.gallery' ? gallery : firstImage)),
      getAttribute: jest.fn(() => 'first.jpg')
    };
    const secondImage = {
      closest: jest.fn((selector) => (selector === '.gallery' ? gallery : secondImage)),
      getAttribute: jest.fn(() => 'second.jpg')
    };
    const manager = new Manager({ browser: {} }, {});
    const event = {
      target: secondImage,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn()
    };

    manager.attachTweetImageViewer(root);
    listeners.click(event);

    expect(SaitoImageOverlay).toHaveBeenCalledWith(manager.app, manager.mod, [
      'first.jpg',
      'second.jpg'
    ]);
    expect(mockOverlayRender).toHaveBeenCalledWith(1);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(Manager.isTweetActionTarget(secondImage)).toBe(true);
    expect(Manager.resolveClickedSignature(secondImage)).toBe('');

    const keyboardEvent = {
      key: 'Enter',
      target: firstImage,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn()
    };

    mockOverlayRender.mockClear();
    listeners.keydown(keyboardEvent);

    expect(mockOverlayRender).toHaveBeenCalledWith(0);
    expect(keyboardEvent.preventDefault).toHaveBeenCalled();
    expect(keyboardEvent.stopPropagation).toHaveBeenCalled();
  });
});
