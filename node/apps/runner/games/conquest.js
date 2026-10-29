const Engine = require('../../../mods/conquest/lib/engine');
const Map = require('../../../mods/conquest/lib/map');
const { decision, selected, hasPending } = require('../decision');

class ConquestRunner {
  constructor(mod) { this.mod = mod; }
  current() {
    const m = this.mod, g = m.game;
    if (!g?.conquestInitialized || g.over || g.initializing || m.gaming_active || hasPending(m) || g.queue.at(-1) !== 'CONQUEST_WAIT') return null;
    const s = m.viewState();
    if (s.networkBusy || s.currentPlayer !== g.player || s.phase === 'gameover') return null;
    const actions = [], own = Engine.ownedTerritories(s, g.player);
    const border = id => Map.territories[id].neighbors.some(n => s.territories[n].owner !== g.player);
    const add = (action, score = 0) => {
      try { m.validateAction(g.player, action); actions.push({ action, score }); } catch (_) { /* Enumerate legal candidates only. */ }
    };
    if (s.phase === 'claim') {
      for (const [id, t] of Object.entries(s.territories)) if (t.owner === null) add({ type: 'claim', territory: id });
    } else if (s.phase === 'setup' || s.phase === 'reinforce') {
      for (const cards of Engine.validTrades(s, g.player)) add({ type: 'trade', cards }, 1000);
      const owner = s.setupNeutral && s.phase === 'setup' ? 0 : g.player;
      for (const territory of Engine.ownedTerritories(s, owner)) {
        const max = s.phase === 'setup' ? Math.min(s.setupPlacementsLeft, s.setupRemaining[owner]) : s.reinforcements;
        for (const count of new Set([1, max])) if (count > 0) add({ type: 'place', territory, count }, (border(territory) ? 100 : 0) + s.territories[territory].armies + count);
      }
    } else if (s.phase === 'attack') {
      for (const from of own) for (const to of Map.territories[from].neighbors) if (Engine.canAttack(s, from, to)) {
        add({ type: 'attack', from, to, blitz: true, steamroll: true }, s.territories[from].armies - s.territories[to].armies + 10);
      }
      add({ type: 'end_attack' }, 0);
    } else if (s.phase === 'occupy') {
      for (const count of new Set([s.occupation.min, s.occupation.max])) add({ type: 'occupy', count }, count);
    } else if (s.phase === 'fortify') {
      for (const from of own) for (const to of Map.territories[from].neighbors) if (Engine.canFortify(s, from, to)) {
        add({ type: 'fortify', from, to, count: s.territories[from].armies - 1 }, !border(from) && border(to) ? 10 : -1);
      }
      add({ type: 'end_turn' });
    }
    // Explicit public-state allowlist: never send RNG seeds, deck order, battle secrets or other hands.
    const observation = { seat: g.player, phase: s.phase, turn: s.turn, territories: s.territories,
      players: s.players.map(p => ({ id: p.id, cardCount: p.cardCount, eliminated: p.eliminated })),
      hand: s.players.find(p => p.id === g.player).cards, reinforcements: s.reinforcements,
      mustTrade: s.mustTrade, occupation: s.occupation, map: Object.fromEntries(Object.entries(Map.territories).map(([id, t]) => [id, { neighbors: t.neighbors, continent: t.continent }])), continents: Map.continents };
    return decision(g.id, g.conquestRevision, observation, actions);
  }
  async submit(id, choiceId) {
    const choice = selected(this.current(), id, choiceId);
    await this.mod.submitAction(choice.action);
  }
}
module.exports = ConquestRunner;
