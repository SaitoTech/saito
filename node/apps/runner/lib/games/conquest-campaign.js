// Public-board campaign estimates and tactical policy. Never reads hands or RNG.
const Engine = require('../../../../mods/conquest/lib/engine');
const Map = require('../../../../mods/conquest/lib/map');
const Strategy = require('./conquest-strategy');
const cost = s => id => Math.ceil(s.territories[id].armies * 1.25) + 1;
const losses = (s, seat) => s.statistics?.totals?.[seat]?.lost || 0;
function targets(s, seat, objective) {
  if (['continent', 'deny'].includes(objective.kind)) return (Map.continents[objective.target]?.territories || []).filter(id => s.territories[id].owner !== seat);
  return Object.keys(s.territories).filter(id => s.territories[id].owner > 0 && s.territories[id].owner !== seat && (objective.kind !== 'eliminate' || s.territories[id].owner === objective.target));
}
function threatenedIncome(s, seat) {
  return Object.values(Map.continents).filter(c => c.territories.every(id => s.territories[id].owner === seat))
    .flatMap(c => c.territories.filter(id => Map.territories[id].neighbors.some(n => s.territories[n].owner > 0 && s.territories[n].owner !== seat && s.territories[n].armies > s.territories[id].armies + 1)));
}
// A route cannot march through an already friendly territory: that requires a
// separate adjacent fortification. Dijkstra finds a cheap hostile bridge instead.
function pathTo(s, seat, start, wanted, visited, limit) {
  const queue = [{ id: start, path: [], cost: 0 }], best = new global.Map();
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id));
    const node = queue.shift();
    const key = `${node.id}:${node.path.length}`;
    if ((best.get(key) ?? Infinity) <= node.cost) continue;
    best.set(key, node.cost);
    if (node.path.length && wanted.has(node.id)) return node.path;
    if (node.path.length >= limit) continue;
    for (const n of Map.territories[node.id].neighbors) if (s.territories[n].owner !== seat && s.territories[n].owner !== null && !visited.has(n) && !node.path.includes(n))
      queue.push({ id: n, path: [...node.path, n], cost: node.cost + cost(s)(n) });
  }
  return [];
}
function build(s, seat, objective) {
  const own = Engine.ownedTerritories(s, seat), wanted = targets(s, seat, objective);
  const reinforcements = s.phase === 'reinforce' ? s.reinforcements : 0;
  let best;
  for (const staging of own) {
    const route = [], visited = new Set([staging]); let current = staging;
    if (objective.kind !== 'defend') while (route.length < 6) {
      const remaining = new Set(wanted.filter(id => !visited.has(id)));
      const path = pathTo(s, seat, current, remaining, visited, 6 - route.length);
      if (!path.length) break;
      for (const id of path) { route.push(id); visited.add(id); }
      current = route.at(-1);
      if (objective.kind === 'deny') break;
    }
    const continent = Map.continents[Map.territories[staging].continent];
    const protectsIncome = continent.territories.every(id => s.territories[id].owner === seat);
    const enemyStrength = path => Math.max(0, ...Map.territories[staging].neighbors.filter(n => !path.includes(n) && s.territories[n].owner > 0 && s.territories[n].owner !== seat).map(n => s.territories[n].armies - 1));
    const reserveFor = path => protectsIncome || objective.kind === 'defend' ? Math.max(1, enemyStrength(path) + 1) : 1;
    const budgetFor = path => path.reduce((sum, id) => sum + cost(s)(id), 0) + (path.length ? 2 : 0);
    const availableStack = s.territories[staging].armies + reinforcements;
    // Prefer an affordable prefix ending at an objective target. If even the
    // first target is unaffordable, show that minimum route's funding deficit.
    if (route.length) {
      let length = route.findIndex(id => wanted.includes(id)) + 1;
      for (let n = length; n <= route.length; n++) if (wanted.includes(route[n - 1]) && reserveFor(route.slice(0, n)) + budgetFor(route.slice(0, n)) <= availableStack) length = n;
      route.splice(length);
    }
    const enemyStack = enemyStrength(route), defensiveReserve = reserveFor(route);
    const attackBudget = budgetFor(route), requiredStack = defensiveReserve + attackBudget;
    const deficit = Math.max(0, requiredStack - availableStack);
    const covered = route.filter(id => wanted.includes(id)).length;
    const rank = objective.kind === 'defend' ? enemyStack - s.territories[staging].armies : covered * 4 - deficit * 3 - attackBudget * 0.1;
    if (!best || (route.length && !best.route.length && objective.kind !== 'defend') || (Boolean(route.length) === Boolean(best.route.length) && rank > best.rank))
      best = { staging, route, defensiveReserve, attackBudget, requiredStack, availableStack, deficit,
        suggestedPlacement: Math.min(reinforcements, Math.max(0, requiredStack - s.territories[staging].armies)),
        targetsCovered: covered, totalTargets: wanted.length, rank };
  }
  if (!best) return null;
  delete best.rank;
  return { ...best, estimate: 'Conservative arithmetic: ceil(1.25 * defenders) + one garrison per capture, plus two mobile armies. Not a survival probability or guarantee.',
    stop: { minimumCaptureProbability: 0.55, lossBudget: Math.max(3, Math.ceil(Strategy.planMetrics(s, seat, objective).armies * 0.25)),
      conditions: ['Reassess when route or objective completes', 'Reassess if the next stack cannot meet the estimate', 'Preserve origin reserve unless survival or immediate victory takes precedence'] } };
}
function anchor(s, seat) { return { lost: losses(s, seat), threatenedIncome: threatenedIncome(s, seat) }; }
function reassess(s, seat, plan, revision) {
  if (!plan || plan.seat !== seat || s.mustTrade || !['reinforce', 'attack', 'fortify'].includes(s.phase)) return [];
  if (plan.reviewedRevision === revision && plan.turn === s.turn) return [];
  if (!plan.campaign || !plan.reviewAnchor) return ['upgrade legacy objective to an executable campaign'];
  const reasons = [], status = Strategy.planStatus(s, seat, plan);
  if (status?.status === 'completed') reasons.push('objective completed');
  const route = plan.campaign.route;
  if (route.length && route.every(id => s.territories[id].owner === seat)) reasons.push('bounded route completed; extend or replace it');
  if (s.territories[plan.campaign.staging]?.owner !== seat) reasons.push('staging foothold lost');
  if (losses(s, seat) - plan.reviewAnchor.lost >= plan.campaign.stop.lossBudget) reasons.push('campaign loss budget exhausted');
  if (threatenedIncome(s, seat).some(id => !plan.reviewAnchor.threatenedIncome.includes(id))) reasons.push('new exposure of controlled continent income');
  if (status?.progress?.incomeChange < 0) reasons.push('reinforcement income fell');
  const index = route.findIndex(id => s.territories[id].owner !== seat);
  if (index >= 0 && s.phase === 'attack') {
    const from = index ? route[index - 1] : plan.campaign.staging;
    if (s.territories[from].owner !== seat) reasons.push('attack route lost');
    else {
      const odds = Strategy.combatOdds(s.territories[from].armies, s.territories[route[index]].armies);
      if ((odds?.captureProbability ?? 0) < plan.campaign.stop.minimumCaptureProbability) reasons.push('next attack no longer meets campaign odds');
    }
  }
  return reasons;
}
function risk(s, seat, action, effects, safeCaptureExists) {
  if (action.type !== 'attack') return null;
  // Use full-battle odds even for one-round attacks: zero chance to capture a
  // large defender in a single roll does not itself make that roll unsound.
  const probability = Strategy.combatOdds(s.territories[action.from].armies, s.territories[action.to].armies)?.captureProbability;
  const own = Engine.ownedTerritories(s, seat), ownArmies = own.reduce((sum, id) => sum + s.territories[id].armies, 0);
  const enemyArmies = Object.values(s.territories).filter(t => t.owner > 0 && t.owner !== seat).reduce((sum, t) => sum + t.armies, 0);
  const payoffs = [];
  if (effects.winsGameOnCaptureAndOccupation) payoffs.push('immediate victory');
  else if (effects.eliminatesPlayerOnCapture) payoffs.push('player elimination');
  if (effects.bonusDeniedOnCapture) payoffs.push('break enemy continent income');
  if (effects.completesContinentOnCapture) payoffs.push('complete own continent income');
  if (!s.capturedThisTurn && !safeCaptureExists) payoffs.push('first capture card with no available 65% alternative');
  if (own.length <= 3 && enemyArmies >= ownArmies * 2) payoffs.push('desperate survival: at most three territories and outnumbered at least two to one');
  const lowOdds = probability !== undefined && probability < 0.5;
  return { fullBattleCaptureProbability: probability ?? null, lowOdds, payoffs, allowed: !lowOdds || payoffs.length > 0,
    rule: 'Below 50% needs an explicit payoff; unknown odds are not treated as safe estimates.' };
}
function execution(s, seat, plan, a) {
  if (!plan?.campaign) return null;
  const c = plan.campaign, next = c.route.find(id => s.territories[id].owner !== seat);
  const result = { nextTarget: next || null };
  if (a.type === 'place') return { ...result, reinforcesStaging: a.territory === c.staging, stagingDeficitAfter: Math.max(0, c.requiredStack - s.territories[c.staging].armies - (a.territory === c.staging ? a.count : 0)) };
  if (a.type === 'attack') return { ...result, followsRoute: a.to === next };
  if (['occupy', 'fortify'].includes(a.type)) {
    const from = a.from || s.occupation.from, to = a.to || s.occupation.to;
    const reserve = from === c.staging ? c.defensiveReserve : 1;
    const distances = Strategy.frontDistances(s, seat, plan);
    return { ...result, suggestedAdvance: Math.max(a.type === 'occupy' ? s.occupation.min : 1, s.territories[from].armies - reserve),
      reserveRemaining: s.territories[from].armies - a.count, desiredOriginReserve: reserve,
      friendlyStepsToFrontBefore: distances[from], friendlyStepsToFrontAfter: distances[to] };
  }
  return result;
}
module.exports = { build, anchor, reassess, risk, execution };
