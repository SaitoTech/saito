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
    // Pre-publish mode: Delete draft button
    const deleteDraftBtn = document.querySelector('#stack-publish-delete-draft-btn');
    if (deleteDraftBtn) {
      deleteDraftBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleDeleteDraft();
      });
    }

    // Pre-publish mode: Close button
    const closeBtn = document.querySelector('#stack-publish-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.overlay.hide();
      });
    }

    // Close overlay (general close button)
    const overlayCloseBtn = document.querySelector('.saito-overlay-close');
    if (overlayCloseBtn) {
      overlayCloseBtn.addEventListener('click', () => {
        this.overlay.hide();
      });
    }

    // Post-publish mode: Access level selection
    const accessButtons = document.querySelectorAll('.stack-publish-access-btn');
    accessButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const level = btn.getAttribute('data-access');
        this.setAccessLevel(level);
      });
    });

    // Description input
    const descriptionInput = document.querySelector('#stack-publish-description');
    if (descriptionInput) {
      descriptionInput.addEventListener('input', (e) => {
        this.postState.description = e.target.value;
      });
    }

    // Title image upload
    const imageInput = document.querySelector('#stack-publish-image-input');
    if (imageInput) {
      imageInput.addEventListener('change', (e) => {
        this.handleImageUpload(e);
      });
    }

    const imageUploadBtn = document.querySelector('#stack-publish-image-upload-btn');
    if (imageUploadBtn) {
      imageUploadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        imageInput?.click();
      });
    }

    // Advanced section toggle
    const advancedToggle = document.querySelector('#stack-publish-advanced-toggle');
    if (advancedToggle) {
      advancedToggle.addEventListener('click', (e) => {
        e.preventDefault();
        const section = document.querySelector('.stack-publish-advanced-section');
        if (section) {
          section.classList.toggle('stack-publish-advanced-open');
        }
      });
    }

    // Custom CSS input
    const customCSSInput = document.querySelector('#stack-publish-custom-css');
    if (customCSSInput) {
      customCSSInput.addEventListener('input', (e) => {
        this.postState.customCSS = e.target.value;
      });
    }

    // Unpublish button
    const unpublishBtn = document.querySelector('#stack-publish-unpublish-btn');
    if (unpublishBtn) {
      unpublishBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleUnpublish();
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

    // View Preview link (post-publish mode only)
    const previewLink = document.querySelector('#stack-publish-preview-link');
    if (previewLink) {
      previewLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleViewPreview();
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
    this.postState.accessLevel = level;
    
    // Update button states
    const accessButtons = document.querySelectorAll('.stack-publish-access-btn');
    accessButtons.forEach(btn => {
      if (btn.getAttribute('data-access') === level) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Show/hide custom section
    const customSection = document.querySelector('.stack-publish-custom-section');
    if (level === 'custom') {
      if (customSection) customSection.style.display = 'block';
    } else {
      if (customSection) customSection.style.display = 'none';
    }
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

