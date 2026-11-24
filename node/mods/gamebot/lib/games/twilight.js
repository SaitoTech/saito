
function returnContext(context) {

  if (!context || !context.game) {
    return context;
  }
  const game = context.game;

  //
  // prune the context to remove unnecessary fields
  //
  const countries = {};
  for (const [country, data] of Object.entries(game.countries || {})) {
    const kept = {};
    for (const field of ['us', 'ussr', 'control', 'bg', 'neighbours', 'region']) {
      if (data[field] !== undefined) {
        kept[field] = data[field];
      }
    }
    countries[country] = kept;
  }

  const deck = (game.deck || []).map((item) => {
    const cards = {};
    for (const [card, data] of Object.entries(item.cards || {})) {
      const kept = {};
      for (const field of ['name', 'scoring', 'player', 'recurring', 'ops', 'bg']) {
        if (data[field] !== undefined) {
          kept[field] = data[field];
        }
      }
      cards[card] = kept;
    }
    return {
      cards,
      hand: item.hand,
      discards: item.discards,
      removed: item.removed
    };
  });

  const state = {};
  for (const field of [
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
  ]) {
    if (game.state[field] !== undefined) {
      state[field] = game.state[field];
    }
  }
  const activeEvents = (events) => {
    const result = {};
    for (const [event, value] of Object.entries(events || {})) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const active = activeEvents(value);
        if (Object.keys(active).length > 0) {
          result[event] = active;
        }
      } else if (value) {
        result[event] = value;
      }
    }
    return result;
  };
  if (game.state.events) {
    const events = activeEvents(game.state.events);
    if (Object.keys(events).length > 0) {
      state.events = events;
    }
  }

  //
  // A confirm menu restates a choice already made. Leave the one click that
  // carries it out. Headline and phone card-box prompts stay as shown.
  //
  const menu = context.menu;
  const status = String(game.status || '');
  if (Array.isArray(menu) && menu.length >= 2) {
    const notes = [game.status];
    for (const item of menu) {
      notes.push(item?.label, item?.text, item?.context);
    }
    const text = notes.filter(Boolean).join('\n');
    let keep = '';
    if (/^confirm you want to play this event/i.test(status)) {
      keep = 'playevent';
    } else if (/^confirm you want to play for ops/i.test(status)) {
      keep = 'playevent';
    } else if (/^confirm you want to space /i.test(status)) {
      keep = 'spaceit';
    } else if (/this is your opponent's event/i.test(status)) {
      keep = 'playevent';
    } else if (/set defcon at \d+/i.test(text)) {
      keep = 'alert-ok';
    }
    if (keep) {
      const chosen = menu.filter((item) => {
        const id = choiceId(item);
        if (id === keep) {
          return true;
        }
        if (keep === 'alert-ok') {
          return String(item?.label || item?.text || '').trim().toLowerCase() === 'ok';
        }
        return false;
      });
      if (chosen.length === 1) {
        context.menu = chosen;
      }
    }
  }

  //
  // An ordinary action round is the queue command "play" while this player
  // is asked to pick a card. Headline, scoring, Quagmire, Bear Trap, Missile
  // Envy, UN Intervention, and a forced card do not use that status.
  // Ask for the whole play once. A failed plan sets ordinary so this stable
  // queue is finished with normal clicks instead of the same plan.
  //
  delete context.decision;
  const defer = context.ordinary === true;
  delete context.ordinary;
  const pick = /^(US|USSR) pick a card:\s*$/.test(status);
  const phasing = String(game.player || '') === String(state.turn || '');
  const queue = Array.isArray(game.queue) ? game.queue : [];
  let play_queued = false;
  for (let i = 0; i < queue.length; i++) {
    if (String(queue[i] || '').split('\t')[0] === 'play') {
      play_queued = true;
    }
  }
  const hand = Array.isArray(game.deck?.[0]?.hand) ? game.deck[0].hand : [];
  const offered = Array.isArray(context.menu) ? context.menu : [];
  let hand_cards = offered.length > 0;
  for (let i = 0; i < offered.length; i++) {
    if (hand.indexOf(choiceId(offered[i])) === -1) {
      hand_cards = false;
    }
  }
  const blocked = state.headline === 1 || (state.events && state.events.unintervention);
  if (!defer && pick && phasing && play_queued && hand_cards && !blocked) {
    const lines = [];
    for (let i = 0; i < offered.length; i++) {
      const id = choiceId(offered[i]);
      const card = deck[0]?.cards?.[id] || {};
      lines.push(id + ' (' + (card.name || id) + ', ops ' + card.ops + ', ' + (card.player || 'neutral') + (card.scoring ? ', scoring' : '') + ')');
    }
    context.decision = 'strategic_move';
    context.instructions = [
      'You are choosing the card for this Twilight Struggle action round. Answer with one JSON object and nothing else.',
      'Cards: ' + lines.join('; ') + '.',
      'Use country keys from game.countries. A coup is one country. Influence and realignment list countries in click order, and amount is how many times that country is clicked.',
      'play "event" or "space" has no operation, order, or targets. play "ops" on your own card or a neutral card (player "both") uses operation "influence", "coup", or "realign" and targets. It does not use order.',
      'An opponent card cannot be played for its event from this screen. play "ops" on an opponent card uses order "before" or "after" and does not use operation or targets. The event resolves before any operations are placed, so those operations are chosen on a later screen.',
      '{"type":"strategic_move","card":"' + choiceId(offered[0]) + '","play":"ops","operation":"influence","targets":[{"country":"france","amount":1}]}'
    ].join(' ');
  }

  context.game = {
    player: game.player,
    queue: game.queue,
    status: game.status,
    vp_needed: game.vp_needed,
    countries,
    deck,
    state,
    log: game.log?.slice(-10)
  };
  return context;
}

