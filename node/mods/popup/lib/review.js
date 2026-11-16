const ReviewTemplate = require('./review.template');
const ReviewSession = require('./review-session');
const SaitoOverlay = require('./../../../lib/saito/ui/saito-overlay/saito-overlay');

class ReviewOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.visible = false;
    this.overlay = new SaitoOverlay(app, mod);
    this.session = null;
  }

  hide() {
    this.visible = false;
    if (this.session) {
      this.session.cancel();
    }
    this.overlay.hide();
  }

  async render() {
    this.visible = true;
    if (this.session) {
      this.session.cancel();
    }
    this.overlay.show(ReviewTemplate(), () => {
      if (this.session) {
        this.session.cancel();
      }
    });
    const root = document.querySelector('.review-overlay');
    if (!root) {
      return;
    }
    this.session = new ReviewSession(this.app, this.mod);
    await this.session.start({
      progress: root.querySelector('.review-progress'),
      prompt: root.querySelector('.review-prompt'),
      answers: root.querySelector('.review-answers'),
      feedback: root.querySelector('.review-feedback')
    });
  }
}

module.exports = ReviewOverlay;
