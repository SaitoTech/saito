const InvitationLinkTemplate = require('./saito-link.template');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');

class InvitationLink {
  constructor(app, mod, data = {}) {
    this.app = app;
    this.mod = mod;
    this.data = data;
    this.overlay = new SaitoOverlay(app, mod);
    this.invite_link = '';

    this.share_to_chat = true;
    this.share_to_redsquare = true;
    this.share_to_qr = true;
    this.share_to_device = typeof navigator !== 'undefined' && !!navigator.share;

    //
    // invite links are transitory, so we request a short /l/{slug}/{id}
    // alias from a shortlink-service peer. ttl is in seconds; modules with
    // shorter-lived invites (calls, file offers) can override before render.
    // set shorten = false to opt out entirely.
    //
    this.shorten = true;
    this.ttl = 60 * 60 * 24 * 7;
    this.shorten_label = true;
  }

  render(display = true) {
    this.buildLink();
    this.shortenInBackground();
    if (display) {
      this.overlay.show(InvitationLinkTemplate(this.app, this));
      this.attachEvents();
    } else {
      let game = this.data.name || this.data.game || 'Saito';
      this.app.browser.handleShare({ title: `${game} invite`, url: this.invite_link });
    }
  }

  //
  // fired at render so the overlay appears instantly with the long link;
  // when the short link lands we swap it in. share/copy handlers read
  // this.invite_link at click time (never awaiting the network inside the
  // user gesture), so they pick up whichever form is current.
  //
  shortenInBackground() {
    if (!this.shorten) {
      return;
    }
    let game = this.data.name || this.data.game || 'Saito';
    let label = this.shorten_label ? this.data.name || this.data.game || '' : '';
    this.app.browser
      .shortenLink(this.invite_link, { ttl: this.ttl, label, title: `${game} invite` })
      .then((short_url) => {
        if (short_url) {
          this.invite_link = short_url;
        }
      })
      .catch(() => {});
  }

  attachEvents() {
    try {
      document.querySelector('#copy-invite-link').addEventListener('click', (e) => {
        navigator.clipboard.writeText(this.invite_link);
        this.overlay.remove();
      });
    } catch (err) {
      console.error(err);
    }

    if (document.getElementById('device-share-link')) {
      document.getElementById('device-share-link').onclick = (e) => {
        this.overlay.remove();
        let game = this.data.name || this.data.game || 'Saito';
        this.app.browser.handleShare({ title: `${game} invite`, url: this.invite_link });
      };
    }

    if (document.getElementById('chat-invite-link')) {
      document.getElementById('chat-invite-link').onclick = (e) => {
        this.app.connection.emit('chat-message-user', 'community', this.invite_link);
        this.app.connection.emit('open-chat-with');
        this.overlay.remove();
      };
    }

    if (document.getElementById('tweet-invite-link')) {
      document.getElementById('tweet-invite-link').onclick = (e) => {
        navigator.clipboard.writeText(this.invite_link);
        this.overlay.remove();
        this.app.connection.emit('redsquare-new-post', this.invite_link);
      };
    }

    if (document.getElementById('qr-invite-link')) {
      document.getElementById('qr-invite-link').onclick = (e) => {
        this.overlay.remove();
        let qr_overlay = new SaitoOverlay(this.app, this.mod);
        let html = `<div class="qr-share-overlay">
				<div class="qr-share-header">Scan for ${this.data.name || this.data.game}</div>
				<div id="qr-share-link"></div></div>`;
        qr_overlay.show(html);
        let data = {
          text: this.invite_link
        };
        this.app.browser.generateQRCode(data, 'qr-share-link');
      };
    }
  }

  buildLink() {
    this.invite_link = window.location.origin;
    let path = this.data?.path || window.location.pathname;

    this.invite_link += path;

    //Make sure we have the final /
    if (this.invite_link.slice(-1) != '/') {
      this.invite_link += '/';
    }

    for (let key in this.data) {
      if (key !== 'path' && key !== 'name') {
        const val = this.data[key];
        this.invite_link += '&' + key + '=' + encodeURIComponent(val != null ? val : '');
      }
    }

    this.invite_link = this.invite_link.replace('/&', '/?');

    console.log(this.invite_link);
  }
}

module.exports = InvitationLink;
