const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const PublishSettingsTemplate = require('./publish-settings.template');

class PublishSettingsOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.postState = {
      published: false,
      accessLevel: 'public', // 'public', 'nft', 'custom'
      description: '',
      image: null,
      imageUrl: null,
      customCSS: ''
    };
  }

  render(postData = {}) {
    // Merge provided post data with current state
    this.postState = {
      ...this.postState,
      ...postData
    };

    const html = PublishSettingsTemplate(this.app, this.mod, this.postState);
    this.overlay.show(html);
    
    setTimeout(() => {
      this.attachEvents();
    }, 25);
  }

  attachEvents() {
    // Close overlay (click outside or close button)
    const overlayCloseBtn = document.querySelector('.saito-overlay-close');
    if (overlayCloseBtn) {
      overlayCloseBtn.addEventListener('click', () => {
        this.overlay.hide();
      });
    }

    // Access level radio buttons
    const accessRadios = document.querySelectorAll('.stack-publish-access-radio');
    accessRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        const level = e.target.value;
        // Map 'subscribers' to 'nft' for backward compatibility
        const mappedLevel = level === 'subscribers' ? 'nft' : level;
        this.setAccessLevel(mappedLevel);
      });
    });

    // Delete draft button
    const deleteDraftBtn = document.querySelector('#stack-publish-delete-draft-btn');
    if (deleteDraftBtn) {
      deleteDraftBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleDeleteDraft();
      });
    }

    // Primary action button (Publish/Update)
    const primaryBtn = document.querySelector('#stack-publish-primary-btn');
    if (primaryBtn) {
      primaryBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handlePublish();
      });
    }
  }

  handleDeleteDraft() {
    if (confirm('Are you sure you want to delete this draft? This action cannot be undone.')) {
      // Clear the draft from localStorage
      try {
        localStorage.removeItem('stack-post-draft');
      } catch (err) {
        console.error('Error deleting draft:', err);
      }

      // Clear the editor
      if (this.mod.create_post_ui) {
        this.mod.create_post_ui.document = { blocks: [{ type: 'paragraph', id: require('../../post-document').generateBlockId(0), text: '' }] };
        this.mod.create_post_ui.renderDocument();
        this.mod.create_post_ui.updatePlaceholderVisibility();
        this.mod.create_post_ui.updatePublishTriggerVisibility();
      }

      // Clear title
      const titleInput = document.querySelector('#stack-post-title-input');
      if (titleInput) {
        titleInput.value = '';
      }

      this.overlay.hide();
      siteMessage('Draft deleted', 1500);
    }
  }

  setAccessLevel(level) {
    // Map 'subscribers' to 'nft' for internal storage (backward compatibility)
    const internalLevel = level === 'subscribers' ? 'nft' : level;
    this.postState.accessLevel = internalLevel;
    
    // Update radio button states
    const accessRadios = document.querySelectorAll('.stack-publish-access-radio');
    accessRadios.forEach(radio => {
      const radioValue = radio.value;
      // Map 'nft' to 'subscribers' for display
      const displayValue = internalLevel === 'nft' ? 'subscribers' : internalLevel;
      if (radioValue === displayValue) {
        radio.checked = true;
      } else {
        radio.checked = false;
      }
    });
  }

  async handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith('image/')) return;

    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      let imageDataUrl = dataUrl;
      if (this.app.browser && this.app.browser.resizeImg) {
        try {
          imageDataUrl = await this.app.browser.resizeImg(dataUrl);
        } catch (err) {
          console.warn('Image resize failed, using original:', err);
        }
      }

      this.postState.image = imageDataUrl.split(',')[1]; // Base64 data
      this.postState.imageUrl = null;

      // Update preview
      const previewImg = document.querySelector('#stack-publish-image-preview');
      if (previewImg) {
        previewImg.src = imageDataUrl;
        previewImg.style.display = 'block';
      }
    } catch (err) {
      console.error('Error uploading image:', err);
    }
  }

  handleUnpublish() {
    if (confirm('Are you sure you want to unpublish this post?')) {
      this.postState.published = false;
      this.overlay.hide();
      // Update publish trigger state
      if (this.mod.create_post_ui) {
        this.mod.create_post_ui.isPublished = false;
        this.mod.create_post_ui.updatePublishTriggerState();
      }
      siteMessage('Post unpublished', 1500);
    }
  }

  async handlePublish() {
    const title = document.querySelector('#stack-post-title-input')?.value || '';
    const editor = document.querySelector('#stack-post-body-editor');
    const { serializeDocumentToMarkdown } = require('../../post-document');
    const content = editor ? serializeDocumentToMarkdown(this.mod.create_post_ui.document) : '';

    if (!title.trim()) {
      alert('Please enter a title for your post');
      return;
    }

    if (!content.trim()) {
      alert('Please enter content for your post');
      return;
    }

    try {
      this.app.connection.emit('saito-header-update-message', { msg: 'Publishing post...' });
      
      await this.mod.createStackPostTransaction({
        title,
        content,
        image: this.postState.image,
        imageUrl: this.postState.imageUrl,
        tags: [],
        timestamp: Date.now(),
        subscriptionTier: this.postState.accessLevel === 'public' ? 'free' : 'paid',
        excerpt: this.postState.description || content.substring(0, 200).replace(/\n/g, ' ').trim()
      }, () => {
        this.postState.published = true;
        this.app.connection.emit('saito-header-update-message', { msg: '' });
        siteMessage('Stack post published', 1500);
        this.overlay.hide();
        
        // Update publish trigger state
        if (this.mod.create_post_ui) {
          this.mod.create_post_ui.isPublished = true;
          this.mod.create_post_ui.updatePublishTriggerState();
        }

        // Post will be saved to app.options.stack.posts in receiveStackPostTransaction
      });
    } catch (error) {
      console.error('Error publishing post:', error);
      this.app.connection.emit('saito-header-update-message', {
        msg: 'Error publishing post',
        timeout: 2000
      });
      alert('Failed to publish post. Please try again.');
    }
  }

  handleViewPreview() {
    // Close this overlay and open preview overlay
    this.overlay.hide();
    if (this.mod.previewOverlay) {
      this.mod.previewOverlay.render();
    }
  }
}

module.exports = PublishSettingsOverlay;