// The plan is the decision. nextAction reads the screen that is actually up
// and returns the one click that continues it, or abort when that click is
// not there.
function acceptPlan(response, context) {
  if (!response || response.type !== 'strategic_move' || context?.decision !== 'strategic_move') {
    return null;
  }
  const menu = Array.isArray(context.menu) ? context.menu : [];
  const card = String(response.card || '').trim();
  if (!card || !menu.some((item) => choiceId(item) === card)) {
    return null;
  }
  const play = String(response.play || '').trim();
  if (play !== 'ops' && play !== 'event' && play !== 'space') {
    return null;
  }
  const info = context.game?.deck?.[0]?.cards?.[card] || {};
  const side = String(context.game?.player) === '2' ? 'us' : 'ussr';
  const owner = String(info.player || '');
  const opponent = owner === 'us' || owner === 'ussr' ? owner !== side : false;
  const scoring = info.scoring === 1 || info.scoring === true;
  if (scoring && play !== 'event') {
    return null;
  }
  if ((play === 'event' || play === 'space') && (response.operation || response.order || response.targets)) {
    return null;
  }
  let operation = '';
  let order = '';
  let targets = [];
  if (play === 'ops' && opponent) {
    order = String(response.order || '').trim();
    if ((order !== 'before' && order !== 'after') || response.operation || response.targets) {
      return null;
    }
  }
  if (play === 'ops' && !opponent) {
    operation = String(response.operation || '').trim();
    if ((operation !== 'influence' && operation !== 'coup' && operation !== 'realign') || response.order) {
      return null;
    }
    if (!Array.isArray(response.targets) || response.targets.length === 0) {
      return null;
    }
    const countries = context.game?.countries || {};
    for (let i = 0; i < response.targets.length; i++) {
      const country = String(response.targets[i]?.country || '').trim();
      const amount = response.targets[i]?.amount;
      if (!country || countries[country] == null) {
        return null;
      }
      if (operation === 'coup') {
        if (response.targets.length !== 1 || !(amount == null || amount === 1)) {
          return null;
        }
        targets.push({ country, amount: 1 });
      } else if (!Number.isInteger(amount) || amount < 1) {
        return null;
      } else {
        targets.push({ country, amount });
      }
    }
  }
  return {
    card,
    play,
    operation,
    order,
    targets,
    stage: 'card',
    spent: 0
  };
}

