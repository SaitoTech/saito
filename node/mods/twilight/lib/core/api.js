/**
 * Twilight NFT sandbox API methods.
 * Bound onto the Twilight instance via returnApi() (.bind(this)).
 * Queue writes use GameTemplate api.addToQueue / api.endTurn.
 * This module adds Twilight-specific queries and GameHUD selection helpers.
 */

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
  // --- Player interaction (async; no queue / state mutation) ---

  isPlayer: (faction) => {
    if (faction !== "us" && faction !== "ussr") {
      throw new Error(`Invalid faction: ${faction}`);
    }

    const executingPlayer = this.game.player;

    if (faction === "us") {
      return executingPlayer === 1;
    }

    return executingPlayer === 2;
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

  // HUD menu plus optional board highlights (same pattern as native cards).
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

  // --- Read-only queries (native Twilight logic; no queue mutation) ---

  isControlled: function (faction, country) {
    return this.isControlled(faction, country);
  },

  whoControls: function (country) {
    return this.whoControls(country);
  },

  // Ongoing-effect check used throughout Twilight: game.state.events[name] == 1.
  // Not a native method name; mirrors the engine's dominant event-active test.
  isEventActive: function (event) {
    if (typeof event !== 'string' || !event) {
      return 0;
    }
    const events = this.game && this.game.state ? this.game.state.events : null;
    if (!events) {
      return 0;
    }
    return events[event] == 1 ? 1 : 0;
  }
};
