const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const ComposeTemplate = require('./compose.template');

const MAX_IMAGES = 4;
const DEFAULT_CHAR_LIMIT = 500;
const POSTING_ANIMATION_MS = 500;

class ComposeOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false, true, false);

    this.overlay_id = 'redsquare-compose-overlay';
    this.placeholder = 'What is happening?';
    this.helper_text = 'Share something with the network.';
    this.avatar = '/saito/img/dreamscape.png';
    this.display_name = 'You';
    this.handle = 'you';
    this.char_limit = DEFAULT_CHAR_LIMIT;

    this.parent_tweet = null;
    this.images = [];
    this.posting = false;
    this.drag_drop_bound = false;
  }

  open(options = {}) {
    this.parent_tweet = options.parentTweet || null;
    this.images = [];
    this.posting = false;
    this.drag_drop_bound = false;

    const profile = this.mod.profile || {};

    this.avatar = profile.avatar || '/saito/img/dreamscape.png';
    this.display_name = profile.name || 'You';
    this.handle = profile.handle || 'you';

    if (this.parent_tweet) {
      this.placeholder = 'Post your reply…';
      this.helper_text = 'Add your reply to the conversation.';
    } else {
      this.placeholder = 'What is happening?';
      this.helper_text = 'Share something with the network.';
    }

    this.overlay.show(ComposeTemplate(this));
    this.attachEvents();

    setTimeout(() => {
      const input = this.getRoot()?.querySelector('.compose-input');

      if (input) {
        input.focus();
      }
    }, 50);
  }

  close() {
    this.overlay.close();
    this.images = [];
    this.parent_tweet = null;
    this.posting = false;
  }

  getRoot() {
    return document.querySelector('.saito-overlay .compose-overlay');
  }

  attachEvents() {
    const root = this.getRoot();

    if (!root) {
      return;
    }

    const input = root.querySelector('.compose-input');
    const submitBtn = root.querySelector('.compose-submit');
    const closeBtn = root.querySelector('.compose-close');
    const imageBtn = root.querySelector('.compose-image-btn');
    const gifBtn = root.querySelector('.compose-gif-btn');
    const fileInput = root.querySelector('.compose-file-input');
    const gifPlaceholder = root.querySelector('.compose-gif-placeholder');
    const gifDismiss = root.querySelector('.compose-gif-dismiss');

    if (input) {
      input.addEventListener('input', () => {
        this.updateCharacterCount();
      });

      input.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          this.submit();
        }
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.submit();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();

        if (!this.posting) {
          this.close();
        }
      });
    }

    if (imageBtn && fileInput) {
      imageBtn.addEventListener('click', (e) => {
        e.preventDefault();

        if (!this.posting) {
          fileInput.click();
        }
      });

      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];

        if (!file) {
          return;
        }

        await this.ingestFile(file);
        fileInput.value = '';
      });
    }

    if (gifBtn && gifPlaceholder) {
      gifBtn.addEventListener('click', (e) => {
        e.preventDefault();

        if (!this.posting) {
          gifPlaceholder.classList.add('visible');
          gifPlaceholder.setAttribute('aria-hidden', 'false');
        }
      });
    }

    if (gifDismiss && gifPlaceholder) {
      gifDismiss.addEventListener('click', (e) => {
        e.preventDefault();
        gifPlaceholder.classList.remove('visible');
        gifPlaceholder.setAttribute('aria-hidden', 'true');
      });
    }

    if (!this.drag_drop_bound) {
      this.app.browser.addDragAndDropFileUploadToElement(
        this.overlay_id,
        async (file) => {
          if (!this.posting) {
            await this.ingestDataUrl(file);
          }
        },
        false
      );

      this.drag_drop_bound = true;
    }

    this.updateCharacterCount();
  }

  setPostingState(active) {
    const root = this.getRoot();

    if (!root) {
      return;
    }

    root.classList.toggle('compose-overlay--posting', active);

    const screen = root.querySelector('.compose-posting-screen');

    if (screen) {
      screen.setAttribute('aria-hidden', active ? 'false' : 'true');
    }

    root.querySelectorAll('button, textarea, input').forEach((el) => {
      if (el.classList.contains('compose-file-input')) {
        return;
      }

      el.disabled = active;
    });
  }

  getText() {
    const input = this.getRoot()?.querySelector('.compose-input');
    return input ? input.value : '';
  }

  updateCharacterCount() {
    const root = this.getRoot();

    if (!root) {
      return;
    }

    const current = root.querySelector('.compose-char-current');
    const countWrap = root.querySelector('.compose-char-count');
    const length = this.getText().length;

    if (current) {
      current.textContent = String(length);
    }

    if (countWrap) {
      countWrap.classList.toggle('warning', length > this.char_limit);
    }
  }

  async ingestFile(file) {
    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = async () => {
      await this.ingestDataUrl(reader.result);
    };

    reader.readAsDataURL(file);
  }

  async ingestDataUrl(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') {
      return;
    }

    if (this.images.length >= MAX_IMAGES) {
      salert('Maximum 4 images allowed per tweet.');
      return;
    }

    if (dataUrl.includes('giphy.gif')) {
      this.addImagePreview(dataUrl);
      return;
    }

    const type = dataUrl.substring(dataUrl.indexOf(':') + 1, dataUrl.indexOf(';'));
    const allowed = this.mod.allowed_upload_types || [];

    if (allowed.length > 0 && !allowed.includes(type)) {
      salert(`Cannot upload ${type} image! Allowed file types: ${allowed.join(', ')}`);
      return;
    }

    const resized = await this.app.browser.resizeImg(dataUrl);
    this.addImagePreview(resized);
  }

  addImagePreview(src) {
    const container = this.getRoot()?.querySelector('.compose-image-preview');

    if (!container || !src) {
      return;
    }

    const index = this.images.length;
    const html = `
      <figure class="compose-image-item" data-index="${index}">
        <img src="${src}" alt="" />
        <button class="compose-image-remove" type="button" title="Remove image" aria-label="Remove image">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </figure>
    `;

    this.app.browser.addElementToSelector(html, `.saito-overlay #${this.overlay_id} .compose-image-preview`);
    this.images.push(src);

    const item = container.querySelector(`.compose-image-item[data-index="${index}"]`);
    const removeBtn = item?.querySelector('.compose-image-remove');

    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.removeImageAt(index);
      });
    }
  }

  removeImageAt(index) {
    this.images.splice(index, 1);

    const container = this.getRoot()?.querySelector('.compose-image-preview');

    if (!container) {
      return;
    }

    container.innerHTML = '';

    const saved = this.images.slice();
    this.images = [];

    for (const src of saved) {
      this.addImagePreview(src);
    }
  }

  buildPostData() {
    const text = this.getText();
    const data = { text };

    if (this.images.length > 0) {
      data.images = this.images.slice();
    }

    if (this.parent_tweet) {
      data.parent_id = this.parent_tweet.signature || '';
      data.thread_id = this.parent_tweet.thread_id || this.parent_tweet.signature || '';
    }

    return data;
  }

  collectRecipientKeys() {
    const keys = [];

    if (this.parent_tweet?.publicKey && !keys.includes(this.parent_tweet.publicKey)) {
      keys.push(this.parent_tweet.publicKey);
    }

    if (this.parent_tweet?.tx?.to) {
      for (const slip of this.parent_tweet.tx.to) {
        const publicKey = slip?.publicKey;

        if (publicKey && !keys.includes(publicKey)) {
          keys.push(publicKey);
        }
      }
    }

    return keys;
  }

  async submit() {
    if (this.posting) {
      return;
    }

    const text = this.getText().trim();

    if (this.images.length === 0 && text.length === 0) {
      siteMessage('Post Empty', 1000);
      return;
    }

    if (text.length > this.char_limit) {
      siteMessage(`Posts are limited to ${this.char_limit} characters`, 2500);
      return;
    }

    this.posting = true;
    this.setPostingState(true);

    const minimumAnimation = new Promise((resolve) => {
      setTimeout(resolve, POSTING_ANIMATION_MS);
    });

    try {
      const data = this.buildPostData();
      const keys = this.collectRecipientKeys();

      const [, tx] = await Promise.all([
        minimumAnimation,
        (async () => {
          const unsigned = await this.mod.createTweetTransaction(data, keys);
          await unsigned.sign();
          await this.app.network.propagateTransaction(unsigned);
          return unsigned;
        })()
      ]);

      const tweet = this.mod.addTweet(tx);

      if (tweet) {
        this.mod.manager?.onTweetPosted(tweet);
      }

      if (!this.mod.browser_active) {
        siteMessage('Tweet sent', 1000);
      }

      this.close();
    } catch (err) {
      console.error('RedSquare compose submit failed:', err);
      siteMessage('Unable to post tweet', 2500);
      this.setPostingState(false);
      this.posting = false;
    }
  }
}

module.exports = ComposeOverlay;