function acceptPlanClicks(plan) {
  const clicks = [];
  const targets = Array.isArray(plan.targets) ? plan.targets : [];
  for (let i = 0; i < targets.length; i++) {
    for (let n = 0; n < targets[i].amount; n++) {
      clicks.push(targets[i].country);
    }
  }
  return clicks;
}

function nextAction(context, plan) {
  if (!plan || !context) {
    return { abort: true };
  }
  const menu = Array.isArray(context.menu) ? context.menu : [];
  const status = String(context.game?.status || '');
  const find = (id) => menu.find((item) => choiceId(item) === id);
  const only = menu.length === 1 ? choiceId(menu[0]) : '';
  if (only === 'playevent' || only === 'spaceit' || only === 'alert-ok') {
    return { move: menu[0].identifier, hold: true, plan };
  }
  if (plan.stage === 'targets' && plan.before && status === plan.before) {
    return { abort: true };
  }

  if (plan.stage === 'card') {
    const hit = find(plan.card);
    if (!hit?.identifier) {
      return { abort: true };
    }
    return { move: hit.identifier, plan: { ...plan, stage: 'mode' } };
  }

  if (plan.stage === 'mode') {
    const want = plan.play === 'event' ? 'event' : plan.play === 'space' ? 'space' : 'ops';
    const hit = find(want);
    if (!hit?.identifier) {
      return { abort: true };
    }
    let stage = 'done';
    if (plan.play === 'ops' && plan.order) {
      stage = 'order';
    } else if (plan.play === 'ops') {
      stage = 'operation';
    }
    return { move: hit.identifier, plan: { ...plan, stage } };
  }

  if (plan.stage === 'order') {
    const hit = find(plan.order === 'before' ? 'before_ops' : 'after_ops');
    if (!hit?.identifier) {
      return { abort: true };
    }
    return { move: hit.identifier, plan: { ...plan, stage: 'done' } };
  }

  if (plan.stage === 'operation') {
    const want = plan.operation === 'influence' ? 'place' : plan.operation;
    const hit = find(want);
    if (!hit?.identifier) {
      return { abort: true };
    }
    return { move: hit.identifier, plan: { ...plan, stage: 'targets', before: '' } };
  }

  if (plan.stage === 'targets') {
    const clicks = acceptPlanClicks(plan);
    if (plan.spent >= clicks.length) {
      const rolls = status.match(/Pick a target to realign \((\d+) rolls\)/);
      if (rolls && Number(rolls[1]) > 0) {
        const end = find('cancelrealign');
        if (!end?.identifier) {
          return { abort: true };
        }
        return { move: end.identifier, plan: { ...plan, stage: 'done' } };
      }
      if (/^Place \d+ influence/.test(status) || /Pick a country to coup/.test(status)) {
        return { abort: true };
      }
      return { done: true };
    }
    const country = clicks[plan.spent];
    const hit = find(country);
    if ((plan.operation === 'influence' || plan.operation === 'coup') && !hit?.identifier) {
      return { abort: true };
    }
    return {
      move: hit?.identifier || 'div#' + country,
      plan: { ...plan, spent: plan.spent + 1, before: status }
    };
  }

  if (plan.stage === 'done') {
    return { done: true };
  }
  return { abort: true };
}


function choiceId(item) {
  let id = String(item?.id || '').trim();
  if (id) {
    return id;
  }
  const identifier = String(item?.identifier || '');
  const hash = identifier.lastIndexOf('#');
  if (hash < 0) {
    return '';
  }
  return identifier.slice(hash + 1).split('>')[0];
}



module.exports = { returnContext, acceptPlan, nextAction };
