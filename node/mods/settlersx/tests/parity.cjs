#!/usr/bin/env node
/** Run with: node mods/settlersx/tests/parity.cjs
 * Executes both actual game modules with only framework presentation stubbed.
 * No test copy of the game rules is used.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const clone = value => JSON.parse(JSON.stringify(value));
const silent = () => {};
const chain = new Proxy({}, { get: () => () => chain });
global.$ = () => chain;

class Presentation {
  render() {} hide() {} lock() {}
}
class Framework {
  constructor(app) {
    this.app = app; this.styles = []; this.recordOptions = {}; this.clock = {};
    this.animationSequence = []; this.browser_active = 0;
    this.game = { players: [], player: 1, options: {}, queue: [], log: [] };
    this.game_help = new Presentation(); this.racetrack = new Presentation();
  }
  static importFunctions(...types) {
    for (const Type of types) for (const key of Object.getOwnPropertyNames(Type.prototype)) {
      if (key !== 'constructor') this.prototype[key] = Type.prototype[key];
    }
  }
  updateLog() {} endTurn() {} saveGame() {}
}
function load(slug) {
  const filename = path.join(root, 'mods', slug, `${slug}.js`);
  const module = { exports: {} };
  const scopedRequire = request => {
    if (request.includes('gametemplate')) return Framework;
    if (request.includes('/src/') || request.includes('settlersx-integration')) {
      return require(path.resolve(path.dirname(filename), request));
    }
    return Presentation;
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, require: scopedRequire,
    console: { log: silent, warn: silent, error: console.error },
    Math, JSON, setTimeout, clearTimeout, $: global.$
  }, { filename });
  return module.exports;
}
const Original = load('settlers');
const Expedition = load('settlersx');
const GameHexGrid = require(path.join(root, 'lib/saito/ui/game-hexgrid/game-hexgrid'));
function make(Type, count = 3) {
  const game = new Type({ keychain: { returnUsername: name => name } });
  game.game.players = Array.from({ length: count }, (_, i) => `Player ${i + 1}`);
  game.game.options = { game_length: '10', turn_limit: '0' };
  game.rollDice = () => 1;
  game.initializeGame('parity');
  game.game.queue = [];
  game.racetrack.players = game.game.players.map(() => ({ score: 0 }));
  for (const method of ['updateStatus', 'updateLog', 'runAnimationQueue', 'animateHarvest']) game[method] = silent;
  game.formatPlayer = player => `Player ${player}`;
  game.formatResource = resource => resource;
  return game;
}
function same(a, b, label) {
  assert.deepEqual(clone(a), clone(b), label);
}
function statePair(count = 3) { return [make(Original, count), make(Expedition, count)]; }
const tests = [];
function test(name, action) { tests.push({ name, action }); }

test('Rule-bearing action and player modules are unchanged', () => {
  for (const file of ['settlers-actions.js', 'settlers-player.js']) {
    assert.equal(fs.readFileSync(path.join(root, 'mods/settlers/lib/src', file), 'utf8'),
      fs.readFileSync(path.join(root, 'mods/settlersx/lib/src', file), 'utf8'), file);
  }
  const normal = source => source.replace('/settlersx/img/cards/governors_statue.svg', '/settlers/img/welcome3.png');
  assert.equal(normal(fs.readFileSync(path.join(root, 'mods/settlersx/lib/src/settlers-gameloop.js'), 'utf8')),
    fs.readFileSync(path.join(root, 'mods/settlers/lib/src/settlers-gameloop.js'), 'utf8'));
});

test('2, 3 and 4 player initialization, tile/token distributions and deck counts', () => {
  for (const count of [2, 3, 4]) {
    const [a, b] = statePair(count);
    same(a.game.state, b.game.state, 'initial state');
    same(a.game.stats, b.game.stats, 'initial statistics');
    same(a.priceList, b.priceList, 'construction costs');
    same(a.returnHexes().map(x => x.resource), b.returnHexes().map(x => x.resource), 'tile distribution');
    same(a.returnDiceTokens(), b.returnDiceTokens(), 'dice token distribution');
    same(a.returnDevelopmentCards().map(({ card, action, count }) => ({ card, action, count })),
      b.returnDevelopmentCards().map(({ card, action, count }) => ({ card, action, count })), 'development deck');
    assert.equal(b.returnHexes().length, 19);
    assert.equal(b.returnHexes().filter(tile => tile.resource === 'desert').length, count === 2 ? 3 : 1);
    assert.equal(b.returnDiceTokens().length, count === 2 ? 16 : 18);
    assert.equal(b.longest.min, count === 2 ? 6 : 5);
    assert.equal(b.longest.value, count === 2 ? 1 : 2);
    assert.equal(b.largest.value, count === 2 ? 1 : 2);
  }
});

test('Resource costs, trade locks and 4:1 / 3:1 / 2:1 port rates', () => {
  const pair = statePair();
  for (const game of pair) {
    game.game.state.playerTurn = 1;
    game.game.state.hasRolled = true;
    game.game.state.canTrade = true;
    game.game.state.players[0].resources = ['brick', 'wood', 'wheat', 'wool'];
    assert.equal(game.doesPlayerHaveResources(1, ['wood', 'wood']), false);
    assert.equal(game.canPlayerBuildRoad(1), true);
    assert.equal(game.canPlayerBuildCity(1), false);
    same(game.analyzePorts(), { brick: 4, wood: 4, wheat: 4, wool: 4, ore: 4 });
    game.game.state.players[0].ports = ['any', 'wood'];
    same(game.analyzePorts(), { brick: 3, wood: 2, wheat: 3, wool: 3, ore: 3 });
    game.game.state.players[0].resources = ['wood', 'wood'];
    assert.equal(game.canPlayerTradeWithBank(), true);
    game.game.state.canTrade = false;
    assert.equal(game.canPlayerTradeWithBank(), false);
    game.game.state.hasRolled = false;
    assert.equal(game.canPlayerBuildRoad(1), false);
  }
  same(pair[0].game.state, pair[1].game.state);
});

test('Harvest doubles cities, blocks the robber, protects Robin Hood and preserves statistics', () => {
  const pair = statePair(2);
  for (const game of pair) {
    game.game.state.hexes = {
      '1_1': { value: 6, resource: 'wood', robber: true },
      '1_2': { value: 6, resource: 'wheat', robber: false }
    };
    game.game.state.cities = [
      { player: 1, level: 2, neighbours: ['1_1', '1_2'] },
      { player: 2, level: 1, neighbours: ['1_1', '1_2'] }
    ];
    game.game.state.robinhood = 2;
    game.collectHarvest(6, 1);
    same(game.game.state.players[0].resources, ['wheat', 'wheat']);
    same(game.game.state.players[1].resources, ['wood', 'wheat']);
    assert.equal(game.game.stats.blocked.wood[0], 2);
    assert.equal(game.game.stats.production.wheat[0], 2);
  }
  same(pair[0].game.state, pair[1].game.state);
  same(pair[0].game.stats, pair[1].game.stats);
});

test('Largest Army requires three knights and transfers only above incumbent size', () => {
  const pair = statePair();
  for (const game of pair) {
    game.game.state.players[0].knights = 2; game.checkLargestArmy(1);
    assert.equal(game.game.state.largestArmy.player, 0);
    game.game.state.players[0].knights = 3; game.checkLargestArmy(1);
    game.game.state.players[1].knights = 3; game.checkLargestArmy(2);
    assert.equal(game.game.state.largestArmy.player, 1);
    game.game.state.players[1].knights = 4; game.checkLargestArmy(2);
    assert.equal(game.game.state.largestArmy.player, 2);
  }
  same(pair[0].game.state, pair[1].game.state);
  same(pair[0].game.queue, pair[1].game.queue);
});

test('Longest Road uses canonical connected edges and stops at opposing settlements', () => {
  const grid = new GameHexGrid({}, {});
  function extend(vertex, edges = [], vertices = [vertex]) {
    if (edges.length === 6) return { edges, vertices };
    for (const edge of grid.edgesFromVertex(vertex)) {
      const next = grid.verticesFromEdge(edge).find(v => v !== vertex);
      if (!next || vertices.includes(next)) continue;
      const result = extend(next, edges.concat(edge), vertices.concat(next));
      if (result) return result;
    }
  }
  const road = extend('6_1_1');
  assert.equal(road.edges.length, 6);
  for (const count of [2, 3]) {
    const pair = statePair(count);
    for (const game of pair) {
      game.hexgrid = grid;
      game.highlightRoad = silent;
      game.game.state.roads = road.edges.map(edge => ({ player: 1, slot: `road_${edge}` }));
      game.game.state.cities = [{ player: 2, level: 1, slot: `city_${road.vertices[3]}` }];
      assert.equal(game.checkLongestRoad(1), 0);
      assert.equal(game.game.state.players[0].road, 3);
      game.game.state.cities = [];
      assert.equal(game.checkLongestRoad(1), 1);
      assert.equal(game.game.state.longestRoad.size, 6);
      assert.equal(game.game.state.longestRoad.player, 1);
    }
    same(pair[0].game.state, pair[1].game.state);
  }
});

test('Scoring retains Robin Hood protection and winner queue commands', () => {
  for (const count of [2, 3]) {
    const pair = statePair(count);
    for (const game of pair) {
      game.game.state.cities = [{ player: 1, level: 2 }, { player: 1, level: 1 }, { player: 2, level: 1 }];
      game.racetrack.players[1].score = 1;
      game.displayScore();
      assert.equal(game.game.state.players[0].vp, 3);
      if (count === 2) assert.equal(game.game.state.robinhood, 2);
      game.game.state.longestRoad.player = 1;
      game.game.state.largestArmy.player = 1;
      game.game.state.players[0].vpc = 5;
      game.displayScore();
      assert.ok(game.game.queue.includes('winner\t0'));
    }
    same(pair[0].game.state, pair[1].game.state);
    same(pair[0].game.queue, pair[1].game.queue);
  }
});

async function drain(game, command) {
  game.game.queue = [command];
  for (let step = 0; game.game.queue.length && step < 30; step++) {
    const next = game.game.queue.at(-1);
    if (next.startsWith('ACKNOWLEDGE')) { game.game.queue.pop(); continue; }
    assert.equal(await game.handleGameLoop(), 1, next);
  }
  assert.equal(game.game.queue.length, 0, 'queue drained');
}
test('Shared queue executes bank trades, bilateral trade, bounty, monopoly, theft and build refunds', async () => {
  const pair = statePair();
  for (const game of pair) {
    game.game.state.players[0].resources = ['wood', 'wood', 'wood', 'wood', 'ore'];
    game.game.state.players[1].resources = ['brick', 'wheat', 'ore', 'ore'];
    game.game.state.players[2].resources = ['ore', 'wool'];
    await drain(game, 'bank\t1\t4\twood\t1\twheat');
    same(game.game.state.players[0].resources, ['ore', 'wheat']);
    assert.equal(game.game.stats.banked.wood[0], 4);
    await drain(game, 'accept_offer\t2\t1\t{"wheat":1}\t{"brick":1}');
    same(game.game.state.players[0].resources, ['ore', 'brick']);
    await drain(game, 'year_of_plenty\t1\tUnexpected Bounty\t["wool","wool"]');
    await drain(game, 'monopoly\t1\tMonopoly\tore');
    assert.equal(game.countResource(1, 'ore'), 4);
    await drain(game, 'steal_card\t2\t1\twool');
    assert.equal(game.countResource(1, 'wool'), 1);
    assert.equal(game.game.stats.robbed.wool[0], 1);
    const before = game.game.state.players[0].resources.length;
    await drain(game, 'undo_build\t1\t2');
    assert.equal(game.game.state.players[0].resources.length, before + game.priceList[2].length);
  }
  same(pair[0].game.state, pair[1].game.state);
  same(pair[0].game.stats, pair[1].game.stats);
});

(async () => {
  for (const { name, action } of tests) {
    await action();
    console.log(`✓ ${name}`);
  }
  console.log(`\n${tests.length} Settlers / SettlersX parity checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
