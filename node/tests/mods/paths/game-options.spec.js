const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const root = path.join(__dirname, '../../../mods/paths/src');
const playerSrc = fs.readFileSync(path.join(root, 'paths-player.js'), 'utf8');
const loopSrc = fs.readFileSync(path.join(root, 'paths-gameloop.js'), 'utf8');
const cardSrc = fs.readFileSync(path.join(root, 'paths-cards.js'), 'utf8');
const displaySrc = fs.readFileSync(path.join(root, 'paths-display.js'), 'utf8');

function method(source, name) {
  const needle = `${name}(`;
  let head = -1;
  let from = 0;
  while (from < source.length) {
    const found = source.indexOf(needle, from);
    if (found < 0) { break; }
    const open = source.indexOf('{', found);
    const semi = source.indexOf(';', found);
    if (open >= 0 && (semi < 0 || open < semi)) {
      head = found;
      break;
    }
    from = found + needle.length;
  }
  if (head < 0) { throw new Error(`missing ${name}`); }
  const open = source.indexOf('{', head);
  let depth = 0;
  let quote = '';
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) { quote = ''; }
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i);
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      i = source.indexOf('*/', i + 2) + 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') { depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const asyncPrefix = source.slice(Math.max(0, head - 6), head).includes('async');
        const body = source.slice(source.indexOf('(', head), i + 1);
        return new Function(`return ${asyncPrefix ? 'async ' : ''}function ${name}${body}`)();
      }
    }
  }
  throw new Error(`unclosed ${name}`);
}

const api = {
  mayOfferPeaceTerms: method(playerSrc, 'mayOfferPeaceTerms'),
  returnCardsAvailableToPlay: method(playerSrc, 'returnCardsAvailableToPlay'),
  returnPlayerHand: method(playerSrc, 'returnPlayerHand'),
  playerTurn: method(playerSrc, 'playerTurn'),
  playerPlayAutomaticOperation: method(playerSrc, 'playerPlayAutomaticOperation'),
  playerMakePeaceOffer: method(playerSrc, 'playerMakePeaceOffer'),
  evaluatePeaceOffer: method(loopSrc, 'evaluatePeaceOffer'),
  popup: method(cardSrc, 'popup'),
  returnCardImage: method(displaySrc, 'returnCardImage')
};

function game(vp) {
  return {
    player: 1,
    players: ['central-key', 'allied-key'],
    queue: ['play\tcentral'],
    deck: [
      { hand: ['cp02', 'cp03'], cards: {}, discards: {} },
      { hand: ['ap02'], cards: {}, discards: {} }
    ],
    state: {
      turn: 4,
      round: 2,
      rules: { peace_terms: true, guns_must_event: false },
      events: {},
      general_records_track: { combined_war_status: 10, vp }
    },
    spaces: {}
  };
}

function harness(vp = 10) {
  const mod = {
    game: game(vp),
    moves: [],
    ended: false,
    hud: {
      updateStatus() {},
      updateMenu() {},
      updateCards(list) { mod.shown.push(list.slice()); },
      hideBackButton() {},
      showBackButton() {}
    },
    shown: [],
    cardbox: {
      bindCallback(fn) { mod.pick = fn; },
      attachCardEvents() {},
      hide() {}
    }
  };
  Object.assign(mod, api);
  mod.addMove = (move) => { mod.moves.push(move); };
  mod.endTurn = () => { mod.ended = true; };
  mod.updateLog = (line) => { mod.log = line; };
  mod.calculateVictoryPoints = () => ({ vp: mod.game.state.general_records_track.vp });
  mod.returnPlayerName = (faction) => (faction === 'central' ? 'Central Powers' : 'Allies');
  mod.returnFactionName = mod.returnPlayerName;
  mod.removeSelectable = () => {};
  mod.removeMovementCues = () => {};
  mod.displayGeneralRecordsTrack = () => {};
  mod.displayCustomOverlay = () => {};
  mod.triggerGameOver = async (players, reason) => { mod.over = { players, reason }; };
  mod.rollDice = () => mod.nextRoll;
  mod.returnDeck = () => ({});
  return mod;
}

test('automatic operations is the last selectable card and is not stored in the hand', async () => {
  const mod = harness(10);
  const before = mod.game.deck[0].hand.slice();
  await mod.playerTurn('central');
  const shown = mod.shown[0];
  assert.deepEqual(shown.slice(0, before.length), before);
  assert.equal(shown.at(-1), 'automatic_operations');
  assert.equal(shown.includes('peace_terms'), false);
  assert.deepEqual(await mod.returnPlayerHand(), before);

  mod.game.player = 2;
  await mod.playerTurn('allies');
  assert.equal(mod.shown[1].at(-1), 'automatic_operations');
  assert.equal(mod.game.deck[1].hand.includes('ap02'), true);
  assert.equal(mod.game.deck[1].hand.includes('automatic_operations'), false);
  assert.equal(mod.game.deck[1].hand.includes('peace_terms'), false);
});

