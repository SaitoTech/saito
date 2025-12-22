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
          this.mod.create_post_ui.render();
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
}

module.exports = StackMain;

