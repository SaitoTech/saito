const COUNTRY_FIELDS = [
  'us',
  'ussr',
  'control',
  'bg',
  'neighbours',
  'region'
];

const CARD_FIELDS = [
  'name',
  'scoring',
  'player',
  'recurring',
  'ops',
  'bg'
];

const STATE_FIELDS = [
  'dealt',
  'r1_placement',
  'placement',
  'headline',
  'headline_hash',
  'headline_card',
  'headline_xor',
  'headline_opponent_hash',
  'headline_opponent_card',
  'headline_opponent_xor',
  'round',
  'turn',
  'turn_in_round',
  'broke_control',
  'us_efcon_bonus',
  'player1_hold_cards',
  'player2_hold_cards',
  'opponent_cards_in_hand',
  'event_before_ops',
  'event_name',
  'player_to_go',
  'lower_defcon_on_coup',
  'vp_outstanding',
  'space_race_us',
  'space_race_ussr',
  'space_race_us_counter',
  'space_race_ussr_counter',
  'animal_in_space',
  'man_in_earth_orbit',
  'eagle_has_landed',
  'eagle_has_landed_bonus_taken',
  'space_station',
  'space_station_bonus_taken',
  'limit_coups',
  'limit_realignments',
  'limit_placement',
  'limit_spacerace',
  'limit_ignoredefcon',
  'se',
  'vp',
  'milops_us',
  'milops_ussr',
  'defcon',
  'wargames_concession',
  'defectors_pulled_in_headline',
  'move',
  'us_defcon_bonus',
  'ironlady_before_ops',
  'ussr_milops',
  'us_milops'
];

function returnFields(source, fields) {
  const result = {};
  for (const field of fields) {
    if (source[field] !== undefined) {
      result[field] = source[field];
    }
  }
  return result;
}

function returnCountries(countries) {
  const result = {};
  for (const [country, data] of Object.entries(countries || {})) {
    result[country] = returnFields(data, COUNTRY_FIELDS);
  }
  return result;
}

function returnCards(cards) {
  const result = {};
  for (const [card, data] of Object.entries(cards || {})) {
    result[card] = returnFields(data, CARD_FIELDS);
  }
  return result;
}

function returnActiveEvents(events) {
  const result = {};
  for (const [event, value] of Object.entries(events || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const active = returnActiveEvents(value);
      if (Object.keys(active).length > 0) {
        result[event] = active;
      }
    } else if (value) {
      result[event] = value;
    }
  }
  return result;
}

function returnState(state) {
  const result = returnFields(state, STATE_FIELDS);
  if (state.events) {
    const events = returnActiveEvents(state.events);
    if (Object.keys(events).length > 0) {
      result.events = events;
    }
  }
  return result;
}

function returnDeck(deck) {
  return (deck || []).map((item) => ({
    cards: returnCards(item.cards),
    hand: item.hand,
    discards: item.discards,
    removed: item.removed
  }));
}

function returnContext(context) {
  if (!context || !context.game) {
    return context;
  }
  const game = context.game;
  context.game = {
    player: game.player,
    queue: game.queue,
    status: game.status,
    vp_needed: game.vp_needed,
    countries: returnCountries(game.countries),
    deck: returnDeck(game.deck),
    state: returnState(game.state),
    log: game.log?.slice(-10)
  };
  return context;
}

module.exports = { returnContext };
