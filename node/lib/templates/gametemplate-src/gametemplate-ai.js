/*********************************************************************************
 GAME AI

 Sandbox entry points for NFT scripts and headless readers. returnApi() is the
 callable surface. returnContext() is the read-only snapshot.
 **********************************************************************************/
const JSON = require('json-bigint');
const ModTemplate = require('../modtemplate');

// Extends ModTemplate so super.returnApi() and super.returnContext() still
// resolve after these methods are copied onto GameTemplate.
class GameAI extends ModTemplate {
  /**
   * General sandbox API. Games spread super.returnApi() and add module methods.
   * Queue / move insertion lives in returnApiQueue().
   */
  returnApi() {
    const api = super.returnApi();
    const self = this;
    return {
      ...api,
      rollDice: function (sides = 6, mycallback = null) {
        return self.rollDice(sides, mycallback);
      }
    };
  }

  /**
   * Read-only NFT / script context. Every game module inherits a deep snapshot
   * of `this.game` under `context.game`. Modules extend via super.returnContext()
   * and add only module-specific fields (never replace `game`).
   */
  returnContext() {
    const ctx = super.returnContext();
    let game = {};

    // JSON clone: plain data only, no live references, functions, or host objects.
    // serializeTransferable later rejects non-JSON types; this also drops `undefined`.
    try {
      game = JSON.parse(JSON.stringify(this.game || {}));
    } catch (err) {
      throw new Error(
        `Unable to snapshot game for NFT context: ${err && err.message ? err.message : err}`
      );
    }

    const stripped_fields = [
      'accept',
      'accepted',
      'clock',
      'confirms_needed',
      'cryptos',
      'dice',
      'future',
      'initialize_game_run',
      'initializing',
      'invitation',
      'invite_sig',
      'issued_keys_deleted',
      'keys',
      'last_block',
      'lock_interface',
      'opponents',
      'originator',
      'over',
      'playerNames',
      'players_needed',
      'players_set',
      'recent_moves_cache',
      'step',
      'target',
      'time',
      'timestamp',
      'turn',
      'NTS',
      'winner',
      's_pick_card',
      's_pick_done',
      's_pick_hash',
      's_roll',
      's_roll_done',
      's_roll_hash',
      'id',
      'game_id'
    ];
    for (let i = 0; i < stripped_fields.length; i++) {
      delete game[stripped_fields[i]];
    }

    if (Array.isArray(game.queue)) {
      game.queue = game.queue.filter((entry) => {
        const token = String(entry || '').split(/[\s\t]/)[0];
        return (
          token !== 's_pick_card' &&
          token !== 's_pick_done' &&
          token !== 's_pick_hash' &&
          token !== 's_roll' &&
          token !== 's_roll_done' &&
          token !== 's_roll_hash'
        );
      });
    }

    for (const key of Object.keys(game)) {
      if (game[key] === null || game[key] === '') {
        delete game[key];
      }
    }

    // Deck crypto, commitments, and identity material. `keys` is removed only
    // from an object that also carries `crypt` or `xor` (a deck or pool).
    // Gameplay fields such as discards, removed cards, and countries stay.
    const objects = [game];
    while (objects.length) {
      const value = objects.pop();
      if (!value || typeof value !== 'object') {
        continue;
      }
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          objects.push(value[i]);
        }
        continue;
      }
      const deck =
        Object.prototype.hasOwnProperty.call(value, 'crypt') ||
        Object.prototype.hasOwnProperty.call(value, 'xor');
      const fields = Object.keys(value);
      for (let i = 0; i < fields.length; i++) {
        const field = fields[i];
        if (
          field === 'sharekey' ||
          field === 'to_add' ||
          field === 'to_remove' ||
          field === 'xor' ||
          field === 'crypt' ||
          field === 'sroll_hash' ||
          field === 'spick_hash' ||
          field === 'signature' ||
          field === 'publicKey' ||
          field === 'publickey' ||
          field === 'public_key' ||
          field === 'privateKey' ||
          field === 'privatekey' ||
          field === 'private_key' ||
          (field === 'keys' && deck)
        ) {
          delete value[field];
          continue;
        }
        objects.push(value[field]);
      }
    }

    let menu = [];
    const hud = this.hud && typeof this.hud.returnContext === 'function' ? this.hud.returnContext() : null;
    if (hud && Array.isArray(hud.menu) && hud.menu.length > 0) {
      menu = hud.menu;
    } else if (hud && Array.isArray(hud.cards) && hud.cards.length > 0) {
      menu = hud.cards;
    }

    return {
      ...ctx,
      game,
      menu
    };
  }
}

module.exports = GameAI;
