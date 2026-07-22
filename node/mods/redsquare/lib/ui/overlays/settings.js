const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const SaitoContacts = require('../../../../../lib/saito/ui/modals/saito-contacts/saito-contacts');
const SettingsTemplate = require('./settings.template');

class SettingsOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, true, true, false);
    this.contacts = new SaitoContacts(app, mod, true);
    this.overlay_id = 'redsquare-settings-overlay';
    this.container = '';
    this.onEscapeKeyDown = this.onEscapeKeyDown.bind(this);
  }

  open() {
    this.container = '';
    this.overlay.show(SettingsTemplate(this.app, this.mod), () => {
      document.removeEventListener('keydown', this.onEscapeKeyDown);
    });
    this.attachEvents();
  }

  close() {
    document.removeEventListener('keydown', this.onEscapeKeyDown);
    this.overlay.close();
  }

  renderInto(container = '') {
    const host = document.querySelector(container);

    if (!host) {
      return false;
    }

    document.removeEventListener('keydown', this.onEscapeKeyDown);
    this.container = container;
    this.app.browser.replaceElementContentBySelector(
      SettingsTemplate(this.app, this.mod),
      container
    );
    this.attachEvents();
    return true;
  }

  rerender() {
    if (this.container) {
      this.renderInto(this.container);
      return;
    }

    if (!this.getRoot()) {
      this.open();
      return;
    }

    this.overlay.show(SettingsTemplate(this.app, this.mod), () => {
      document.removeEventListener('keydown', this.onEscapeKeyDown);
    });
    this.attachEvents();
  }

  getRoot() {
    if (this.container) {
      const host = document.querySelector(this.container);

      if (!host || host.hidden) {
        return null;
      }

      return host.querySelector('.settings');
    }

    return document.querySelector('.saito-overlay .settings');
  }

  getModtools() {
    return this.app.modules.returnModuleBySlug('modtools');
  }

  attachEvents() {
    const root = this.getRoot();

    if (!root) {
      return;
    }

    if (!this.container) {
      document.addEventListener('keydown', this.onEscapeKeyDown);
    }

    this.attachCurationToggle(root);
    this.attachWhitelistEvents(root);
    this.attachBlacklistEvents(root);
  }

  attachCurationToggle(root) {
    const container = root.querySelector('#curation-toggle');

    if (!container) {
      return;
    }

    const options = container.querySelectorAll('input[name="redsquare-feed-curation"]');

    options.forEach((option) => {
      option.addEventListener('change', () => {
        if (!option.checked) {
          return;
        }

        const curated = option.value === 'curated';

        this.mod.curated = curated;
        this.mod.saveOptions();

        const scroller = document.querySelector('#saito-container');

        if (scroller) {
          scroller.classList.toggle('active-curation', curated);
        }
      });
    });
  }

  attachWhitelistEvents(root) {
    const whitelistBtn = root.querySelector('#whitelisted-accounts');
    const addWhitelistBtn = root.querySelector('#add-whitelist');
    const modtools = this.getModtools();

    if (whitelistBtn) {
      whitelistBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        this.contacts.title = 'Whitelisted Accounts';
        this.contacts.multi_button = 'Remove from Whitelist';
        this.contacts.callback = (keys) => {
          for (const key of keys) {
            this.app.connection.emit('saito-unwhitelist', key);
          }
          this.rerender();
        };

        this.contacts.render(modtools?.whitelisted_publickeys || []);
      });
    }

    if (addWhitelistBtn) {
      addWhitelistBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        this.contacts.title = 'Saved Keys';
        this.contacts.multi_button = 'Add to Whitelist';
        this.contacts.callback = (keys) => {
          for (const key of keys) {
            this.app.connection.emit('saito-whitelist', { publicKey: key, duration: -1 });
          }
          this.rerender();
        };

        this.contacts.render();
      });
    }
  }

  attachBlacklistEvents(root) {
    const blacklistBtn = root.querySelector('#blacklisted-accounts');
    const modtools = this.getModtools();

    if (!blacklistBtn) {
      return;
    }

    blacklistBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      this.contacts.title = 'Blacklisted Accounts';
      this.contacts.multi_button = 'Remove from Blacklist';
      this.contacts.callback = (keys) => {
        for (const key of keys) {
          this.app.connection.emit('saito-unblacklist', key);
        }
        this.rerender();
      };

      this.contacts.render(modtools?.blacklisted_publickeys || []);
    });
  }

  onEscapeKeyDown(e) {
    if (e.key !== 'Escape' || !this.getRoot()) {
      return;
    }

    e.preventDefault();
    this.close();
  }
}

module.exports = SettingsOverlay;
