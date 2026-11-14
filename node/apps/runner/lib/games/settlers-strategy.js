const Network = require('./settlers-network');
const names = ['road', 'settlement', 'city', 'development card'];
const round = n => Math.round(n * 10000) / 10000;
const count = (resources, hand) => Object.fromEntries(resources.map(r => [r, hand.filter(x => x === r).length]));
const rules = {
  victory: 'Reach the configured target VP. Settlements score 1; upgrading to a city adds 1 and doubles its production. Award values and thresholds are supplied separately.',
  production: 'All players collect on each roll. Production estimates use fair dice, current buildings and robber/Robin Hood rules; they are not forecasts of hidden dice. The engine rerolls sevens until five harvest-history entries exist.',
  trade: 'Bank rates are resource-specific. Building or buying ends trading for this turn: finish needed trades first. Do not exchange reserved ingredients just to obtain a missing ingredient: compare the entire remaining cost and production-rate delay. A trade that increases the target shortage without enabling a useful purchase may be worse than waiting. Player-to-player trades are not offered by this runner.',
  placement: 'Settlements must not touch another settlement/city; after setup they connect to your roads. Initial pip totals 14 and 15 are forbidden here. The second setup settlement grants one resource from each adjacent non-desert tile.',
  road: 'Roads connect your network; enemy towns block continuation. A road alone scores no points except when it gains Longest Road. Expansion routes show up to three new roads to a legal settlement site. Compare paths and future production before buying a road; do not build disconnected dead ends merely because resources are available.',
  robber: 'A seven normally discards floor(half) for hands over seven; Robin Hood can exempt a player. The robber blocks a tile except for the protected player. Theft uses a random resource; opponent identities are unknown.',
  cards: '0: reveal 1 VP; 1: knight moves robber and advances Largest Army; 2: Year of Plenty gains two chosen resources; 3: Monopoly collects the named resource from opponents; 4: build two free roads. Only offered cards are playable under the engine’s timing rules.',
  planning: 'Choose a concrete destination and compare complete trade/build sequences with waiting. Objectives persist across turns until completed, blocked or explicitly changed. Expansion reserves include the remaining roads and settlement. Near the target score, prioritize finishing and denying an opponent scoring opportunities. A selected sequence executes only while every next move remains legal; unknown draws and theft require a fresh decision.'
};
function probability(m, value) {
  if (!Number.isInteger(value) || value < 2 || value > 12 || value === 7) return 0;
  return (6 - Math.abs(7 - value)) / ((m.game.stats?.history?.length ?? 5) < 5 ? 30 : 36);
}
function site(m, vertex, player = m.game.player) {
  const s = m.game.state, resources = m.returnResources();
  const production = Object.fromEntries(resources.map(r => [r, 0])), blocked = { ...production };
  const hexes = m.hexgrid.hexesFromVertex(vertex), numbers = new Set();
  for (const hex of hexes) {
    const t = s.hexes[hex]; if (!t || !resources.includes(t.resource)) continue;
    const amount = probability(m, t.value); numbers.add(t.value);
    if (t.robber && s.robinhood !== player) blocked[t.resource] += amount;
    else production[t.resource] += amount;
  }
  return { productionPerRoll: Object.fromEntries(resources.map(r => [r, round(production[r])])),
    blockedPerRoll: Object.fromEntries(resources.map(r => [r, round(blocked[r])])),
    numberDiversity: numbers.size,
    ports: Object.entries(s.ports).filter(([edge]) => m.hexgrid.verticesFromEdge(edge).includes(vertex)).map(([, resource]) => resource),
    startingResources: hexes.map(hex => s.hexes[hex]?.resource).filter(r => resources.includes(r)) };
}
function production(m, player, extraVertex) {
  const resources = m.returnResources(), result = Object.fromEntries(resources.map(r => [r, 0]));
  const buildings = m.game.state.cities.filter(c => c.player === player).map(c => ({ vertex: c.slot.slice(5), level: c.level }));
  if (extraVertex) buildings.push({ vertex: extraVertex, level: 1 });
  for (const c of buildings) {
    const rates = site(m, c.vertex, player).productionPerRoll;
    for (const r of resources) result[r] += rates[r] * c.level;
  }
  return Object.fromEntries(resources.map(r => [r, round(result[r])]));
}
function funding(required, counts, rates, income) {
  const resources = Object.keys(required), needed = resources.flatMap(r => Array(Math.max(0, required[r] - counts[r])).fill(r));
  const spare = Object.fromEntries(resources.map(r => [r, Math.max(0, counts[r] - required[r])]));
  const trades = [];
  for (const get of needed) {
    const give = resources.filter(r => spare[r] >= rates[r]).sort((a, b) => (income[b] || 0) - (income[a] || 0))[0];
    if (!give) break;
    spare[give] -= rates[give]; trades.push({ give, count: rates[give], get });
  }
  let projectedRolls = null;
  // A deterministic rate projection, NOT expected time-to-first-build: it omits
  // variance, opponents, future robber movement, and future spending.
  for (let rolls = 0; rolls <= 72; rolls++) {
    let deficit = 0, credits = 0;
    for (const r of resources) {
      const expected = counts[r] + rolls * income[r];
      deficit += Math.max(0, required[r] - expected);
      credits += Math.floor(Math.max(0, expected - required[r]) / rates[r]);
    }
    if (credits >= deficit) { projectedRolls = rolls; break; }
  }
  return { bankTradesToAfford: trades.length === needed.length ? trades : null, projectedRolls,
    missingWithoutProduction: resources.filter(r => required[r] > counts[r] && income[r] === 0) };
}
function economy(m, hand) {
  const s = m.game.state, p = m.game.player, resources = m.returnResources(), own = s.players[p - 1];
  const counts = count(resources, hand), rates = m.analyzePorts(), income = production(m, p);
  const builds = m.priceList.map((cost, item) => {
    const required = count(resources, cost);
    const missing = Object.fromEntries(resources.map(r => [r, Math.max(0, required[r] - counts[r])]));
    const tradeCredits = resources.reduce((n, r) => n + Math.floor(Math.max(0, counts[r] - required[r]) / rates[r]), 0);
    const missingCards = Object.values(missing).reduce((n, v) => n + v, 0);
    return { item, name: names[item], cost: required, missing, missingCards,
      ...funding(required, counts, rates, income),
      pointGain: item === 1 || item === 2 ? 1 : 0,
      affordableAfterBankTrades: !!s.canTrade && tradeCredits >= missingCards,
      available: item === 0 ? m.runner.roads().length > 0 : item === 1 ? own.towns > 0 && m.returnCitySlotsAdjacentToPlayerRoads(p).length > 0 :
        item === 2 ? own.cities > 0 && s.cities.some(c => c.player === p && c.level === 1) : m.game.deck[0].crypt.length > 0 };
  });
  const plan = m.game.runnerSettlersPlan;
  const active = plan && !plan.completed && plan.seat === p;
  let target = active ? builds[plan.item] : null;
  if (target && plan.goal) {
    const roads = (plan.goal.route || []).filter(e => !s.roads.some(r => r.player === p && r.slot === 'road_' + e));
    const required = count(resources, [...roads.flatMap(() => m.priceList[0]), ...(plan.item === 0 ? [] : m.priceList[plan.item])]);
    target = { cost: required, missing: Object.fromEntries(resources.map(r => [r, Math.max(0, required[r] - counts[r])])) };
  }
  return { counts, builds, handSize: hand.length, discardOnSeven: hand.length > 7 && s.robinhood !== p ? Math.floor(hand.length / 2) : 0,
    reserveForPlan: target ? Object.fromEntries(resources.map(r => [r, Math.min(counts[r], target.cost[r])])) : {},
    missingForPlan: target?.missing || {}, tradingOpen: !!s.canTrade };
}
function summary(m, hand) {
  const s = m.game.state, resources = m.returnResources(), target = Number(m.game.options.game_length || 10);
  const players = s.players.map((p, i) => {
    const production = Object.fromEntries(resources.map(r => [r, 0]));
    for (const city of s.cities.filter(c => c.player === i + 1)) {
      const info = site(m, city.slot.slice(5), i + 1);
      for (const r of resources) production[r] += info.productionPerRoll[r] * city.level;
    }
    return { seat: i + 1, vp: p.vp, pointsToTarget: Math.max(0, target - p.vp),
      productionPerRoll: Object.fromEntries(resources.map(r => [r, round(production[r])])),
      resourceDiversity: resources.filter(r => production[r] > 0).length,
      resourceCount: p.resources.length, knights: p.knights || 0,
      knightsToTakeLargestArmy: s.largestArmy.player === i + 1 ? 0 : Math.max(3, (s.largestArmy.size || 0) + 1) - (p.knights || 0) };
  });
  const economyNow = economy(m, hand);
  const plan = m.game.runnerSettlersPlan;
  const metrics = { vp: s.players[m.game.player - 1].vp, missingCards: plan?.goal ? Object.values(economyNow.missingForPlan).reduce((n, v) => n + v, 0) : economyNow.builds[plan?.item]?.missingCards ?? null,
    productionPerRoll: players[m.game.player - 1].productionPerRoll };
  const routes = Network.expansion(m).map(route => ({ ...route, ...site(m, route.vertex) }))
    .sort((a, b) => a.roadsNeeded - b.roadsNeeded || Object.values(b.productionPerRoll).reduce((n, x) => n + x, 0) - Object.values(a.productionPerRoll).reduce((n, x) => n + x, 0));
  return { economy: economyNow, players,
    expansionRoutes: routes.slice(0, 8),
    longestRoad: Network.longestRoad(m, m.game.player),
    planProgress: plan?.startMetrics ? { atSelection: plan.startMetrics, current: metrics,
      vpGained: metrics.vp - plan.startMetrics.vp,
      shortageReduced: plan.startMetrics.missingCards - metrics.missingCards } : null,
    fundingAssumptions: 'Projected rolls apply current production rates and port exchange rates to build costs, capped at 72 rolls. This is not an expected waiting time. Future robber movement, variance and spending can change it; bank trades may only be executed while trading is open.',
    awards: { longestRoad: { ...s.longestRoad, value: m.longest.value, minimum: m.longest.min || 5 },
      largestArmy: { ...s.largestArmy, value: m.largest.value, minimum: 3 } },
    settlementSlots: m.returnCitySlotsAdjacentToPlayerRoads(m.game.player).map(slot => slot.slice(5)),
    probabilityBasis: (m.game.stats?.history?.length ?? 5) < 5 ? '2d6 conditioned on not rolling seven (early game)' : 'ordinary fair 2d6',
    unknown: 'Opponent resource identities, unplayed card identities and future deck/dice outcomes are not supplied. Monopoly yield cannot be known from hand counts.' };
}
function consequences(m, a, hand, strategic) {
  const s = m.game.state, p = m.game.player, resources = m.returnResources();
  const after = [...hand];
  const remove = r => { const i = after.indexOf(r); if (i >= 0) after.splice(i, 1); };
  if (a.type === 'town' || a.type === 'city') {
    const vertex = a.vertex || a.slot.slice(5), info = site(m, vertex);
    const existing = strategic.players[p - 1].productionPerRoll;
    return { ...info, pointGain: 1, winsAtCurrentScore: s.players[p - 1].vp + 1 >= Number(m.game.options.game_length || 10),
      newResourceTypes: resources.filter(r => !existing[r] && info.productionPerRoll[r] > 0),
      combinedProductionAfter: production(m, p, vertex),
      unavailableResourcesAfter: resources.filter(r => production(m, p, vertex)[r] === 0),
      startingResources: s.placedCity && s.cities.filter(c => c.player === p).length === 1 ? info.startingResources : [],
      costAlreadyPaid: !s.placedCity };
  }
  if (a.type === 'road') {
    const sites = m.hexgrid.verticesFromEdge(a.edge).filter(v => m.runner.vacant(v));
    const longest = Network.longestRoad(m, p, a.edge);
    const claims = longest.exact ? s.longestRoad.player !== p && longest.length >= Math.max(m.longest.min || 5, s.longestRoad.player ? (s.longestRoad.size || 0) + 1 : 0) : null;
    return { endpoints: m.hexgrid.verticesFromEdge(a.edge),
      longestRoadAfter: longest, claimsLongestRoad: claims,
      awardPointGain: claims ? m.longest.value : 0,
      winsAtCurrentScore: !!claims && s.players[p - 1].vp + m.longest.value >= Number(m.game.options.game_length || 10),
      routesAfter: Network.expansion(m, a.edge).filter(r => r.route.length < 3).sort((a, b) => a.roadsNeeded - b.roadsNeeded).slice(0, 4),
      newSettlementSites: sites.filter(v => !strategic.settlementSlots.includes(v)).map(vertex => ({ vertex, ...site(m, vertex) })),
      pointGainWithoutAward: 0, longestRoadEffect: 'The path calculation stops at opponent buildings; capped searches report a lower bound and do not claim an award.' };
  }
  if (a.type === 'bandit') {
    const tile = s.hexes[a.hex];
    const blocked = s.cities.filter(c => c.neighbours.includes(a.hex) && c.player !== s.robinhood).map(c => ({
      seat: c.player, resource: tile.resource, productionBlockedPerRoll: round(probability(m, tile.value) * c.level) }));
    const old = Object.entries(s.hexes).find(([, t]) => t.robber)?.[0];
    const restored = s.cities.filter(c => c.neighbours.includes(old) && c.player !== s.robinhood).map(c => ({
      seat: c.player, resource: s.hexes[old].resource, productionRestoredPerRoll: round(probability(m, s.hexes[old].value) * c.level) }));
    const ownChange = restored.filter(c => c.seat === p).reduce((n, c) => n + c.productionRestoredPerRoll, 0) - blocked.filter(c => c.seat === p).reduce((n, c) => n + c.productionBlockedPerRoll, 0);
    const enemyChange = restored.filter(c => c.seat !== p).reduce((n, c) => n + c.productionRestoredPerRoll, 0) - blocked.filter(c => c.seat !== p).reduce((n, c) => n + c.productionBlockedPerRoll, 0);
    return { blocked, restored, ownProductionChange: round(ownChange), netProductionAdvantage: round(ownChange - enemyChange),
      opponentScores: s.players.map((x, i) => ({ seat: i + 1, vp: x.vp })).filter(x => x.seat !== p),
      eligibleVictims: [...new Set(s.cities.filter(c => c.player !== p && c.neighbours.includes(a.hex)).map(c => c.player))] };
  }
  if (a.type === 'victim') return { victim: a.victim, resourceCount: a.victim ? s.players[a.victim - 1].resources.length : 0,
    vp: a.victim ? s.players[a.victim - 1].vp : 0, stolenResource: 'unknown random resource, or nothing for an empty hand' };
  if (a.type === 'buy') m.priceList[a.item].forEach(remove);
  if (a.type === 'bank') { for (let i = 0; i < a.count; i++) remove(a.give); after.push(a.get); }
  if (a.type === 'discard') remove(a.resource);
  if (a.type === 'card') {
    const card = m.game.deck[0].cards[a.cardId];
    if (card.action === 2) after.push(...a.resources);
    else if (card.action === 3) return { effect: 'Collect chosen resource from opponents', resource: a.resource, yield: 'unknown',
      maximumFromPublicHandCounts: s.players.reduce((n, x, i) => n + (i + 1 === p ? 0 : x.resources.length), 0), missingForPlan: strategic.economy.missingForPlan };
    else if (card.action === 1) {
      const gains = s.largestArmy.player !== p && (s.players[p - 1].knights || 0) + 1 >= Math.max(3, (s.largestArmy.size || 0) + 1);
      return { effect: 'Move robber; add one knight', gainsLargestArmy: gains, awardValue: m.largest.value,
        winsAtCurrentScore: gains && s.players[p - 1].vp + m.largest.value >= Number(m.game.options.game_length || 10) };
    }
    else if (card.action === 0) return { pointGain: 1, winsAtCurrentScore: s.players[p - 1].vp + 1 >= Number(m.game.options.game_length || 10) };
    else return { effect: 'Place two free roads in successive decisions; choose an expansion route.' };
  }
  if (['bank', 'discard', 'buy', 'card'].includes(a.type)) {
    const e = economy(m, after);
    const plan = m.game.runnerSettlersPlan;
    const beforeTarget = plan && !plan.completed && plan.seat === p ? strategic.economy.builds[plan.item] : null;
    const afterTarget = beforeTarget ? e.builds[plan.item] : null;
    return { resourcesAfter: e.counts, missingForPlanAfter: e.missingForPlan,
      ...(a.type === 'bank' && beforeTarget ? { planImpact: {
        target: beforeTarget.name,
        shortageBefore: beforeTarget.missingCards, shortageAfter: afterTarget.missingCards,
        shortageChange: afterTarget.missingCards - beforeTarget.missingCards,
        reservedIngredientsSpent: Math.max(0, Math.min(beforeTarget.cost[a.give], strategic.economy.counts[a.give]) - Math.min(beforeTarget.cost[a.give], e.counts[a.give])),
        projectedRollsBefore: beforeTarget.projectedRolls, projectedRollsAfter: afterTarget.projectedRolls,
        completesTargetFunding: afterTarget.missingCards === 0
      } } : {}),
      fundingAfter: e.builds.map(b => ({ item: b.item, missingCards: b.missingCards, projectedRolls: b.projectedRolls })),
      buildsAffordableAfter: e.builds.filter(b => b.available && b.missingCards === 0).map(b => b.name),
      discardOnSevenAfter: e.discardOnSeven, tradingEnds: a.type === 'buy',
      ...(a.type === 'buy' ? { purchase: names[a.item], pointGain: a.item === 1 || a.item === 2 ? 1 : 0, winsAfterPlacement: [1, 2].includes(a.item) && s.players[p - 1].vp + 1 >= Number(m.game.options.game_length || 10), cost: m.priceList[a.item], placementFollows: a.item < 3 } : {}) };
  }
  return a.type === 'end_turn' ? { passesTurn: true, discardOnSeven: strategic.economy.discardOnSeven,
    affordableBuildsDeferred: strategic.economy.builds.filter(b => b.available && b.missingCards === 0).map(b => b.name) } : {};
}
function plans(m, strategic) {
  return strategic.economy.builds.filter(b => b.available).map(b => ({
    action: { type: 'plan', item: b.item }, label: `Save and trade toward a ${b.name}`,
    consequences: { cost: b.cost, missing: b.missing, affordableAfterBankTrades: b.affordableAfterBankTrades,
      bankTradesToAfford: b.bankTradesToAfford, projectedRolls: b.projectedRolls, missingWithoutProduction: b.missingWithoutProduction, pointGain: b.pointGain },
    score: (b.item === 2 ? 3 : b.item === 1 ? 2 : 0) - b.missingCards
  }));
}
module.exports = { rules, site, production, funding, economy, summary, consequences, plans };
