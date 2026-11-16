// Bounded, deterministic counterfactuals. Never touches the engine RNG or an
// opponent's private cards. These estimates are advice, not simulated moves.
const S = require('./strategy');
const count = (resources, hand) => Object.fromEntries(resources.map(r => [r, hand.filter(x => x === r).length]));
const total = x => Object.values(x).reduce((a, b) => a + b, 0);
const round = x => Math.round(x * 1000) / 1000;
function marginal(m, hand, income = S.production(m, m.game.player), rates = m.analyzePorts()) {
  const resources = m.returnResources(), inventory = count(resources, hand);
  const own = m.game.state.players[m.game.player - 1];
  const items = [...(own.cities ? [2] : []), ...(own.towns ? [1] : []), ...(m.game.deck[0].crypt.length ? [3] : [])];
  const costs = items.map(i => count(resources, m.priceList[i]));
  const time = bag => costs.map(cost => S.funding(cost, bag, rates, income).projectedRolls ?? 80);
  const before = time(inventory);
  return Object.fromEntries(resources.map(r => {
    const after = time({ ...inventory, [r]: inventory[r] + 1 });
    const saved = before.map((n, i) => Math.max(0, n - after[i]));
    // City ingredients carry more weight when no further town can be placed.
    const value = saved.reduce((n, v, i) => n + v * (items[i] === 2 && !own.towns ? 2 : 1), 0) / Math.max(1, items.length);
    return [r, round(1 / rates[r] + Math.min(8, value))];
  }));
}
function development(m) {
  if (!Array.isArray(m.deck)) return { available: false, reason: 'Public deck composition unavailable', value: 0 };
  const g = m.game, s = g.state, p = g.player, own = s.players[p - 1];
  const pool = [0, 0, 0, 0, 0];
  for (const c of m.deck) pool[c.action] += c.count;
  pool[0] -= s.players.reduce((n, x) => n + (x.vpc || 0), 0);
  pool[1] -= s.players.reduce((n, x) => n + (x.knights || 0), 0);
  for (const id of [...own.devcards, ...(g.deck[0].hand || [])]) {
    const c = g.deck[0].cards[id]; if (c) pool[c.action]--;
  }
  for (let i = 0; i < pool.length; i++) pool[i] = Math.max(0, pool[i]);
  const deckSize = g.deck[0].crypt.length;
  const hiddenHeld = s.players.reduce((n, x, i) => n + (i + 1 === p ? 0 : x.devcards.length), 0);
  const unknown = deckSize + hiddenHeld, special = pool[2] + pool[3] + pool[4];
  // Public totals identify how many utility cards were played, but not which
  // subtype in older saves. Keep subtype estimates explicitly uncertain.
  const removed = Math.max(0, total(pool) - unknown);
  const probabilities = pool.map((n, i) => unknown ? round((i < 2 ? n : n * Math.max(0, special - removed) / Math.max(1, special)) / unknown) : 0);
  const armyHeld = s.largestArmy.player === p;
  const rivalKnights = Math.max(0, ...s.players.filter((_, i) => i + 1 !== p).map(x => x.knights || 0));
  const knightsNeeded = armyHeld ? 0 : Math.max(3, (s.largestArmy.size || 0) + 1) - (own.knights || 0);
  const knightValue = armyHeld ? ((own.knights || 0) > rivalKnights + 1 ? 0.15 : 0.5) : m.largest.value / Math.max(1, knightsNeeded);
  const roadValue = s.longestRoad.player === p ? 0.25 : 0.65;
  const value = probabilities[0] * 10 + probabilities[1] * (1 + knightValue * 5) + probabilities[2] * 3 + probabilities[3] * 2 + probabilities[4] * roadValue * 4;
  return { available: deckSize > 0, probabilities, vpProbabilityBounds: deckSize ? [round(Math.max(0, pool[0] - hiddenHeld) / deckSize), round(Math.min(deckSize, pool[0]) / deckSize)] : [0, 0],
    armyHeld, knightsNeeded, knightValue: round(knightValue), value: round(value),
    assumption: 'Exchangeable unknown cards; hidden opponent holdings can bias actual deck odds. Utility subtypes estimated from public totals. No immediate points guaranteed.' };
}
function simulate(m, required, hand, { samples = 48, horizon = 24 } = {}) {
  const resources = m.returnResources(), g = m.game, s = g.state, p = g.player;
  const rates = m.analyzePorts(), initial = count(resources, hand);
  const yields = Array.from({ length: 13 }, () => Object.fromEntries(resources.map(r => [r, 0])));
  for (const c of s.cities.filter(c => c.player === p)) for (const hex of m.hexgrid.hexesFromVertex(c.slot.slice(5))) {
    const t = s.hexes[hex];
    if (t && yields[t.value] && resources.includes(t.resource) && (!t.robber || s.robinhood === p)) yields[t.value][t.resource] += c.level;
  }
  const funded = bag => resources.reduce((n, r) => n + Math.floor(Math.max(0, bag[r] - required[r]) / rates[r]) - Math.max(0, required[r] - bag[r]), 0) >= 0;
  let seed = 0x5a170, hits = 0, lost = 0, byRound = 0; const times = [];
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  for (let sample = 0; sample < samples; sample++) {
    const bag = { ...initial };
    const usableNow = s.canTrade || resources.every(r => bag[r] >= required[r]);
    let discarded = false, reached = usableNow && funded(bag) ? 0 : null;
    for (let roll = 1; reached === null && roll <= horizon; roll++) {
      let dice;
      do { dice = 2 + Math.floor(random() * 6) + Math.floor(random() * 6); } while (dice === 7 && (g.stats?.history?.length ?? 5) + roll - 1 < 5);
      if (dice === 7 && total(bag) > 7 && s.robinhood !== p) {
        const drop = Math.floor(total(bag) / 2); discarded = true;
        for (let i = 0; i < drop; i++) {
          const r = resources.filter(r => bag[r] > 0).sort((a, b) => (bag[b] - required[b]) - (bag[a] - required[a]) || bag[b] - bag[a])[0]; bag[r]--;
        }
      } else if (dice !== 7) for (const r of resources) bag[r] += yields[dice][r];
      // Only our next turns permit spending; assuming this observation is after
      // our roll. Other players' rolls still produce resources and discards.
      if (roll % g.players.length === 0 && funded(bag)) reached = roll;
    }
    if (discarded) lost++;
    if (reached !== null) { hits++; times.push(reached); if (reached <= g.players.length) byRound++; }
  }
  times.sort((a, b) => a - b);
  return { samples, horizon, fundedWithinHorizon: round(hits / samples), fundedNextTurn: round(byRound / samples),
    medianRollsWhenFunded: times.length ? times[Math.floor(times.length / 2)] : null, discardBeforeFunding: round(lost / samples),
    assumption: 'Independent fair dice, fixed board/robber/ports, no theft or other spending; reserve-first discards. Conditional median excludes failures.' };
}
module.exports = { marginal, development, simulate };
