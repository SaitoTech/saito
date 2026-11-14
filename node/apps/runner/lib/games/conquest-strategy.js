const Engine = require('../../../../mods/conquest/lib/engine');
const Map = require('../../../../mods/conquest/lib/map');

const rules = {
  victory: 'Eliminate every other player. In two-player games neutral territories need not be conquered. Owner 0 is neutral and never takes a turn; null means unclaimed.',
  income: 'At turn start receive max(3, floor(territories/3)) armies plus bonuses for fully owned continents. Losing one territory breaks a continent bonus.',
  cards: 'Capture at least one territory to earn exactly one card when ending attacks. A set is three matching symbols, three different symbols, or a wild plus any two cards. Sets give 4,6,8,10,12,15, then +5 armies per set globally. Trade at five cards at turn start; elimination at six or more requires trades to four or fewer. One owned traded territory receives +2 once per turn.',
  combat: 'Leave one army in the origin. Attack with 1–3 dice; defense uses up to two. Compare highest dice, ties favor defense. A single-round attack allows stopping afterward. Blitz continues until capture or only one army remains. Probability estimates assume fair independent dice, not knowledge of future rolls.',
  occupation: 'After capture move at least the final attack dice count and leave one behind. Steamroll moves the maximum automatically; otherwise choose occupation separately.',
  campaignMovement: 'Friendly steps to objective front: 0 means adjacent to a target; null means no friendly route currently reaches that front. These are adjacent fortification steps, not permission for connected-path movement. Compare onward attack odds when occupying: do not halve the advancing stack by default. Keep enough strength on the campaign route while accounting for actual origin threats.',
  defenseEstimates: 'Post-movement defense estimates consider current adjacent enemy stacks only, excluding future reinforcements and coordinated attacks.',
  fortification: 'After attacks, move armies once between adjacent friendly territories, leaving one behind; this ends the turn. No connected-path movement.',
  planning: 'Choose a concrete campaign at reinforcement and reassess when its route, losses or income invalidate it. The route is bounded to six captures and may cover only part of an objective. Staging and budget estimates should guide placement, attacks and occupation; a deficit calls for building strength, not assuming the whole route is affordable. Compare progress since selection before renewing: lost footholds, falling income and army losses can invalidate the route. It is advisory: survival, immediate victory and changed conditions take precedence. Intermediate placement amounts can be repeated. Menu selections and planning do not consume game actions.',
  strategy: 'Concentrated forces roll more dice. Balance completing/denying continent income, eliminating players for cards, earning one capture card, and retaining defensible borders. Neutral conquests cost armies without weakening a player. Avoid spending the whole force for a low-value capture.'
};