test('peace terms is shown only while the manual range is met', async () => {
  const central = harness(11);
  await central.playerTurn('central');
  assert.equal(central.shown[0].includes('peace_terms'), true);
  assert.equal(central.shown[0].at(-1), 'automatic_operations');

  central.game.state.general_records_track.vp = 10;
  await central.playerTurn('central');
  assert.equal(central.shown[1].includes('peace_terms'), false);

  const allies = harness(9);
  allies.game.player = 2;
  await allies.playerTurn('allies');
  assert.equal(allies.shown[0].includes('peace_terms'), true);
  allies.game.state.general_records_track.vp = 10;
  await allies.playerTurn('allies');
  assert.equal(allies.shown[1].includes('peace_terms'), false);

  central.game.state.general_records_track.vp = 15;
  central.game.state.events.fourteen_points = 1;
  assert.equal(await central.mayOfferPeaceTerms('central'), false);
  central.game.state.events.fourteen_points = 0;
  central.game.state.rules.peace_terms = false;
  assert.equal(await central.mayOfferPeaceTerms('central'), false);
});

test('automatic operations starts one operations point and stays out of the hand', async () => {
  const mod = harness(10);
  const before = mod.game.deck[0].hand.slice();
  let played = null;
  mod.playerPlayOps = (faction, card, cost) => { played = { faction, card, cost }; };
  await mod.playerTurn('central');
  await mod.pick('automatic_operations');
  assert.deepEqual(played, { faction: 'central', card: 'automatic_operations', cost: 1 });
  assert.deepEqual(await mod.returnPlayerHand(), before);
  assert.equal(mod.moves.some((move) => move.startsWith('discard')), false);

  await mod.playerTurn('central');
  assert.equal(mod.shown.at(-1).at(-1), 'automatic_operations');
});

test('accepted peace terms end the game as a draw', async () => {
  const mod = harness(12);
  const result = await mod.evaluatePeaceOffer('central', 'accept');
  assert.equal(result, 0);
  assert.deepEqual(mod.over.players, ['central-key', 'allied-key']);
  assert.equal(mod.over.reason, 'peace');
});

test('refused peace terms use the existing table', async () => {
  const cases = [
    ['central', 10, 1, 1],
    ['central', 10, 4, 0],
    ['central', 10, 6, -1],
    ['central', 20, 2, 1],
    ['central', 20, 3, 0],
    ['allies', 10, 1, -1],
    ['allies', 10, 6, 1],
    ['allies', 20, 2, -1],
    ['allies', 20, 3, 0]
  ];
  for (const [faction, combined, roll, delta] of cases) {
    const mod = harness(12);
    mod.game.state.general_records_track.combined_war_status = combined;
    mod.nextRoll = roll;
    await mod.evaluatePeaceOffer(faction, 'reject');
    assert.equal(mod.game.state.events.peace_terms_vp, delta, `${faction} ${combined} roll ${roll}`);
  }
});

test('an eligible player can offer peace terms again', async () => {
  const mod = harness(11);
  const offers = [];
  const add = mod.addMove;
  mod.addMove = (move) => { add(move); if (move.startsWith('peace_offer\t')) { offers.push(move); } };
  await mod.playerTurn('central');
  await mod.pick('peace_terms');
  assert.equal(mod.ended, true);
  assert.deepEqual(await mod.returnPlayerHand(), ['cp02', 'cp03']);

  mod.ended = false;
  await mod.playerTurn('central');
  await mod.pick('peace_terms');
  assert.deepEqual(offers, ['peace_offer\tcentral', 'peace_offer\tcentral']);
});

test('special cards use their artwork and are not deck cards', async () => {
  const mod = harness(11);
  const automatic = await mod.returnCardImage('automatic_operations');
  const peace = await mod.returnCardImage('peace_terms');
  assert.match(automatic, /\/paths\/img\/cards\/automatic_operation\.png/);
  assert.match(peace, /\/paths\/img\/cards\/peace_terms\.png/);
  assert.equal((await mod.popup('automatic_operations')).includes('Automatic Operations'), true);
  assert.equal((await mod.popup('peace_terms')).includes('Peace Terms'), true);
  assert.equal(mod.game.deck[0].hand.includes('automatic_operations'), false);
  assert.equal(mod.game.deck[0].hand.includes('peace_terms'), false);
});
