const MainTemplate = require('./main.template');

class StackMain {
  constructor(app, mod, container = "") {
    this.app = app;
    this.mod = mod;
    this.container = container;
  }

  render(container = "") {
    if (container !== "") {
      this.container = container;
    }

    if (!this.container || this.container.trim() === "") {
      this.container = ".saito-container";
    }

    const html = MainTemplate(this.app, this.mod);

    // Replace content in container
    if (!document.querySelector(".stack-splash")) {
      this.app.browser.addElementToSelector(html, this.container);
    } else {
      this.app.browser.replaceElementBySelector(html, ".stack-splash");
    }

    // Update container class
    const containerEl = document.querySelector(this.container);
    if (containerEl) {
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
          this.mod.exploreOverlay.render();
        };
      }

      const learnMoreBackBtn = document.querySelector('#stack-learn-more-back-btn');
      if (learnMoreBackBtn) {
        learnMoreBackBtn.onclick = (e) => {
          e.preventDefault();
          // Will implement learn more functionality later
          console.log('Learn how Saito Stack works clicked');
        };
      }
    } catch (err) {
      console.error('StackMain attachEvents error:', err);
    }
  }

  /**
   * Handle "Start Writing" button click
   * Checks for existing posts/drafts and shows welcome overlay if needed
   */
  handleStartWriting() {
    // Check session flag to prevent immediate re-showing
    const overlayShown = sessionStorage.getItem('stack-welcome-overlay-shown');
    
    // Load stack state
    this.mod.load();
    const stackState = this.mod.app.options.stack || {};
    const posts = stackState.posts || [];
    
    // Check if we have posts and overlay hasn't been shown this session
    if (posts.length > 0 && !overlayShown) {
      // Render editor first (empty surface)
      this.mod.create_post_ui.render();
      
      // Check for active draft
      let hasDraft = false;
      try {
        const draft = localStorage.getItem('stack-post-draft');
        hasDraft = draft && draft.trim().length > 0;
      } catch (err) {
        // Ignore
      }
      
      // Show welcome overlay
      setTimeout(() => {
        if (!this.mod.welcomeBackOverlay) {
          const WelcomeBackOverlay = require('./overlay/welcome-back');
          this.mod.welcomeBackOverlay = new WelcomeBackOverlay(this.app, this.mod);
        }
        this.mod.welcomeBackOverlay.render(posts, hasDraft);
      }, 100);
    } else {
      // No posts or overlay already shown - proceed directly to editor
      this.mod.create_post_ui.render();
    }
  }
}

module.exports = StackMain;

