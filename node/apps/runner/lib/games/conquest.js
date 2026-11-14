const Engine = require('../../../../mods/conquest/lib/engine');
const Map = require('../../../../mods/conquest/lib/map');
const { decision, selected, hasPending } = require('../decision');
const Strategy = require('./conquest-strategy');
const Campaign = require('./conquest-campaign');
const { MAX_CHOICES, requestFor } = require('../providers/decision-format');
// Leave ample token headroom for Jev: detailed consequences can exceed its
// context window well before reaching 255 actions. Split, never truncate.
const MAX_REQUEST_BYTES = 48000;

const amounts = (min, max) => [...new Set([min, Math.max(min, Math.floor((min + max) / 2)), max])].filter(n => n >= min && n <= max);
const groupKey = (a, depth) => [a.type, a.from || a.territory || a.cards?.[0] || '', a.to || a.cards?.[1] || ''][depth];

class ConquestRunner {
  constructor(mod, { campaigns = true, reassessment = true, risk = true } = {}) {
    this.mod = mod; this.policy = { campaigns, reassessment, risk };
  }
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
        for (const count of amounts(1, max)) if (count > 0) add({ type: 'place', territory, count }, (border(territory) ? 100 : 0) + s.territories[territory].armies + count);
      }
    } else if (s.phase === 'attack') {
      for (const from of own) for (const to of Map.territories[from].neighbors) if (Engine.canAttack(s, from, to)) {
        const score = s.territories[from].armies - s.territories[to].armies + 10;
        for (let dice = 1; dice <= Math.min(3, s.territories[from].armies - 1); dice++)
          add({ type: 'attack', from, to, dice, blitz: false, steamroll: false }, score - 1);
        add({ type: 'attack', from, to, blitz: true, steamroll: false }, score - 0.5);
        add({ type: 'attack', from, to, blitz: true, steamroll: true }, score);
      }
      add({ type: 'end_attack' }, 0);
    } else if (s.phase === 'occupy') {
      for (const count of amounts(s.occupation.min, s.occupation.max)) add({ type: 'occupy', count }, count);
    } else if (s.phase === 'fortify') {
      for (const from of own) for (const to of Map.territories[from].neighbors) if (Engine.canFortify(s, from, to)) {
        for (const count of amounts(1, s.territories[from].armies - 1))
          add({ type: 'fortify', from, to, count }, (!border(from) && border(to) ? 10 : -1) + count / (100 * s.territories[from].armies));
      }
      add({ type: 'end_turn' });
    }
    // Explicit public-state allowlist: never send RNG seeds, deck order, battle secrets or other hands.
    const strategic = Strategy.summary(s, g.player);
    const observation = { game: 'Conquest', seat: g.player, phase: s.phase, turn: s.turn, territories: s.territories,
      players: s.players.map(p => ({ id: p.id, cardCount: p.cardCount, eliminated: p.eliminated })),
      hand: s.players.find(p => p.id === g.player).cards,
      handCards: s.players.find(p => p.id === g.player).cards.map(id => ({ id, ...Engine.cards[id] })), reinforcements: s.reinforcements,
      mustTrade: s.mustTrade, occupation: s.occupation, map: Object.fromEntries(Object.entries(Map.territories).map(([id, t]) => [id, { neighbors: t.neighbors, continent: t.continent }])), continents: Object.fromEntries(Object.entries(Map.continents).map(([id, c]) => [id, { name: c.name, bonus: c.bonus, territories: c.territories }])),
      rules: Strategy.rules, strategic, plan: Strategy.planStatus(s, g.player, g.runnerConquestPlan),
      recentActions: (g.runnerConquestHistory || []).filter(h => h.seat === g.player),
      setup: s.phase === 'setup' ? { neutral: s.setupNeutral, placementsLeft: s.setupPlacementsLeft, remaining: s.setupRemaining } : undefined };
    const reviewReasons = this.policy.campaigns && this.policy.reassessment ? Campaign.reassess(s, g.player, g.runnerConquestPlan, g.conquestRevision) : [];
    // Mandatory trades/occupation take precedence; reviews are local decisions.
    if ((s.phase === 'reinforce' && !s.mustTrade &&
        (g.runnerConquestPlan?.turn !== s.turn || g.runnerConquestPlan?.seat !== g.player)) || reviewReasons.length) {
      return decision(g.id, g.conquestRevision, { ...observation, reviewReasons, decision: 'Choose or renew the campaign; compare route, budget and current prospects' },
        Strategy.objectives(s, g.player, strategic).map(({ kind, target, label, score }) => ({
          action: { type: 'plan', kind, target }, label, score,
          consequences: { friendlyStepsToObjectiveFront: Strategy.frontDistances(s, g.player, { kind, target }),
            ...(this.policy.campaigns ? { campaign: Campaign.build(s, g.player, { kind, target }) } : {}) }
        })));
    }
    for (const choice of actions) {
      choice.consequences = Strategy.consequences(s, g.player, choice.action, strategic);
      if (this.policy.campaigns) choice.consequences.campaignExecution = Campaign.execution(s, g.player, g.runnerConquestPlan, choice.action);
    }
    if (this.policy.risk && s.phase === 'attack') {
      const safeCaptureExists = actions.some(c => c.action.type === 'attack' && c.action.blitz && c.consequences.combat?.captureProbability >= 0.65);
      let blocked = 0;
      for (let i = actions.length - 1; i >= 0; i--) {
        const assessment = Campaign.risk(s, g.player, actions[i].action, actions[i].consequences, safeCaptureExists);
        if (assessment) actions[i].consequences.attackRisk = assessment;
        if (assessment && !assessment.allowed) { actions.splice(i, 1); blocked++; }
      }
      observation.tacticalPolicy = { blockedLowOddsAttacks: blocked, threshold: 0.5, saferCardAlternativeThreshold: 0.65 };
    }
    const full = decision(g.id, g.conquestRevision, observation, actions);
    const fits = choices => choices.length < MAX_CHOICES && Buffer.byteLength(JSON.stringify(requestFor({ ...full, choices }))) <= MAX_REQUEST_BYTES;
    if (fits(full.choices)) return full;
    // Save only a path through the menu, bound to the exact decision. No choices
    // are dropped, and a board/plan change automatically discards the old path.
    const path = g.runnerConquestSelection?.base === full.id ? g.runnerConquestSelection.path : [];
    let candidates = actions;
    for (let depth = 0; depth < path.length; depth++) candidates = candidates.filter(c => groupKey(c.action, depth) === path[depth]);
    const back = path.length ? [{
      action: { type: 'select_group', base: full.id, path: path.slice(0, -1) },
      label: 'Back to the previous selection', score: -100000, consequences: { selectionOnly: true }
    }] : [];
    const candidateMenu = decision(g.id, g.conquestRevision, { ...observation, selection: path }, [...candidates, ...back]);
    if (candidateMenu.choices.length > MAX_CHOICES || Buffer.byteLength(JSON.stringify(requestFor(candidateMenu))) > MAX_REQUEST_BYTES) {
      const groups = new global.Map();
      for (const choice of candidates) {
        const key = groupKey(choice.action, path.length);
        if (key === undefined) throw Error('Conquest action grouping exhausted');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(choice);
      }
      candidates = [...groups].map(([key, choices]) => ({
        action: { type: 'select_group', base: full.id, path: [...path, key] },
        label: `Select ${key}: ${choices.length} choices`, score: Math.max(...choices.map(c => c.score)),
        consequences: { selectionOnly: true, targets: [...new Set(choices.map(c => c.action.to || c.action.territory).filter(Boolean))],
          bestCaptureProbability: Math.max(0, ...choices.map(c => c.consequences?.combat?.captureProbability || 0)),
          canCompleteContinent: choices.some(c => c.consequences?.completesContinentOnCapture),
          canEliminatePlayer: choices.some(c => c.consequences?.eliminatesPlayerOnCapture) }
      }));
    }
    candidates = [...candidates, ...back];
    const grouped = decision(g.id, g.conquestRevision, { ...observation, selection: path }, candidates);
    if (grouped.choices.length > MAX_CHOICES || Buffer.byteLength(JSON.stringify(requestFor(grouped))) > MAX_REQUEST_BYTES)
      throw Error('Conquest grouped decision exceeds request budget');
    return grouped;

  }
  async submit(id, choiceId) {
    const choice = selected(this.current(), id, choiceId);
    const g = this.mod.game, a = choice.action, turn = g.state.turn;
    if (a.type === 'plan') {
      g.runnerConquestPlan = { seat: g.player, turn: g.state.turn, kind: a.kind, target: a.target, startMetrics: Strategy.planMetrics(g.state, g.player, a) };
      if (this.policy.campaigns) {
        g.runnerConquestPlan.campaign = Campaign.build(g.state, g.player, a);
        g.runnerConquestPlan.reviewAnchor = Campaign.anchor(g.state, g.player);
        g.runnerConquestPlan.reviewedRevision = g.conquestRevision;
      }
      delete g.runnerConquestSelection;
      await this.mod.saveGame(g.id);
      return;
    }
    if (a.type === 'select_group') {
      g.runnerConquestSelection = { base: a.base, path: a.path };
      await this.mod.saveGame(g.id);
      return;
    }
    await this.mod.submitAction(a);
    delete g.runnerConquestSelection;
    g.runnerConquestHistory = [...(g.runnerConquestHistory || []), { seat: g.player, turn, action: a }].slice(-6);
    await this.mod.saveGame(g.id);
  }
}
module.exports = ConquestRunner;
module.exports.MAX_REQUEST_BYTES = MAX_REQUEST_BYTES;
