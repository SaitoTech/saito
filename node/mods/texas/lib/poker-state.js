class PokerState {
  returnPlayerCharacterPool() {
    return ['player1', 'player2', 'player3', 'player4', 'player5', 'player6'];
  }

  // Deterministic shuffle so every peer assigns the same portraits for a game.
  shufflePlayerCharacters(seed = '') {
    let pool = this.returnPlayerCharacterPool().slice();
    let h = 2166136261;
    let s = String(seed || this.game?.id || 'texas');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    for (let i = pool.length - 1; i > 0; i--) {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      h >>>= 0;
      let j = h % (i + 1);
      let tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    return pool;
  }

  ensurePlayerCharacters() {
    if (!this.game?.state) {
      return;
    }
    let n = this.game.players?.length || 0;
    if (!Array.isArray(this.game.state.player_characters)) {
      this.game.state.player_characters = [];
    }
    if (this.game.state.player_characters.length >= n && n > 0) {
      return;
    }
    let pool = this.shufflePlayerCharacters(this.game.id);
    let used = new Set(this.game.state.player_characters);
    while (this.game.state.player_characters.length < n) {
      let next = pool.find((id) => !used.has(id)) || pool[this.game.state.player_characters.length % pool.length];
      this.game.state.player_characters.push(next);
      used.add(next);
    }
  }

  returnState(num_of_players) {
    let state = {};

    state.round = 1;
    state.flipped = 0;

    state.player_cards = {};
    state.player_cards_reported = 0;
    state.player_cards_required = 0;

    state.plays_since_last_raise = 0;

    state.big_blind_player = 1;
    state.small_blind_player = 2;
    state.button_player = 3;

    if (num_of_players == 2) {
      state.button_player = 2;
      state.big_blind_player = 1;
      state.small_blind_player = 2;
    }

    state.player_names = [];
    state.player_characters = [];
    state.player_pot = [];
    state.player_credit = [];
    state.passed = [];
    state.debt = [];
    state.chip_exchange = [];

    state.winners = [];
    state.last_fold = null;

    let characters = this.shufflePlayerCharacters(this.game?.id);

    //
    // initializeGameStake should flesh this out
    //
    for (let i = 0; i < num_of_players; i++) {
      state.passed[i] = 0;
      state.player_pot[i] = 0;
      state.player_credit[i] = 0;
      state.debt[i] = 0;
      state.player_names[i] = this.app.keychain.returnUsername(this.game.players[i]);
      state.player_characters[i] = characters[i % characters.length];
      state.chip_exchange[i] = new Array(num_of_players).fill(0);
    }

    state.big_blind = 2;
    state.small_blind = 1;
    state.last_raise = 2;
    state.required_pot = 2;
    state.all_in = false;

    return state;
  }

  returnStats() {
    let stats = {};
    for (let i = 0; i < this.game.players.length; i++) {
      stats[this.game.players[i]] = {};
      stats[this.game.players[i]].hands = 0;
      stats[this.game.players[i]].wins = 0;
      stats[this.game.players[i]].folds = 0;
      stats[this.game.players[i]].walks = 0;
      stats[this.game.players[i]].vpip = 0;
      stats[this.game.players[i]].showdowns = 0;
    }
    return stats;
  }

  removePlayerFromState(pkey) {
    let index = this.game.players.indexOf(pkey);

    if (index >= 0 && index < this.game.state.player_names.length) {
      this.game.stats[pkey].final_chips = this.game.state.player_credit[index];
      this.game.state.player_names.splice(index, 1);
      if (Array.isArray(this.game.state.player_characters)) {
        this.game.state.player_characters.splice(index, 1);
      }
      this.game.state.player_pot.splice(index, 1);
      this.game.state.player_credit.splice(index, 1);
      this.game.state.passed.splice(index, 1);
      this.game.state.debt.splice(index, 1);

      for (let i = 0; i < this.game.players.length; i++) {
        if (index !== i) {
          this.game.state.chip_exchange[i].splice(index, 1);
        }
      }
      this.game.state.chip_exchange.splice(index, 1);

      return `${this.game.stats[pkey].final_chips} CHIPS`;
    } else {
      console.warn('Invalid index removePlayerFromState');
    }
  }

  addPlayerToState(pkey) {
    let index = this.game.players.indexOf(pkey);

    console.log(pkey, index, this.game.players);

    this.game.state.player_names.push(this.app.keychain.returnUsername(this.game.players[index]));
    if (!Array.isArray(this.game.state.player_characters)) {
      this.game.state.player_characters = [];
    }
    let pool = this.returnPlayerCharacterPool();
    let used = new Set(this.game.state.player_characters);
    let next = pool.find((id) => !used.has(id)) || pool[index % pool.length];
    this.game.state.player_characters.push(next);
    this.game.state.player_pot.push(0);
    this.game.state.player_credit.push(this.game.chips);
    this.game.state.passed.push(0);
    this.game.state.debt.push(0);

    for (let i = 0; i < this.game.players.length; i++) {
      if (index !== i) {
        this.game.state.chip_exchange[i].splice(index, 0, 0);
      } else {
        this.game.state.chip_exchange.splice(index, 0, new Array(this.game.players.length).fill(0));
      }
    }

    // And for stats...

    this.game.stats[pkey] = {};
    this.game.stats[pkey].hands = 0;
    this.game.stats[pkey].wins = 0;
    this.game.stats[pkey].folds = 0;
    this.game.stats[pkey].walks = 0;
    this.game.stats[pkey].vpip = 0;
    this.game.stats[pkey].showdowns = 0;
  }
}

module.exports = PokerState;
