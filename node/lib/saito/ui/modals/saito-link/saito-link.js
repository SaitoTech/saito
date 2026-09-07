const InvitationLinkTemplate = require('./saito-link.template');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');

class InvitationLink {
  constructor(app, mod, data = {}) {
    this.app = app;
    this.mod = mod;
    this.data = data;
    this.overlay = new SaitoOverlay(app, mod);
    this.invite_link = '';
    this.shortlink_promise = null;

    this.share_to_chat = true;
    this.share_to_redsquare = true;
    this.share_to_qr = true;
  }

  render(display = true) {
    this.buildLink();
    this.prepareShortLink();
    if (display) {
      this.overlay.show(InvitationLinkTemplate(this.app, this));
      this.attachEvents();
    } else {
      this.copyInviteLink();
    }
  }

  prepareShortLink() {
    if (!this.mod?.shortlinks_enabled || typeof this.mod.createShortLink !== 'function') {
      this.shortlink_promise = null;
      return;
    }

    const longLink = this.invite_link;
    this.shortlink_promise = this.mod
      .createShortLink(longLink)
      .then((link) => {
        this.invite_link = link || longLink;
        return this.invite_link;
      })
      .catch((err) => {
        console.error('Invite shortlink creation failed:', err);
        this.invite_link = longLink;
        return longLink;
      });
  }

  async returnInviteLink() {
    if (this.shortlink_promise) {
      await this.shortlink_promise;
    }
    return this.invite_link;
  }

  async copyInviteLink() {
    const link = await this.returnInviteLink();
    await navigator.clipboard.writeText(link);
    const game = this.data.name || this.data.game;
    siteMessage(`${game} invite link copied to clipboard`, 2500);
  }

  attachEvents() {
    try {
      document.querySelector('#copy-invite-link').addEventListener('click', async (e) => {
        await this.copyInviteLink();
        this.overlay.remove();
      });
    } catch (err) {
      console.error(err);
    }

    if (document.getElementById('chat-invite-link')) {
      document.getElementById('chat-invite-link').onclick = async (e) => {
        const link = await this.returnInviteLink();
        this.app.connection.emit('chat-message-user', 'community', link);
        this.app.connection.emit('open-chat-with');
        this.overlay.remove();
      };
    }

    if (document.getElementById('tweet-invite-link')) {
      document.getElementById('tweet-invite-link').onclick = async (e) => {
        const link = await this.returnInviteLink();
        await navigator.clipboard.writeText(link);
        this.overlay.remove();
        this.app.connection.emit('redsquare-new-post', link);
      };
    }

    if (document.getElementById('qr-invite-link')) {
      document.getElementById('qr-invite-link').onclick = async (e) => {
        const link = await this.returnInviteLink();
        this.overlay.remove();
        let qr_overlay = new SaitoOverlay(this.app, this.mod);
        let html = `<div class="qr-share-overlay">
				<div class="qr-share-header">Scan for ${this.data.name || this.data.game}</div>
				<div id="qr-share-link"></div></div>`;
        qr_overlay.show(html);
        let data = {
          text: link
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
