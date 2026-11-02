const { randomInt } = require('node:crypto');
const { decision, selected, hasPending } = require('../decision');

class SettlersRunner {
  constructor(mod) {
    this.mod = mod;
    mod.runner = this;
    for (const [method, phase] of Object.entries({ playerBuildTown: 'town', playerBuildRoad: 'road',
      playerBuildCity: 'city', playerPlayMove: 'actions', playerPlayBandit: 'bandit' })) {
      mod[method] = (...args) => this.setDecision(phase, { canBackUp: !!args[1] });
    }
    mod.playerMoveBandit = (_player, hex) => this.setDecision('victim', { hex });
    // These functions only create DOM nodes; ports and map generation still execute.
    for (const method of ['setToolbarState', 'addRoadToGameboard', 'addSectorValueToGameboard',
      'displayPlayers', 'displayBoard', 'showTradeOverlay', 'removeEvents']) mod[method] = () => {};
  }
  setDecision(phase, params = {}) {
    this.mod.game.runnerDecision = { phase, ...params };
    this.mod.saveGame(this.mod.game.id);
  }
  vertices() {
    const h = this.mod.hexgrid, result = new Set();
    for (const hex of h.hexes) {
      const [r, c] = hex.split('_').map(Number);
      for (let v = 1; v <= 6; v++) result.add(h.verifyVertex(v, r, c));
    }
    return [...result];
  }
  vacant(vertex) {
    const m = this.mod;
    return !m.isCityAt(vertex) && !m.hexgrid.adjacentVertices(vertex).some(v => m.isCityAt(v));
  }
  value(vertex) {
    return this.mod.hexgrid.hexesFromVertex(vertex).reduce((sum, hex) => {
      const tile = this.mod.game.state.hexes[hex];
      return sum + Math.max(0, 6 - Math.abs(7 - tile.value));
    }, 0);
  }
  roads(initial = false) {
    const m = this.mod, s = m.game.state, p = m.game.player, h = m.hexgrid;
    const occupied = new Set(s.roads.map(r => r.slot.slice(5)));
    const vertices = new Set();
    if (initial) vertices.add(s.last_city.replace('city_', ''));
    else {
      for (const city of s.cities) if (city.player === p) vertices.add(city.slot.slice(5));
      for (const road of s.roads) if (road.player === p) for (const vertex of h.verticesFromEdge(road.slot.slice(5))) {
        if (!m.isCityAt(vertex) || m.isCityAt(vertex) === p) vertices.add(vertex);
      }
    }
    return [...new Set([...vertices].flatMap(v => h.edgesFromVertex(v)))].filter(e => e && !occupied.has(e));
  }
  current() {
    const m = this.mod, g = m.game, s = g?.state, d = g?.runnerDecision, p = g?.player;
    if (!s || !d || !p || g.over || g.initializing || m.gaming_active || hasPending(m)) return null;
    if (d.phase === 'discard' && !g.confirms_needed?.[p - 1]) return null;
    const own = s.players[p - 1], resources = m.returnResources(), choices = [];
    const add = (action, score = 0) => choices.push({ action, score });
    const initial = !!s.placedCity;
    if (d.phase === 'town') {
      const vertices = initial ? this.vertices().filter(v => this.vacant(v) && ![14, 15].includes(this.value(v)))
        : m.returnCitySlotsAdjacentToPlayerRoads(p).map(v => v.slice(5));
      const already = new Set(s.cities.filter(c => c.player === p).flatMap(c => c.neighbours.map(h => s.hexes[h].resource)));
      for (const vertex of vertices) add({ type: 'town', vertex }, this.value(vertex) + new Set(m.hexgrid.hexesFromVertex(vertex).map(h => s.hexes[h].resource).filter(r => !already.has(r) && resources.includes(r))).size * 6);
    } else if (d.phase === 'road') {
      for (const edge of this.roads(initial)) add({ type: 'road', edge }, Math.max(...m.hexgrid.verticesFromEdge(edge).map(v => this.vacant(v) ? this.value(v) + 10 : 0)));
      if (!choices.length && !d.canBackUp) add({ type: 'skip_road' });
    } else if (d.phase === 'city') {
      for (const city of s.cities) if (city.player === p && city.level === 1) add({ type: 'city', slot: city.slot }, this.value(city.slot.slice(5)));
    } else if (d.phase === 'roll') add({ type: 'roll' });
    else if (d.phase === 'discard') {
      // Enumerate all resource-count combinations, not permutations of identical cards.
      const count = Math.floor(own.resources.length / 2);
      const counts = resources.map(r => own.resources.filter(x => x === r).length);
      const visit = (i, left, cards) => {
        if (choices.length >= 1024) return;
        if (i === resources.length) { if (!left) add({ type: 'discard', cards }, -cards.filter(r => ['ore', 'wheat'].includes(r)).length); return; }
        for (let n = 0; n <= Math.min(left, counts[i]); n++) visit(i + 1, left - n, cards.concat(Array(n).fill(resources[i])));
      };
      visit(0, count, []);
    } else if (d.phase === 'bandit') {
      for (const [hex, tile] of Object.entries(s.hexes)) if (!tile.robber) add({ type: 'bandit', hex }, s.cities.filter(c => c.neighbours.includes(hex)).reduce((n, c) => n + (c.player === p ? -2 : 1) * c.level * Math.max(0, 6 - Math.abs(7 - tile.value)), 0));
    } else if (d.phase === 'victim') {
      const victims = [...new Set(s.cities.filter(c => c.player !== p && c.neighbours.includes(d.hex)).map(c => c.player))];
      for (const victim of victims.length ? victims : [0]) add({ type: 'victim', victim }, victim ? s.players[victim - 1].resources.length : 0);
    } else if (d.phase === 'actions') {
      const counts = Object.fromEntries(resources.map(r => [r, m.countResource(p, r)]));
      const goals = [];
      if (own.cities && s.cities.some(c => c.player === p && c.level === 1)) goals.push({ item: 2, value: 1.45 });
      if (own.towns && m.returnCitySlotsAdjacentToPlayerRoads(p).length) goals.push({ item: 1, value: 1.4 });
      else if (own.towns && this.roads().length) goals.push({ item: 0, value: 0.65 });
      if (g.deck[0].crypt.length) goals.push({ item: 3, value: 0.75 });
      for (const goal of goals) {
        goal.cost = Object.fromEntries(resources.map(r => [r, m.priceList[goal.item].filter(c => c === r).length]));
        goal.distance = (0.8 + resources.reduce((n, r) => n + Math.max(0, goal.cost[r] - counts[r]), 0)) / goal.value;
      }
      goals.sort((a, b) => a.distance - b.distance);
      const goal = goals[0];
      add({ type: 'end_turn' }, -100);
      if (m.canPlayerBuildTown(p)) add({ type: 'buy', item: 1 }, 100);
      if (m.canPlayerBuildCity(p)) add({ type: 'buy', item: 2 }, 110);
      if (m.canPlayerBuildRoad(p) && this.roads().length) add({ type: 'buy', item: 0 }, goal?.item === 0 ? 20 : -110);
      if (m.canPlayerBuyCard(p)) add({ type: 'buy', item: 3 }, 30);
      if (m.canPlayerTradeWithBank()) {
        const rates = m.analyzePorts();
        for (const give of resources) if (m.countResource(p, give) >= rates[give]) for (const get of resources) if (get !== give) {
          const useful = goal && counts[get] < goal.cost[get] && counts[give] - rates[give] >= goal.cost[give];
          add({ type: 'bank', give, get, count: rates[give] }, useful ? 50 + goal.cost[get] - counts[get] : -200);
        }
      }
    }
    if (['roll', 'actions'].includes(d.phase) && s.canPlayCard && !s.bandit) {
      for (const cardId of own.devcards) {
        const card = g.deck[0].cards[cardId];
        if (!card || (d.phase === 'roll' && card.action !== 1)) continue;
        const base = { type: 'card', cardId };
        if (card.action === 2) {
          for (let i = 0; i < resources.length; i++) for (let j = i; j < resources.length; j++) add({ ...base, resources: [resources[i], resources[j]] }, 40 - m.countResource(p, resources[i]) - m.countResource(p, resources[j]));
        } else if (card.action === 3) {
          for (const resource of resources) add({ ...base, resource }, 40);
        } else if (card.action !== 4 || this.roads().length) add(base, card.action === 0 ? 200 : 40);
      }
    }
    if (d.canBackUp && ['town', 'road', 'city'].includes(d.phase)) add({ type: 'undo', item: { road: 0, town: 1, city: 2 }[d.phase] }, -1000);
    const observation = { seat: p, phase: d.phase, turn: s.playerTurn, target: g.options.game_length,
      hexes: s.hexes, cities: s.cities, roads: s.roads, ports: s.ports, longestRoad: s.longestRoad,
      largestArmy: s.largestArmy, robinhood: s.robinhood || 0,
      players: s.players.map((player, i) => ({ seat: i + 1, vp: player.vp, knights: player.knights,
        resourceCount: player.resources.length, cardCount: player.devcards.length,
        towns: player.towns, cities: player.cities })),
      resources: own.resources, cards: own.devcards.map(id => ({ id, ...g.deck[0].cards[id] })),
      costs: m.priceList, bankRates: m.analyzePorts() };
    return decision(g.id, { step: g.step, phase: d, queue: g.queue }, observation, choices);
  }
  async submit(id, choiceId) {
    const a = selected(this.current(), id, choiceId).action;
    const m = this.mod, g = m.game, p = g.player, s = g.state;
    const moves = [], add = command => moves.push(command);
    switch (a.type) {
      case 'town': {
        const slot = 'city_' + a.vertex;
        if (s.placedCity) {
          s.placedCity = slot;
          if (s.cities.filter(c => c.player === p).length === 1) add(`secondcity\t${p}\t${a.vertex}`);
        }
        add(`build_city\t${p}\t${slot}`); break;
      }
      case 'road': add(`build_road\t${p}\troad_${a.edge}`); break;
      case 'skip_road': add('NOTIFY\tNo road location available'); break;
      case 'city': add(`upgrade_city\t${p}\t${a.slot}`); break;
      case 'roll': add(`roll\t${p}`); break;
      case 'end_turn': add(`end_turn\t${p}`); break;
      case 'undo': add(`undo_build\t${p}\t${a.item}`); break;
      case 'discard': add(`RESOLVE\t${m.publicKey}`); for (const r of a.cards) add(`spend_resource\t${p}\t${r}`); break;
      case 'bandit': add(`move_bandit\t${p}\tsector_value_${a.hex}`); break;
      case 'victim': {
        const loot = a.victim ? s.players[a.victim - 1].resources : [];
        add(`steal_card\t${p}\t${a.victim}\t${loot.length ? loot[randomInt(loot.length)] : 'nothing'}`); break;
      }
      case 'bank': add(`bank\t${p}\t${a.count}\t${a.give}\t1\t${a.get}`); break;
      case 'buy':
        if (a.item === 0) add(`player_build_road\t${p}\t0\t1`);
        if (a.item === 1) add(`player_build_city\t${p}\t1`);
        if (a.item === 2) add(`player_upgrade_city\t${p}`);
        if (a.item === 3) { add(`buy_card\t${p}`); add(`SAFEDEAL\t1\t${p}\t1`); }
        for (const r of m.priceList[a.item]) add(`spend_resource\t${p}\t${r}`);
        break;
      case 'card': {
        const card = g.deck[0].cards[a.cardId];
        if (card.action === 0) add(`vp\t${p}\t${card.card}`);
        if (card.action === 1) add(`play_knight\t${p}\t${card.card}`);
        if (card.action === 2) add(`year_of_plenty\t${p}\t${card.card}\t${JSON.stringify(a.resources)}`);
        if (card.action === 3) add(`monopoly\t${p}\t${card.card}\t${a.resource}`);
        if (card.action === 4) { add(`player_build_road\t${p}`); add(`player_build_road\t${p}`); add(`road_building\t${p}\t${card.card}`); }
        s.players[p - 1].devcards.splice(s.players[p - 1].devcards.indexOf(a.cardId), 1);
        s.canPlayCard = false;
        break;
      }
      default: throw Error('Unknown action');
    }
    delete g.runnerDecision;
    // Stage private transitions and commands together before signing/sending.
    g.runnerDraft = moves;
    m.saveGame(g.id);
    await this.sendDraft();
  }
  async sendDraft() {
    const m = this.mod;
    if (!m.game.runnerDraft) return;
    m.moves = [...m.game.runnerDraft];
    await m.endTurn();
  }
}
module.exports = SettlersRunner;
