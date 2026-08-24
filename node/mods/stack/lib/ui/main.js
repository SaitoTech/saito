const MainTemplate = require('./main.template');

class StackMain {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
  }

  render(container = '') {
    // ========================================================================
    // INVARIANT 4: Unmount before navigating to splash (navigation path: editor → splash)
    // ========================================================================
    if (this.mod.create_post_ui && typeof this.mod.create_post_ui.onEditorUnmount === 'function') {
      this.mod.create_post_ui.onEditorUnmount();
    }

    if (container !== '') {
      this.container = container;
    }

    if (!this.container || this.container.trim() === '') {
      this.container = '.saito-container';
    }

    const html = MainTemplate(this.app, this.mod);

    // ========================================================================
    // FIX: Use replaceElementContentBySelector to preserve .saito-container
    // ========================================================================
    // Ensure container is preserved when rendering splash to avoid conflicts
    // with editor ownership of .saito-container
    if (!document.querySelector('.splash')) {
      this.app.browser.addElementToSelector(html, this.container);
    } else {
      // Replace only the splash content, not the entire container
      this.app.browser.replaceElementContentBySelector(html, '.splash');
    }

    // Update container class
    const containerEl = document.querySelector(this.container);
    if (containerEl) {
      containerEl.classList.add('hide-scrollbar');
      containerEl.classList.add('stack-splash-container');
      containerEl.classList.remove('stack-create-post-container');
    }

    this.attachEvents();
  }

  attachEvents() {
    try {
      const createBtn = document.querySelector('#stack-create-post-btn');
      if (createBtn) {
        createBtn.onclick = (e) => {
          e.preventDefault();
          this.handleStartWriting();
        };
      }

      const getStartedBtn = document.querySelector('#stack-get-started-btn');
      if (getStartedBtn) {
        getStartedBtn.onclick = (e) => {
          e.preventDefault();
          // ========================================================================
          // INVARIANT 4: Unmount before navigating to explore (navigation path: splash → explore)
          // ========================================================================
          if (
            this.mod.create_post_ui &&
            typeof this.mod.create_post_ui.onEditorUnmount === 'function'
          ) {
            this.mod.create_post_ui.onEditorUnmount();
          }
          this.mod.exploreOverlay.render();
        };
      }

      const learnMoreBackBtn = document.querySelector('#stack-learn-more-back-btn');
      if (learnMoreBackBtn) {
        learnMoreBackBtn.onclick = (e) => {
          e.preventDefault();
          // Open Stack wiki page in new tab
          window.open('https://wiki.saito.io/en/applications/stack', '_blank');
        };
      }
    } catch (err) {
      console.error('StackMain attachEvents error:', err);
    }
  }

  /**
   * Handle "Start Writing" button click
   * Checks for existing drafts and shows draft chooser if drafts exist
   */
  async handleStartWriting() {
    // ========================================================================
    // INVARIANT 4: Unmount before navigating to editor (navigation path: splash → editor)
    // ========================================================================
    // Note: Editor render() will also unmount if already mounted, but we unmount here
    // to ensure clean state when coming from splash
    if (this.mod.create_post_ui && typeof this.mod.create_post_ui.onEditorUnmount === 'function') {
      this.mod.create_post_ui.onEditorUnmount();
    }

    // ========================================================================
    // DRAFT FLOW FIX: Check for drafts before deciding intent
    // ========================================================================
    // Ensure drafts are discovered before checking validity
    if (this.mod.discoverDrafts) {
      await this.mod.discoverDrafts();
    }

    // Check if valid drafts exist
    const hasValidDrafts = this.mod.hasValidDrafts && this.mod.hasValidDrafts();

    // Determine intent based on draft existence
    const intent = hasValidDrafts ? { mode: 'choose' } : { mode: 'new' };

    // Set pending intent before render() so it uses the correct intent
    if (this.mod.create_post_ui) {
      this.mod.create_post_ui.pendingIntent = intent;
    }

    // Render editor - it will use pendingIntent if set, otherwise defaults to 'new'
    this.mod.create_post_ui.render();
  }
}

module.exports = StackMain;
