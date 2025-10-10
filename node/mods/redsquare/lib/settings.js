const SettingsTemplate = require('./settings.template');
const SaitoContacts = require('../../../lib/saito/ui/modals/saito-contacts/saito-contacts');

class RedSquareSettings {
  constructor(app, mod, container) {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.contacts = new SaitoContacts(app, mod, true);
  }

  render() {
    if (document.getElementById('redsquare-settings')) {
      this.app.browser.replaceElementById(
        SettingsTemplate(this.app, this.mod),
        'redsquare-settings'
      );
    } else {
      this.app.browser.addElementToSelector(SettingsTemplate(this.app, this.mod), this.container);
    }
    this.attachEvents();
  }

  attachEvents() {
    let settings_self = this;
    let modtools_self = this.app.modules.returnModuleBySlug('modtools');

    if (document.getElementById('blacklisted-accounts')) {
      if (modtools_self?.blacklisted_publickeys?.length) {
        document.getElementById('blacklisted-accounts').onclick = (e) => {
          this.contacts.title = 'Blacklisted Accounts';
          this.contacts.multi_button = 'Remove from Blacklist';
          this.contacts.callback = (keys) => {
            for (let key of keys) {
              this.app.connection.emit('saito-unblacklist', key);
            }
            this.render();
          };

          this.contacts.render(modtools_self.blacklisted_publickeys);
        };
      }
    }

    if (document.getElementById('whitelisted-accounts')) {
      if (modtools_self?.whitelisted_publickeys?.length) {
        document.getElementById('whitelisted-accounts').onclick = (e) => {
          this.contacts.title = 'Whitelisted Accounts';
          this.contacts.multi_button = 'Remove from Whitelist';
          this.contacts.callback = (keys) => {
            for (let key of keys) {
              this.app.connection.emit('saito-unwhitelist', key);
            }
            this.render();
          };
          this.contacts.render(modtools_self.whitelisted_publickeys);
        };
      }
    }

    if (document.getElementById('add-whitelist')) {
      document.getElementById('add-whitelist').onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.contacts.title = 'Saved Keys';
        this.contacts.multi_button = 'Add to Whitelist';
        this.contacts.callback = (keys) => {
          for (let key of keys) {
            this.app.connection.emit('saito-whitelist', { publicKey: key, duration: -1 });
          }
          this.render();
        };
        this.contacts.render();
      };
    }

    //
    // curated / unfiltered
    //
    let container = document.getElementById('curation-toggle');
    let options = container.querySelectorAll('#curation-toggle .toggle-option');
    let tc = document.querySelector('.tweet-container');

    options.forEach((option) => {
      option.addEventListener('click', () => {
        options.forEach((o) => o.classList.remove('active'));
        option.classList.add('active');
        if (option === options[1]) {
          container.classList.add('active-right');
          this.mod.curated = false;
          if (tc) {
            tc.classList.remove('active-curation');
          }
          this.mod.saveOptions();
        } else {
          container.classList.remove('active-right');
          this.mod.curated = true;
          if (tc) {
            tc.classList.add('active-curation');
          }
          this.mod.saveOptions();
        }
      });
    });
  }
}

module.exports = RedSquareSettings;
