/**
 * Twilight sandbox API helpers and instruction permission check.
 *
 * Queue / move methods come from returnApiQueue() in twilight-start.js.
 * Those wrappers call isSandboxInstructionPermitted() before forwarding.
 */

/** Twilight-specific queue commands permitted for sandbox inserts. */
const TWILIGHT_QUEUE_COMMANDS = [
  'place',
  'remove',
  'resolve',
  'vp',
  'defcon',
  'milops',
  'ops',
  'coup',
  'realign',
  'limit',
  'unlimit',
  'setvar',
  'stability',
  'dice',
  'discard',
  'undiscard',
  'hand',
  'showhand',
  'space',
  'event',
  'move',
  'play',
  'round',
  'turn',
  'card',
  'war',
  'placement',
  'placement_bonus',
  'headline',
  'clear',
  'flush',
  'deal',
  'deckaddcards',
  'sharehandsize',
  'modal',
  'wargames',
  'pinochet',
  'checoup',
  'clearcheclicktargets',
  'missileenvy',
  'quagmire',
  'tehran',
  'grainsales',
  'aldrich',
  'aldrichreveal',
  'cambridge',
  'chernobyl',
  'northsea',
  'latinamericandebtcrisis',
  'teardownthiswall',
  'stage',
  'purge',
  'bgs',
  'observer_cards_update',
  'update_observers',
  'dynamic_deck_management',
  'display_new_optional_cards',
  'reshuffle_and_insert_discards',
  'fyp_discard',
  'nixon_shock_play_card_or_hand_to_opponent'
];

/**
 * True if the instruction's command (first tab field) is in the combined
 * permitted lists from GameTemplate.returnApiQueue() and Twilight.returnApiQueue().
 */
function isSandboxInstructionPermitted(instruction, engineCommands, twilightCommands) {
  if (typeof instruction !== 'string' || !instruction) {
    return false;
  }
  const cmd = instruction.split('\t')[0];
  if (!cmd) {
    return false;
  }
  if (Array.isArray(engineCommands) && engineCommands.indexOf(cmd) !== -1) {
    return true;
  }
  if (Array.isArray(twilightCommands) && twilightCommands.indexOf(cmd) !== -1) {
    return true;
  }
  return false;
}

function normalizeMenuOptions(options, label) {
  if (!Array.isArray(options) || options.length === 0) {
    throw new Error(`${label}: expected a non-empty array`);
  }

  return options.map((opt, index) => {
    if (typeof opt === 'string') {
      if (!opt) {
        throw new Error(`${label}: empty string at index ${index}`);
      }
      return { id: opt, label: opt };
    }
    if (!opt || typeof opt !== 'object') {
      throw new Error(`${label}: invalid option at index ${index}`);
    }
    const id =
      opt.id != null
        ? String(opt.id)
        : opt.key != null
          ? String(opt.key)
          : '';
    if (!id) {
      throw new Error(`${label}: option at index ${index} needs id`);
    }
    const out = {
      id,
      label: opt.label != null ? String(opt.label) : id
    };
    if (opt.img) {
      out.img = opt.img;
    }
    if (opt.title) {
      out.title = opt.title;
    }
    if (opt.class) {
      out.class = opt.class;
    }
    return out;
  });
}

function requireHud(mod, label) {
  if (!mod.hud || typeof mod.hud.updateMenu !== 'function') {
    throw new Error(`${label}: GameHUD unavailable`);
  }
  return mod.hud;
}

function countryRecord(mod, id) {
  if (mod.countries && mod.countries[id]) {
    return mod.countries[id];
  }
  if (mod.game && mod.game.countries && mod.game.countries[id]) {
    return mod.game.countries[id];
  }
  return null;
}

function clearCountryHighlights(ids) {
  if (typeof $ === 'undefined') {
    return;
  }
  for (let i = 0; i < ids.length; i++) {
    const sel = $('#' + ids[i]);
    sel.removeClass('westerneurope');
    sel.off('click');
  }
}

