const Splash = require('./splash');
const How = require('./how');
const Prepare = require('./prepare');

class Main {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.screen = 'splash';
    this.splash = new Splash(app, mod, this);
    this.how = new How(app, mod, this);
    this.prepare = new Prepare(app, mod);
  }

  render() {
    if (this.mod.document) {
      this.screen = 'prepare';
    }

    if (this.screen === 'how') {
      this.how.render();
      return;
    }

    if (this.screen === 'prepare' && this.mod.document) {
      this.prepare.render();
      return;
    }

    this.screen = 'splash';
    this.splash.render();
  }

  showSplash() {
    this.screen = 'splash';
    this.splash.render();
  }

  showHow() {
    this.screen = 'how';
    this.how.render();
  }

  showPrepare() {
    this.screen = 'prepare';
    this.splash.notice = '';
    this.prepare.show();
  }

  fail(message) {
    if (this.mod.document && this.screen === 'prepare') {
      this.prepare.notice = message;
      this.prepare.render();
      return;
    }

    this.screen = 'splash';
    this.splash.notice = message;
    this.splash.render();
  }
}

module.exports = Main;
