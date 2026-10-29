const Splash = require('./splash');
const Faq = require('./faq');
const Workspace = require('./workspace');
const { hasPdf } = require('../document');

class Main {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.screen = 'splash';
    this.splash = new Splash(app, mod, this);
    this.faq = new Faq(app, mod, this);
    this.workspace = new Workspace(app, mod);
  }

  render() {
    if (hasPdf(this.mod.document)) {
      this.screen = 'workspace';
    }

    if (this.screen === 'faq') {
      this.faq.render();
      return;
    }

    if (this.screen === 'workspace' && hasPdf(this.mod.document)) {
      this.workspace.render();
      return;
    }

    this.screen = 'splash';
    this.splash.render();
  }

  showSplash() {
    this.screen = 'splash';
    this.splash.render();
  }

  showFaq() {
    this.screen = 'faq';
    this.faq.render();
  }

  showWorkspace() {
    this.screen = 'workspace';
    this.splash.notice = '';
    this.splash.clearStaged();
    this.workspace.show();
  }

  fail(message) {
    if (hasPdf(this.mod.document) && this.screen === 'workspace') {
      this.workspace.notice = message;
      this.workspace.render();
      return;
    }

    this.screen = 'splash';
    this.splash.notice = message;
    this.splash.render();
  }
}

module.exports = Main;
