const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const ComposeTemplate = require('./compose.template');

const MAX_IMAGES = 4;
const DEFAULT_CHAR_LIMIT = 500;
const POSTING_ANIMATION_MS = 500;

class ComposeOverlay {
  constructor(app, mod, reply_to = null) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, true, true, false);
    this.overlay.class = 'saito-overlay saito-overlay-mobile-fullscreen';

    this.overlay_id = 'redsquare-compose-overlay';
    this.placeholder = 'What is happening?';
    this.helper_text = 'Create a text post or drag-and-drop images…';
    this.avatar = '/saito/img/dreamscape.png';
    this.display_name = 'You';
    this.char_limit = DEFAULT_CHAR_LIMIT;

    this.default_reply_to = reply_to;
    this.reply_to = reply_to;
    this.mode = 'post';
    this.images = [];
    this.posting = false;
    this.drag_drop_bound = false;
  }

  open(options = {}) {
    this.images = [];
    this.posting = false;
    this.drag_drop_bound = false;

    if (options.mode === 'retweet' || options.retweet_of) {
      this.mode = 'retweet';
      this.reply_to = options.retweet_of || options.reply_to || this.default_reply_to;
    } else if (options.reply_to || options.parentTweet) {
      this.mode = 'reply';
      this.reply_to = options.reply_to || options.parentTweet;
    } else {
      this.mode = 'post';
      this.reply_to = this.default_reply_to;
    }

    const profile = this.mod.profile || {};

    this.avatar = profile.avatar || '/saito/img/dreamscape.png';
    this.display_name = profile.name || 'You';

    if (this.mode === 'retweet') {
      this.placeholder = 'Add a comment…';
      this.helper_text = 'Add optional commentary or leave empty to retweet…';
    } else if (this.mode === 'reply') {
      this.placeholder = 'Post your reply…';
      this.helper_text = 'Add your reply or drag-and-drop images…';
    } else {
      this.placeholder = 'What is happening?';
      this.helper_text = 'Create a text post or drag-and-drop images…';
    }

    this.overlay.show(ComposeTemplate(this));
    this.attachEvents();

    setTimeout(() => {
      const input = this.getRoot()?.querySelector('.input');

      if (input) {
        input.focus();
      }
    }, 50);
  }

  close() {
    this.overlay.close();
    this.images = [];
    this.reply_to = this.default_reply_to;
    this.mode = 'post';
    this.posting = false;
  }

  getRoot() {
    return document.querySelector('.saito-overlay .compose');
  }

  attachEvents() {
    const root = this.getRoot();

    if (!root) {
      return;
    }

    const input = root.querySelector('.input');
    const submitBtn = root.querySelector('.submit');
    const emojiBtn = root.querySelector('.tool.emoji');
    const imageBtn = root.querySelector('.tool.image');
    const gifBtn = root.querySelector('.tool.gif');
    const fileInput = root.querySelector('.file-input');
    const gifPlaceholder = root.querySelector('.gif-placeholder');
    const gifDismiss = root.querySelector('.gif-dismiss');

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

    if (emojiBtn) {
      emojiBtn.addEventListener('click', (e) => {
        e.preventDefault();

        if (!this.posting) {
          siteMessage('Emoji picker is coming soon.', 1500);
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

    root.classList.toggle('posting', active);

    const screen = root.querySelector('.posting-screen');

    if (screen) {
      screen.setAttribute('aria-hidden', active ? 'false' : 'true');
    }

    root.querySelectorAll('button, textarea, input').forEach((el) => {
      if (el.classList.contains('file-input')) {
        return;
      }

      el.disabled = active;
    });
  }

  getText() {
    const input = this.getRoot()?.querySelector('.input');
    return input ? input.value : '';
  }

  updateCharacterCount() {
    const root = this.getRoot();

    if (!root) {
      return;
    }

    const current = root.querySelector('.char-count .current');
    const countWrap = root.querySelector('.char-count');
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
    const container = this.getRoot()?.querySelector('.image-preview');

    if (!container || !src) {
      return;
    }

    const index = this.images.length;
    const html = `
      <figure class="image-item" data-index="${index}">
        <img src="${src}" alt="" />
        <div class="image-remove" role="button" tabindex="0" title="Remove image" aria-label="Remove image">
          <i class="fa-solid fa-xmark"></i>
        </div>
      </figure>
    `;

    this.app.browser.addElementToSelector(html, `.saito-overlay #redsquare-compose-surface .image-preview`);
    this.images.push(src);

    const item = container.querySelector(`.image-item[data-index="${index}"]`);
    const removeBtn = item?.querySelector('.image-remove');

    if (removeBtn) {
      const removeImage = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.removeImageAt(index);
      };

      removeBtn.addEventListener('click', removeImage);
      removeBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          removeImage(e);
        }
      });
    }
  }

  removeImageAt(index) {
    this.images.splice(index, 1);

    const container = this.getRoot()?.querySelector('.image-preview');

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

    if (this.mode === 'reply' && this.reply_to) {
      data.parent_id = this.reply_to.signature || '';
      data.thread_id = this.reply_to.thread_id || this.reply_to.signature || '';
    }

    return data;
  }

  buildRetweetData() {
    const text = this.getText().trim();
    const data = {
      signature: this.reply_to?.signature || ''
    };

    if (text) {
      data.text = text;
    }

    if (this.images.length > 0) {
      data.images = this.images.slice();
    }

    return data;
  }

  collectRecipientKeys() {
    const keys = [];

    if (this.reply_to?.publicKey && !keys.includes(this.reply_to.publicKey)) {
      keys.push(this.reply_to.publicKey);
    }

    if (this.reply_to?.tx?.to) {
      for (const slip of this.reply_to.tx.to) {
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
    const isRetweet = this.mode === 'retweet';

    if (!isRetweet && this.images.length === 0 && text.length === 0) {
      siteMessage('Post Empty', 1000);
      return;
    }

    if (isRetweet && !this.reply_to?.signature) {
      siteMessage('Unable to retweet', 2500);
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
      const keys = this.collectRecipientKeys();

      if (isRetweet) {
        const data = this.buildRetweetData();

        const [, tx] = await Promise.all([
          minimumAnimation,
          (async () => {
            const unsigned = await this.mod.createRetweetTransaction(data, keys);
            await unsigned.sign();
            await this.app.network.propagateTransaction(unsigned);
            return unsigned;
          })()
        ]);

        await this.mod.receiveRetweetTransaction(tx);

        if (!this.mod.browser_active) {
          siteMessage('Retweet sent', 1000);
        }

        this.close();
        return;
      }

      const data = this.buildPostData();

      const [, tx] = await Promise.all([
        minimumAnimation,
        (async () => {
          const unsigned = await this.mod.createTweetTransaction(data, keys);
          await unsigned.sign();
          await this.app.network.propagateTransaction(unsigned);
          return unsigned;
        })()
      ]);

      const tweet = await this.mod.receiveTweetTransaction(tx);

      if (tweet) {
        this.mod.manager?.onTweetPosted(tweet);
      }

      if (!this.mod.browser_active) {
        siteMessage('Tweet sent', 1000);
      }

      this.close();
    } catch (err) {
      console.error('RedSquare compose submit failed:', err);
      siteMessage(isRetweet ? 'Unable to retweet' : 'Unable to post tweet', 2500);
      this.setPostingState(false);
      this.posting = false;
    }
  }
}

module.exports = ComposeOverlay;
