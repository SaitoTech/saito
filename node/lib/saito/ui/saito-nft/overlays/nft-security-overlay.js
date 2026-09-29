const NFTSecurityOverlayTemplate = require('./nft-security-overlay.template');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');

class NFTSecurityOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    if (app?.browser?.addStylesheet) {
      app.browser.addStylesheet('/saito/css-imports/ui/saito-nft.css');
    }
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.level = 'low';
    this.onConfirm = null;
  }

  render(level = 'low', onConfirm = null, nft = null) {
    this.level = level === 'high' ? 'high' : 'low';
    this.onConfirm = typeof onConfirm === 'function' ? onConfirm : null;

    let publisher = '';
    let raw = nft?.saito || nft?.tx?.returnMessage()?.data?.saito;
    if (typeof raw === 'string' && raw.indexOf('data:') === 0 && raw.indexOf('base64,') >= 0) {
      const payload =
        raw.indexOf('data:application/octet-stream;base64,') >= 0
          ? raw
          : raw.substring(raw.indexOf('base64,') + 7);
      raw = this.app.crypto.base64ToString(payload);
    }
    let web = raw;
    if (typeof raw === 'string' && raw) {
      try {
        web = JSON.parse(raw);
      } catch (err) {
        web = null;
      }
    }
    if (web && typeof web === 'object') {
      publisher = web.publisher || '';
      if (!publisher && web.m && this.app?.crypto?.base64ToString) {
        try {
          const msg = JSON.parse(this.app.crypto.base64ToString(web.m));
          publisher = msg.publisher || '';
        } catch (err) {}
      }
    }

    this.overlay.show(NFTSecurityOverlayTemplate(publisher));
    this.attachEvents();
  }

  attachEvents() {
    const ok = document.getElementById('nft-security-ok');
    const sure = document.getElementById('nft-security-sure');
    const optout = document.getElementById('nft-security-dont-show');

    if (ok) {
      ok.onclick = () => {
        this.overlay.close();
      };
    }

    if (sure) {
      sure.onclick = () => {
        if (optout && optout.checked) {
          if (!this.app.options.permissions) {
            this.app.options.permissions = {};
          }
          this.app.options.permissions.hide_nft_security_warning = true;
          this.app.storage.saveOptions();
        }
        this.overlay.close();
        if (this.onConfirm) {
          this.onConfirm();
        }
      };
    }
  }
}

module.exports = NFTSecurityOverlay;
