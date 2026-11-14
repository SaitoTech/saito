// Public-board planning plus our own hand only. No simulated draws, hidden hands,
// engine queue execution or RNG access. All projected times are rate estimates.
const S = require('./settlers-strategy');
const Network = require('./settlers-network');
const sum = values => Object.values(values).reduce((n, v) => n + v, 0);
const counts = (m, hand) => Object.fromEntries(m.returnResources().map(r => [r, hand.filter(x => x === r).length]));
const same = require('node:util').isDeepStrictEqual;
function rates(m, ports) {
  return Object.fromEntries(m.returnResources().map(r => [r, ports.includes(r) ? 2 : ports.includes('any') ? 3 : 4]));
}
function openings(m, choices) {
  const p = m.game.player, own = m.game.state.cities.filter(c => c.player === p);
  const vertices = m.runner.vertices().filter(v => m.runner.vacant(v) && ![14, 15].includes(m.runner.value(v)));
  const info = new Map(vertices.map(v => [v, S.site(m, v)]));
  const existing = S.production(m, p), ports = m.game.state.players[p - 1].ports || [];
  const evaluate = (first, second) => {
    const a = info.get(first), b = second ? info.get(second) : null;
    const income = Object.fromEntries(m.returnResources().map(r => [r, existing[r] + a.productionPerRoll[r] + (b?.productionPerRoll[r] || 0)]));
    const exchange = rates(m, [...ports, ...a.ports, ...(b?.ports || [])]);
    const initial = counts(m, (b || a).startingResources);
    const settlement = S.funding(counts(m, [...m.priceList[0], ...m.priceList[1]]), initial, exchange, income).projectedRolls;
    const city = S.funding(counts(m, m.priceList[2]), initial, exchange, income).projectedRolls;
    const missing = m.returnResources().filter(r => !income[r]);
    const value = sum(income) * 8 - Math.min(settlement ?? 80, city ?? 80) * 0.45 - ((settlement ?? 80) + (city ?? 80)) * 0.12 - missing.length * 0.6;
    return { partner: second || own[0]?.slot.slice(5), production: income, bankRates: exchange,
      settlementWithRoadRolls: settlement, cityRolls: city, missing, value };
  };
  return new Map(choices.filter(c => c.action.type === 'town').map(c => {
    const v = c.action.vertex;
    const alternatives = own.length ? [evaluate(v)] : vertices.filter(w => w !== v && !m.hexgrid.adjacentVertices(v).includes(w)).map(w => evaluate(v, w));
    alternatives.sort((a, b) => b.value - a.value || String(a.partner).localeCompare(String(b.partner)));
    const best = alternatives[0];
    return [v, best ? { ...best, value: Math.round(best.value * 100) / 100,
      alternativePartners: own.length ? undefined : alternatives.slice(1, 3).map(x => x.partner),
      assumption: own.length ? 'Actual pair; includes second-settlement starting resources.' : 'Best currently legal second site; opponents may occupy it before the second placement.' } : null];
  }));
}
function remainingRoads(m, goal) {
  return (goal.route || []).filter(e => !m.game.state.roads.some(r => r.player === m.game.player && r.slot === 'road_' + e));
}
function status(m, goal) {
  if (!goal || !Number.isInteger(goal.item)) return { valid: false, reason: 'No concrete objective' };
  const s = m.game.state, p = m.game.player, own = s.players[p - 1];
  if (goal.item === 3) return { valid: m.game.deck[0].crypt.length > 0, reason: 'Development deck exhausted' };
  if (goal.item === 2) {
    const c = s.cities.find(c => c.slot === 'city_' + goal.vertex && c.player === p);
    return { valid: !!c && c.level === 1 && own.cities > 0, completed: c?.level === 2, reason: 'City target unavailable' };
  }
  if (goal.item === 1) {
    const c = s.cities.find(c => c.slot === 'city_' + goal.vertex);
    if (c) return { valid: false, completed: c.player === p, reason: 'Settlement site occupied' };
    if (!own.towns || !m.runner.vacant(goal.vertex)) return { valid: false, reason: 'Settlement distance rule or no pieces' };
  }
  for (const edge of remainingRoads(m, goal)) {
    if (s.roads.some(r => r.slot === 'road_' + edge && r.player !== p)) return { valid: false, reason: 'Opponent occupied route' };
    if (m.hexgrid.verticesFromEdge(edge).some(v => s.cities.some(c => c.slot === 'city_' + v && c.player !== p)))
      return { valid: false, reason: 'Opponent building blocks route' };
  }
  if (goal.item === 0 && !remainingRoads(m, goal).length) return { valid: false, completed: true, reason: 'Road objective reached' };
  return { valid: true };
}
function cost(m, goal) {
  const roads = remainingRoads(m, goal).flatMap(() => m.priceList[0]);
  return goal.item === 0 ? roads : [...roads, ...m.priceList[goal.item]];
}
function race(m) {
  const s = m.game.state, p = m.game.player, target = Number(m.game.options.game_length || 10);
  const threats = s.players.map((player, i) => ({ seat: i + 1, vp: player.vp,
    pointsNeeded: Math.max(0, target - player.vp), handSize: player.resources.length,
    availableCityUpgrades: s.cities.filter(c => c.player === i + 1 && c.level === 1).length,
    settlementSites: m.returnCitySlotsAdjacentToPlayerRoads(i + 1).map(v => v.slice(5)),
    knightsToArmy: s.largestArmy.player === i + 1 ? 0 : Math.max(3, (s.largestArmy.size || 0) + 1) - (player.knights || 0)
  })).filter(x => x.seat !== p);
  return { pointsNeeded: Math.max(0, target - s.players[p - 1].vp), urgent: s.players.some(x => x.vp >= target - 2),
    opponents: threats, uncertainty: 'Opponent hand identities and unplayed cards are unknown; these are public scoring opportunities, not guaranteed wins.' };
}
function describe(m, goal, hand, strategic, urgency) {
  const required = counts(m, cost(m, goal)), inventory = counts(m, hand), income = strategic.players[m.game.player - 1].productionPerRoll;
  const funding = S.funding(required, inventory, m.analyzePorts(), income);
  const site = goal.vertex ? S.site(m, goal.vertex) : null;
  const newPorts = site?.ports.filter(port => !m.game.state.players[m.game.player - 1].ports.includes(port)) || [];
  const roads = remainingRoads(m, goal);
  let award = 0;
  if (roads.length) {
    // Evaluate the complete route against a copied public road array.
    const view = Object.create(m); view.game = { ...m.game, state: { ...m.game.state,
      roads: [...m.game.state.roads, ...roads.map(e => ({ player: m.game.player, slot: 'road_' + e }))] } };
    const length = Network.longestRoad(view, m.game.player);
    const current = m.game.state.longestRoad;
    if (length.exact && current.player !== m.game.player && length.length >= Math.max(m.longest.min || 5, current.player ? current.size + 1 : 0)) award = m.longest.value;
  }
  const points = ([1, 2].includes(goal.item) ? 1 : 0) + award;
  const newIncome = site ? sum(site.productionPerRoll) : 0;
  const blockedOpponents = goal.item === 1 ? urgency.opponents.filter(t => t.settlementSites.some(v => v === goal.vertex || m.hexgrid.adjacentVertices(goal.vertex).includes(v))).map(t => t.seat) : [];
  const improvedRates = rates(m, [...m.game.state.players[m.game.player - 1].ports, ...newPorts]);
  const exchangeIncomeGain = sum(Object.fromEntries(m.returnResources().map(r => [r, income[r] / improvedRates[r] - income[r] / m.analyzePorts()[r]])));
  const turns = funding.projectedRolls ?? 80;
  const value = (points >= urgency.pointsNeeded && points > 0 ? 1000 : 0) + points * (urgency.urgent ? 12 : 6) +
    newIncome * (urgency.urgent ? 3 : 14) + exchangeIncomeGain * 20 + blockedOpponents.length * (urgency.urgent ? 4 : 1) - turns * 0.4 - roads.length * 0.4;
  return { goal, cost: required, ...funding, roadsRemaining: roads, pointGain: points,
    wins: points > 0 && points >= urgency.pointsNeeded, productionGain: site?.productionPerRoll, newPorts, exchangeIncomeGain, blockedOpponents,
    value: Math.round(value * 100) / 100 };
}
function finishes(m, descriptions, hand, strategic) {
  const needed = race(m).pointsNeeded;
  if (needed < 1 || needed > 2) return [];
  const builds = descriptions.filter(d => [1, 2].includes(d.goal.item) && !d.roadsRemaining.length);
  const routes = [];
  for (let i = 0; i < builds.length; i++) for (let j = i + 1; j < builds.length; j++) {
    const a = builds[i], b = builds[j], own = m.game.state.players[m.game.player - 1];
    if (a.goal.item === 1 && b.goal.item === 1 && (own.towns < 2 || m.hexgrid.adjacentVertices(a.goal.vertex).includes(b.goal.vertex))) continue;
    if (a.goal.item === 2 && b.goal.item === 2 && own.cities < 2) continue;
    const required = counts(m, [...cost(m, a.goal), ...cost(m, b.goal)]);
    const f = S.funding(required, counts(m, hand), m.analyzePorts(), strategic.players[m.game.player - 1].productionPerRoll);
    routes.push({ goals: [a.goal, b.goal], cost: required, pointGain: 2, ...f,
      assumption: 'Funds both existing build sites; all bank exchanges must precede spending.' });
  }
  return routes.sort((a, b) => (a.projectedRolls ?? 80) - (b.projectedRolls ?? 80)).slice(0, 3);
}
function goals(m, hand, strategic) {
  const s = m.game.state, p = m.game.player, own = s.players[p - 1], result = [], urgency = race(m);
  if (own.cities) for (const c of s.cities.filter(c => c.player === p && c.level === 1)) result.push({ item: 2, vertex: c.slot.slice(5) });
  if (own.towns) for (const r of Network.expansion(m)) result.push({ item: 1, vertex: r.vertex, route: r.route });
  // A road-only goal must have a measurable award or defensive purpose. Other
  // legal roads remain accessible through the individual-actions menu.
  for (const edge of m.runner.roads()) {
    const goal = { item: 0, route: [edge] }, d = describe(m, goal, hand, strategic, urgency);
    if (d.pointGain > 0) result.push(goal);
  }
  if (m.game.deck[0].crypt.length) result.push({ item: 3 });
  const plan = m.game.runnerSettlersPlan;
  if (plan?.goal && status(m, plan.goal).valid && !result.some(g => same(g, plan.goal))) result.push(plan.goal);
  return result.map(g => describe(m, g, hand, strategic, urgency)).sort((a, b) => b.value - a.value || JSON.stringify(a.goal).localeCompare(JSON.stringify(b.goal)));
}
function sequence(m, description, hand) {
  const { goal } = description;
  if (!status(m, goal).valid) return null;
  const inventory = counts(m, hand), required = counts(m, cost(m, goal));
  const funding = S.funding(required, inventory, m.analyzePorts(), S.production(m, m.game.player));
  if (!funding.bankTradesToAfford || (funding.bankTradesToAfford.length && !m.game.state.canTrade)) return null;
  const steps = funding.bankTradesToAfford.map(t => ({ type: 'bank', ...t }));
  for (const edge of remainingRoads(m, goal)) steps.push({ type: 'buy', item: 0 }, { type: 'road', edge });
  if (goal.item === 1) steps.push({ type: 'buy', item: 1 }, { type: 'town', vertex: goal.vertex });
  if (goal.item === 2) steps.push({ type: 'buy', item: 2 }, { type: 'city', slot: 'city_' + goal.vertex });
  if (goal.item === 3) steps.push({ type: 'buy', item: 3 });
  // Hard bound on deterministic execution; long ambitions remain advisory.
  if (steps.length > 16) return null;
  return steps;
}
function label(goal) {
  return goal.item === 3 ? 'Buy a development card' : goal.item === 2 ? `Upgrade city_${goal.vertex}` :
    goal.item === 1 ? `Settle ${goal.vertex} via ${(goal.route || []).length} new roads` : `Take Longest Road via ${goal.route.join(', ')}`;
}
function planChoices(m, descriptions) {
  const selected = descriptions.slice(0, 10);
  const active = m.game.runnerSettlersPlan?.goal;
  const keep = descriptions.find(d => same(d.goal, active));
  if (keep && !selected.includes(keep)) selected.push(keep);
  return selected.map(d => ({ action: { type: 'plan', item: d.goal.item, goal: d.goal },
    label: label(d.goal), consequences: d, score: d.value }));
}
function actionChoices(m, legal, descriptions, hand, strategic) {
  const options = [];
  for (const finish of finishes(m, descriptions, hand, strategic)) {
    if (!finish.bankTradesToAfford || (finish.bankTradesToAfford.length && !m.game.state.canTrade)) continue;
    const steps = finish.bankTradesToAfford.map(t => ({ type: 'bank', ...t }));
    for (const g of finish.goals) steps.push({ type: 'buy', item: g.item }, g.item === 2 ? { type: 'city', slot: 'city_' + g.vertex } : { type: 'town', vertex: g.vertex });
    if (steps.length <= 16 && legal.some(c => same(c.action, steps[0]))) options.push({
      action: { type: 'execute', goal: finish.goals[0], goals: finish.goals, steps }, label: 'Win by completing both builds now',
      consequences: { ...finish, steps, wins: true }, score: 2000 });
  }
  for (const d of descriptions) {
    const steps = sequence(m, d, hand);
    if (steps?.length && legal.some(c => same(c.action, steps[0]))) options.push({ action: { type: 'execute', goal: d.goal, steps },
      label: label(d.goal) + ' now', consequences: { ...d, steps, tradingBeforeSpending: true }, score: d.value });
  }
  const plan = m.game.runnerSettlersPlan;
  // Card outcomes remain explicit choices. Never guess a drawn/stolen resource.
  options.push(...legal.filter(c => c.action.type === 'card'));
  const wait = legal.find(c => c.action.type === 'end_turn');
  if (wait) options.push({ ...wait, label: 'Keep resources and wait for production', consequences: { ...wait.consequences,
    retainedResources: strategic.economy.counts, objective: plan?.goal,
    objectiveFunding: descriptions.find(d => same(d.goal, plan?.goal))?.projectedRolls }, score: -1 });
  // Retain access to every raw legal move, without mixing incomplete trades into
  // the complete-sequence comparison. Selection itself never sends a game move.
  options.push({ action: { type: 'manual' }, label: 'Leave sequence planning and choose an individual move',
    consequences: { immediatelyAffordableBuilds: legal.filter(c => c.action.type === 'buy').map(c => c.action.item),
      completeFundedSequencesAvailable: options.filter(c => c.action.type === 'execute').length,
      caution: 'This menu does not create resources or unlock another build. Incomplete bank exchanges can consume reserved ingredients.' }, score: -100 });
  if (m.game.runnerSettlersReplannedTurn !== (m.game.runnerSettlersTurn || 0))
    options.push({ action: { type: 'replan' }, label: 'Change the longer-term destination (once this turn)', score: -100 });
  return options;
}
function continuation(m, legal) {
  const seq = m.game.runnerSettlersSequence;
  if (!seq?.steps.length || seq.turn !== (m.game.runnerSettlersTurn || 0)) return null;
  if ((seq.goals || [seq.goal]).some(g => { const s = status(m, g); return !s.valid && !s.completed; })) return null;
  return legal.find(c => same(c.action, seq.steps[0])) || null;
}
module.exports = { openings, goals, race, status, cost, sequence, label, planChoices, actionChoices, continuation, finishes, same };
