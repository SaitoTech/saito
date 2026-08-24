const SaveGamesTemplate = require('./save-games.template');
const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class SaveGamesOverlay {
  constructor(app, mod = null, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.overlay = new SaitoOverlay(this.app, this.mod);
  }

  formatElapsed(time_played) {
    let res = this.app.browser.formatTime(time_played) || {};
    let hours = res.hours || 0;
    let minutes = res.minutes || 0;
    let seconds = res.seconds || 0;

    let hours_full = '';
    let minutes_full = '00:';
    let seconds_full = '00';

    if (hours != 0) {
      hours_full = (hours < 10 ? '0' : '') + hours.toString() + ':';
    }
    if (minutes != 0) {
      minutes_full = (minutes < 10 ? '0' : '') + minutes.toString() + ':';
    }
    if (seconds != 0) {
      seconds_full = (seconds < 10 ? '0' : '') + seconds.toString();
    }

    return hours_full + minutes_full + seconds_full;
  }

  async render() {
    let app = this.app;
    let mod = this.mod;

    await this.reloadSaves();

    this.overlay.show(SaveGamesTemplate(app, mod));
    let container = document.getElementById('nwasm-saved-games');
    if (!container) {
      return;
    }

    container.innerHTML = '';

    if (!mod.active_game_saves.length) {
      container.innerHTML = `<div class="empty">No saved games yet.</div>`;
      return;
    }

    for (let i = 0; i < mod.active_game_saves.length; i++) {
      let s = mod.active_game_saves[i];
      let stxmsg = s.returnMessage();
      let time_elapsed = this.formatElapsed(stxmsg.time_played);
      let screenshot = stxmsg.screenshot || '';

      let html = `
        <button type="button" id="save_game_${i}" data-id="${s.signature}" class="item">
          <div class="shot">
            ${screenshot ? `<img src="${screenshot}" alt="Save ${i + 1}" />` : `<div class="placeholder"></div>`}
            <div class="time">${time_elapsed}</div>
          </div>
        </button>
      `;
      app.browser.addElementToId(html, 'nwasm-saved-games');
    }

    this.attachEvents();
  }

  async reloadSaves() {
    if (!this.mod.active_rom_sig) {
      return;
    }

    let sgo_self = this;
    this.mod.active_game_saves = [];

    return new Promise((resolve) => {
      this.app.storage.loadTransactions(
        { field1: 'Nwasm' + this.mod.active_rom_sig, limit: 10 },
        (txs) => {
          try {
            for (let z = 0; z < txs.length; z++) {
              sgo_self.mod.active_game_saves.push(txs[z]);
            }
          } catch (err) {
            console.log('error reloading Nwasm saves...: ' + err);
          }
          resolve();
        },
        'localhost'
      );
    });
  }

  attachEvents() {
    let mod = this.mod;
    let sgo = this;

    for (let i = 0; i < mod.active_game_saves.length; i++) {
      let obj = document.getElementById(`save_game_${i}`);
      if (obj) {
        obj.onclick = (e) => {
          let sig = e.currentTarget.getAttribute('data-id');
          sgo.overlay.hide();
          mod.loadSaveGame(sig);
        };
      }
    }
  }
}

module.exports = SaveGamesOverlay;