// Enumerate dice outcomes, independently of the engine RNG and encrypted state.
const distributions = new global.Map();
function losses(attackDice, defenseDice) {
  const key = `${attackDice}:${defenseDice}`;
  if (distributions.has(key)) return distributions.get(key);
  const counts = new global.Map(), dice = [];
  function roll() {
    if (dice.length < attackDice + defenseDice) {
      for (let n = 1; n <= 6; n++) { dice.push(n); roll(); dice.pop(); }
      return;
    }
    const a = dice.slice(0, attackDice).sort((x, y) => y - x);
    const d = dice.slice(attackDice).sort((x, y) => y - x);
    let al = 0, dl = 0;
    for (let i = 0; i < Math.min(a.length, d.length); i++) a[i] > d[i] ? dl++ : al++;
    const outcome = `${al}:${dl}`;
    counts.set(outcome, (counts.get(outcome) || 0) + 1);
  }
  roll();
  const result = [...counts].map(([key, count]) => {
    const [a, d] = key.split(':').map(Number);
    return { a, d, probability: count / 6 ** (attackDice + defenseDice) };
  });
  distributions.set(key, result);
  return result;
}
const oddsCache = new global.Map();
const rounded = n => Math.round(n * 10000) / 10000;
function combatOdds(armies, defenders, blitz = true, dice = Math.min(3, armies - 1)) {
  const attackers = armies - 1, key = `${attackers}:${defenders}:${blitz}:${dice}`;
  if (oddsCache.has(key)) return oddsCache.get(key);
  if (attackers < 1 || defenders < 1) return null;
  // Bound both runtime and memory on unusually long campaigns. Never invent odds.
  if (blitz && (attackers + 1) * (defenders + 1) > 40000) {
    return { method: 'unavailable', reason: 'Exact blitz calculation exceeds 40000 states; single-round estimates remain available.' };
  }
  let win = 0, aRemaining = 0, dRemaining = 0, winArmies = 0;
  if (!blitz) {
    for (const o of losses(dice, Math.min(2, defenders))) {
      const a = attackers - o.a, d = defenders - o.d;
      aRemaining += o.probability * a; dRemaining += o.probability * d;
      if (!d) { win += o.probability; winArmies += o.probability * a; }
    }
  } else {
    const width = defenders + 1, size = (attackers + 1) * width;
    const w = new Float64Array(size), ar = new Float64Array(size), dr = new Float64Array(size), wa = new Float64Array(size);
    for (let d = 1; d <= defenders; d++) dr[d] = d;
    for (let a = 1; a <= attackers; a++) {
      const row = a * width; w[row] = 1; ar[row] = wa[row] = a;
      for (let d = 1; d <= defenders; d++) {
        const i = row + d;
        for (const o of losses(Math.min(dice, a), Math.min(2, d))) {
          const j = (a - o.a) * width + d - o.d;
          w[i] += o.probability * w[j]; ar[i] += o.probability * ar[j];
          dr[i] += o.probability * dr[j]; wa[i] += o.probability * wa[j];
        }
      }
    }
    const i = size - 1; win = w[i]; aRemaining = ar[i]; dRemaining = dr[i]; winArmies = wa[i];
  }
  const result = { method: 'exact-fair-dice', captureProbability: rounded(win),
    expectedAttackerLosses: rounded(attackers - aRemaining), expectedDefenderLosses: rounded(defenders - dRemaining),
    expectedMovableSurvivorsOnCapture: win ? rounded(winArmies / win) : null };
  if (oddsCache.size >= 512) oddsCache.clear();
  oddsCache.set(key, result);
  return result;
}
function border(s, id, owner = s.territories[id].owner) {
  const opponents = Map.territories[id].neighbors.filter(n => s.territories[n].owner !== owner && s.territories[n].owner !== null);
  const attacking = opponents.filter(n => s.territories[n].owner > 0);
  return { neighborsOutsideControl: opponents,
    strongestAdjacentEnemyAttackers: Math.max(0, ...attacking.map(n => s.territories[n].armies - 1)),
    adjacentEnemyArmies: attacking.reduce((sum, n) => sum + s.territories[n].armies, 0) };
}
function attackOutlook(s, seat, from, armies) {
  if (armies <= 1) return [];
  return Map.territories[from].neighbors.filter(to => s.territories[to].owner !== seat && s.territories[to].owner !== null).map(to => ({
    to, owner: s.territories[to].owner, continent: Map.territories[to].continent,
    captureProbability: combatOdds(armies, s.territories[to].armies)?.captureProbability ?? null
  }));
}
function frontDistances(s, seat, plan) {
  const own = Engine.ownedTerritories(s, seat);
  const targets = new Set(plan.kind === 'continent' || plan.kind === 'deny' ?
    (Map.continents[plan.target]?.territories || []).filter(id => s.territories[id].owner !== seat) :
    Object.keys(s.territories).filter(id => s.territories[id].owner > 0 && s.territories[id].owner !== seat && (plan.kind !== 'eliminate' || s.territories[id].owner === plan.target)));
  const distances = Object.fromEntries(own.map(id => [id, null]));
  const queue = own.filter(id => Map.territories[id].neighbors.some(n => targets.has(n)));
  for (const id of queue) distances[id] = 0;
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    for (const n of Map.territories[id].neighbors) if (s.territories[n].owner === seat && distances[n] === null) {
      distances[n] = distances[id] + 1; queue.push(n);
    }
  }
  return distances;
}
function defenseAfter(s, seat, id, armies, captured = null) {
  const enemies = Map.territories[id].neighbors.filter(n => n !== captured && s.territories[n].owner > 0 && s.territories[n].owner !== seat);
  const strongest = Math.max(1, ...enemies.map(n => s.territories[n].armies));
  const continent = Map.continents[Map.territories[id].continent];
  return { armies, strongestEnemyStack: strongest > 1 ? strongest : null,
    captureProbabilityAgainstStrongestCurrentStack: strongest > 1 ? combatOdds(strongest, armies)?.captureProbability ?? null : 0,
    controlledContinentBonusAtRisk: continent.territories.every(t => s.territories[t].owner === seat || t === captured) ? continent.bonus : 0 };
}
function summary(s, seat) {
  return {
    players: s.players.map(p => {
      const owned = Engine.ownedTerritories(s, p.id);
      return { id: p.id, territories: owned.length, armies: owned.reduce((sum, id) => sum + s.territories[id].armies, 0),
        nextTurnIncomeAtCurrentControl: Engine.reinforcementFor(s, p.id), cardCount: p.cardCount,
        eliminationTargets: p.id !== seat ? owned : undefined };
    }),
    continents: Object.fromEntries(Object.entries(Map.continents).map(([id, c]) => {
      const missing = c.territories.filter(t => s.territories[t].owner !== seat);
      const owner = s.territories[c.territories[0]].owner;
      return [id, { bonus: c.bonus, owned: c.territories.length - missing.length, total: c.territories.length,
        controller: owner !== null && c.territories.every(t => s.territories[t].owner === owner) ? owner : null,
        missing, armiesOnMissingTerritories: missing.reduce((sum, t) => sum + s.territories[t].armies, 0),
        externalBorders: c.territories.filter(t => Map.territories[t].neighbors.some(n => !c.territories.includes(n))) }];
    })),
    borders: Object.fromEntries(Engine.ownedTerritories(s, seat).filter(id => border(s, id).neighborsOutsideControl.length)
      .map(id => [id, { armies: s.territories[id].armies, ...border(s, id) }])),
    capturedThisTurn: !!s.capturedThisTurn, nextTradeArmies: Engine.tradeValue(s.tradedSets),
    cardBonusAvailable: !s.cardBonusUsed,
    estimates: 'Combat odds are exact under fair independent dice, rounded to four decimals. Border strength is public arithmetic, not a prediction: multiple enemy armies cannot be combined into one attack.'
  };
}
function consequences(s, seat, a, strategic) {
  const territory = a.territory || a.to;
  if (a.type === 'attack' || a.type === 'claim') {
    const c = Map.territories[territory].continent, continent = strategic.continents[c];
    const owner = s.territories[territory].owner;
    const eliminates = owner > 0 && Engine.ownedTerritories(s, owner).length === 1;
    return { territory, continent: c, completesContinentOnCapture: continent.missing.length === 1,
      bonusDeniedOnCapture: continent.controller > 0 && continent.controller !== seat ? continent.bonus : 0,
      eliminatesPlayerOnCapture: eliminates ? owner : null,
      winsGameOnCaptureAndOccupation: eliminates && s.players.filter(p => !p.eliminated).length === 2,
      cardsCapturedOnElimination: eliminates ? s.players.find(p => p.id === owner).cardCount : 0,
      ...(a.type === 'attack' ? { earnsFirstCaptureCard: !s.capturedThisTurn,
        combat: combatOdds(s.territories[a.from].armies, s.territories[a.to].armies, !!a.blitz, a.dice),
        originExposure: border(s, a.from), targetExposure: border(s, a.to, seat),
        originAfterMaximumAdvance: a.steamroll ? defenseAfter(s, seat, a.from, 1, a.to) : undefined,
        occupation: a.steamroll ? 'Maximum survivors advance; origin retains one army.' : 'Choose how many survivors advance after capture.' } : {}) };
  }
  if (a.type === 'place') return { armiesAfter: s.territories[a.territory].armies + a.count,
    placementOwner: s.territories[a.territory].owner, exposure: border(s, a.territory),
    adjacentAttacksAfterPlacement: s.territories[a.territory].owner === seat ? attackOutlook(s, seat, a.territory, s.territories[a.territory].armies + a.count) : [],
    reinforcementsRemaining: s.phase === 'reinforce' ? s.reinforcements - a.count : undefined };
  if (a.type === 'occupy' || a.type === 'fortify') {
    const from = a.from || s.occupation.from, to = a.to || s.occupation.to;
    return { from, to, originArmiesAfter: s.territories[from].armies - a.count,
      destinationArmiesAfter: s.territories[to].armies + a.count,
      originExposure: border(s, from), destinationExposure: border(s, to),
      onwardAttacksAfterMovement: attackOutlook(s, seat, to, s.territories[to].armies + a.count),
      originDefenseAfter: defenseAfter(s, seat, from, s.territories[from].armies - a.count),
      destinationDefenseAfter: defenseAfter(s, seat, to, s.territories[to].armies + a.count), endsTurn: a.type === 'fortify' };
  }
  if (a.type === 'trade') {
    const bonus = a.cards.map(id => Engine.cards[id].territory).find(id => id && s.territories[id].owner === seat);
    return { reinforcementGain: Engine.tradeValue(s.tradedSets), territoryBonus: !s.cardBonusUsed && bonus ? { territory: bonus, armies: 2 } : null,
      cardsRemaining: s.players.find(p => p.id === seat).cardCount - 3 };
  }
  return { endsTurn: a.type === 'end_turn', captureCardEarned: a.type === 'end_attack' && !!s.capturedThisTurn };
}
function objectives(s, seat, strategic) {
  const result = Object.entries(strategic.continents).filter(([, c]) => c.owned < c.total).map(([target, c]) => ({
    kind: 'continent', target, label: `Work toward controlling ${target} (+${c.bonus} armies/turn)`,
    score: c.owned ? c.bonus * c.owned / (c.missing.length + c.armiesOnMissingTerritories) : -1
  }));
  for (const [target, c] of Object.entries(strategic.continents)) if (c.controller > 0 && c.controller !== seat) result.push({
    kind: 'deny', target, label: `Break enemy control of ${target} (deny ${c.bonus} armies/turn with one capture)`, score: 0
  });
  result.push({ kind: 'defend', target: seat, label: 'Protect income and consolidate vulnerable borders', score: 0 });
  for (const p of strategic.players) if (p.id !== seat && p.territories) result.push({
    kind: 'eliminate', target: p.id, label: `Eliminate player ${p.id} (${p.territories} territories, ${p.cardCount} cards)`, score: -p.territories
  });
  return result;
}
function planMetrics(s, seat, plan) {
  const own = Engine.ownedTerritories(s, seat);
  return { armies: own.reduce((sum, id) => sum + s.territories[id].armies, 0),
    income: Engine.reinforcementFor(s, seat),
    remainingTargets: plan.kind === 'continent' ? Map.continents[plan.target]?.territories.filter(id => s.territories[id].owner !== seat).length :
      plan.kind === 'eliminate' ? Engine.ownedTerritories(s, plan.target).length : null };
}
function planStatus(s, seat, plan) {
  if (!plan || plan.seat !== seat) return null;
  let status = 'active';
  if (plan.kind === 'continent') {
    const c = Map.continents[plan.target];
    if (!c) return null;
    if (c.territories.every(id => s.territories[id].owner === seat)) status = 'completed';
    else if (!c.territories.some(id => s.territories[id].owner === seat)) status = 'no foothold; reassess before committing';
  } else if (plan.kind === 'deny') {
    const c = Map.continents[plan.target];
    if (!c) return null;
    const owner = s.territories[c.territories[0]].owner;
    if (!(owner > 0 && owner !== seat && c.territories.every(id => s.territories[id].owner === owner))) status = 'completed';
  } else if (plan.kind === 'eliminate' && s.players.find(p => p.id === plan.target)?.eliminated) status = 'completed';
  const current = planMetrics(s, seat, plan);
  const progress = plan.startMetrics ? { atSelection: plan.startMetrics, current,
    armiesChange: current.armies - plan.startMetrics.armies, incomeChange: current.income - plan.startMetrics.income,
    targetsRemoved: current.remainingTargets == null || plan.startMetrics.remainingTargets == null ? null : plan.startMetrics.remainingTargets - current.remainingTargets } : null;
  return { kind: plan.kind, target: plan.target, selectedTurn: plan.turn, status, progress, campaign: plan.campaign, friendlyStepsToObjectiveFront: frontDistances(s, seat, plan),
    sequence: plan.kind === 'continent' ? 'Reinforce a connected attack route, capture missing territories, then defend external borders.' :
      plan.kind === 'deny' ? 'Find an affordable entry into the enemy continent, capture one territory to break its bonus, then reassess instead of committing to conquer the whole continent.' :
      plan.kind === 'eliminate' ? 'Build sufficient attack strength, connect attacks through the target holdings, then reassess captured cards and borders.' :
        'Reinforce exposed income territories, avoid costly expansion, and fortify from safe interior positions.',
    abandonWhen: 'Objective completed, route lost, losses make continuation unfavorable, or an immediate survival/victory opportunity takes priority.' };
}
module.exports = { rules, combatOdds, summary, consequences, objectives, planStatus, planMetrics, frontDistances };
