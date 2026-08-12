const Invite = require('./invite');
const InviteManagerTemplate = require('./invites.template');

class InviteManager {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.name = 'InviteManager';
    this.type = 'short';

    this.list = 'all';
    this.lists = ['mine', 'open', 'active'];

    if (mod?.sudo) {
      this.lists = ['mine', 'open', 'active', 'private', 'close', 'over'];
    }

    this.game_filter = null;
  }

  render() {
    let target = this.container + ' .arcade-invites';
    if (!document.querySelector(target)) {
      target = this.container + ' .invites';
    }

    if (document.querySelector(target)) {
      this.app.browser.replaceElementBySelector(InviteManagerTemplate(this.app, this.mod), target);
    } else {
      this.app.browser.addElementToSelector(
        InviteManagerTemplate(this.app, this.mod),
        this.container
      );
      target = this.container + ' .arcade-invites';
    }

    for (let list of this.lists) {
      if (this.list !== 'all' && this.list !== list) {
        continue;
      }

      let listGames = [];
      if (typeof this.mod.returnGamesWithFilter === 'function') {
        listGames = this.mod.returnGamesWithFilter({ status: list }).map((r) => r.tx);
      }

      if (listGames.length > 0 && !this.game_filter) {
        let label = 'Games';
        if (list === 'mine') label = 'My Games';
        else if (list === 'open') label = 'Open Invites';
        else if (list === 'active') label = 'Active Matches';
        else if (list === 'over') label = 'Recent Matches';
        else label = `${list.charAt(0).toUpperCase() + list.slice(1)} Games`;

        this.app.browser.addElementToSelector(
          `<h5 class="saito-sidebar-header">${label}</h5>`,
          target
        );
      }

      for (let i = 0; i < listGames.length && i < 15; i++) {
        if (this.game_filter && this.game_filter != listGames[i].msg.game) {
          continue;
        }
        if (list == 'active' && !listGames[i].msg.options?.['open-table'] && !this.mod.sudo) {
          continue;
        }

        let newInvite = new Invite(
          this.app,
          this.mod,
          target,
          this.type,
          listGames[i],
          this.mod.publicKey
        );

        if (this.app.modules.returnModuleByName(newInvite.invite_data.game_name)) {
          if (newInvite.invite_data.league) {
            if (!this.mod.leagueCallback?.testMembership(newInvite.invite_data.league)) {
              continue;
            }
          }
          newInvite.render();
        }
      }
    }

    if (typeof this.mod.purge === 'function') {
      this.mod.purge();
    }
  }
}

module.exports = InviteManager;