module.exports = {
  TWILIGHT_QUEUE_COMMANDS,
  isSandboxInstructionPermitted,

  /**
   * Faction that triggered the current event: "us" or "ussr".
   * Prefer this over context.game.player when a card (e.g. Junta) needs to know
   * who evented, not merely which seat is running local UI code.
   * Set from playEvent(); falls back to game.target, then local seat.
   */
  returnEventingPlayer: function () {
    const fromEvent = this.game && this.game.state ? this.game.state.eventing_player : null;
    if (fromEvent === 'us' || fromEvent === 'ussr') {
      return fromEvent;
    }

    const roles = this.roles;
    const target = this.game ? this.game.target : null;
    if (roles && Number.isInteger(target) && target > 0) {
      const byTarget = roles[target];
      if (byTarget === 'us' || byTarget === 'ussr') {
        return byTarget;
      }
    }

    const seat = this.game ? this.game.player : null;
    if (roles && Number.isInteger(seat) && seat > 0) {
      const bySeat = roles[seat];
      if (bySeat === 'us' || bySeat === 'ussr') {
        return bySeat;
      }
    }

    throw new Error('returnEventingPlayer: unable to determine eventing player');
  },

  isPlayer: function (faction) {
    if (faction !== 'us' && faction !== 'ussr') {
      throw new Error(`Invalid faction: ${faction}`);
    }

    const executingPlayer = this.game.player;

    if (faction === 'us') {
      return executingPlayer === 2;
    }

    return executingPlayer === 1;
  },

  playerSelectOption: async function (options) {
    const menu = normalizeMenuOptions(options, 'playerSelectOption');
    const hud = requireHud(this, 'playerSelectOption');

    return await new Promise((resolve) => {
      hud.updateMenu(menu, (id) => {
        hud.updateMenu([]);
        resolve(id);
      });
    });
  },

  playerSelectCountry: async function (countries) {
    if (!Array.isArray(countries) || countries.length === 0) {
      throw new Error('playerSelectCountry: expected a non-empty array');
    }

    const ids = [];
    const menu = [];
    for (let i = 0; i < countries.length; i++) {
      const raw = countries[i];
      const id =
        typeof raw === 'string'
          ? raw
          : raw && typeof raw === 'object'
            ? raw.id != null
              ? String(raw.id)
              : raw.key != null
                ? String(raw.key)
                : ''
            : '';
      if (!id) {
        throw new Error(`playerSelectCountry: invalid country at index ${i}`);
      }
      const record = countryRecord(this, id);
      if (!record) {
        throw new Error(`playerSelectCountry: unknown country: ${id}`);
      }
      ids.push(id);
      menu.push({
        id,
        label:
          raw && typeof raw === 'object' && raw.label != null
            ? String(raw.label)
            : record.name || id
      });
    }

    const hud = requireHud(this, 'playerSelectCountry');

    return await new Promise((resolve) => {
      let settled = false;
      const finish = (id) => {
        if (settled) {
          return;
        }
        settled = true;
        clearCountryHighlights(ids);
        hud.updateMenu([]);
        resolve(id);
      };

      hud.updateMenu(menu, finish);

      if (typeof $ !== 'undefined') {
        for (let i = 0; i < ids.length; i++) {
          const sel = $('#' + ids[i]);
          sel.addClass('westerneurope');
          sel.off('click');
          sel.on('click', function () {
            finish($(this).attr('id'));
          });
        }
      }
    });
  },

  isControlled: function (faction, country) {
    return this.isControlled(faction, country);
  },

  whoControls: function (country) {
    return this.whoControls(country);
  },

  isEventActive: function (event) {
    if (typeof event !== 'string' || !event) {
      return 0;
    }
    const events = this.game && this.game.state ? this.game.state.events : null;
    if (!events) {
      return 0;
    }
    return events[event] == 1 ? 1 : 0;
  },

  setEvent: function (name, active) {
    if (typeof name !== 'string' || !name) {
      return;
    }
    const events = this.game && this.game.state ? this.game.state.events : null;
    if (!events) {
      return;
    }
    events[name] = active == 1 ? 1 : 0;
  },

  /**
   * Advance one box on the space race for faction "us" or "ussr".
   * Delegates to Twilight.advanceSpaceRace(): updates track, VP, markers, and UI.
   * Pass withOSS=true to skip VP for an intermediate step (One Small Step).
   */
  advanceSpaceRace: function (player, withOSS = false) {
    return this.advanceSpaceRace(player, withOSS);
  }
};
