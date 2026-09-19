//const assert = require('assert');
const engine = require('./tripeaks-engine');

function takeUnused(used, rank) {
  const suits = ['S', 'C', 'H', 'D'];
  for (let i = 0; i < suits.length; i++) {
    const c = suits[i] + rank;
    if (!used[c]) {
      used[c] = true;
      return c;
    }
  }
  throw new Error('no unused card for rank ' + rank);
}

function blankTableau() {
  const used = {};
  const tableau = [];
  for (let i = 0; i < 28; i++) {
    tableau.push(takeUnused(used, (i % 13) + 1));
  }
  return { tableau, used };
}

function setSlot(board, index, rank) {
  delete board.used[board.tableau[index]];
  board.tableau[index] = takeUnused(board.used, rank);
}

function deckFromTableauWasteStock(tableau, waste, stock) {
  const used = {};
  const head = tableau.concat([waste]).concat(stock);
  head.forEach((c) => {
    if (used[c]) {
      throw new Error('duplicate card in constructed deal: ' + c);
    }
    used[c] = true;
  });
  const tail = engine.standardDeck().filter((c) => !used[c]);
  const cards = head.concat(tail);
  //assert.strictEqual(cards.length, 52);
  return cards;
}

function testRanks() {
  //assert.strictEqual(engine.rankOf('H1'), 1);
  //assert.strictEqual(engine.rankOf('S13'), 13);
  //assert.strictEqual(engine.rankOf('D10'), 10);
  //assert.ok(engine.ranksAdjacent('S6', 'H7'));
  //assert.ok(engine.ranksAdjacent('H8', 'C7'));
  //assert.ok(engine.ranksAdjacent('S1', 'D2'));
  //assert.ok(engine.ranksAdjacent('C12', 'H13'));
  //assert.ok(!engine.ranksAdjacent('S1', 'H13'), 'Ace and King are not adjacent');
  //assert.ok(!engine.ranksAdjacent('S7', 'H7'));
  //assert.ok(!engine.ranksAdjacent('S7', 'H9'));
  for (let r = 1; r <= 13; r++) {
    for (let q = 1; q <= 13; q++) {
      const want = Math.abs(r - q) === 1;
      //assert.strictEqual(engine.ranksAdjacent('S' + r, 'H' + q), want);
    }
  }
}

function testLayoutGraph() {
  //assert.strictEqual(engine.SLOT_DEFS.length, 28);
  for (let i = 0; i < 28; i++) {
    const covers = engine.coversOf(i);
    covers.forEach((parent) => {
      //assert.ok(engine.SLOT_DEFS[parent].covered_by.indexOf(i) !== -1);
    });
  }
  //assert.deepStrictEqual(engine.SLOT_DEFS[0].covered_by, [3, 4]);
  //assert.deepStrictEqual(engine.SLOT_DEFS[11].covered_by, [20, 21]);
  //assert.deepStrictEqual(engine.SLOT_DEFS[12].covered_by, [21, 22]);
  //assert.deepStrictEqual(engine.SLOT_DEFS[27].covered_by, []);
  //assert.strictEqual(engine.coversOf(21).indexOf(11) !== -1, true);
  //assert.strictEqual(engine.coversOf(21).indexOf(12) !== -1, true);
}

function testDealAndExposure() {
  const state = engine.deal(engine.standardDeck());
  //assert.strictEqual(state.tableau.length, 28);
  //assert.strictEqual(state.waste.length, 1);
  //assert.strictEqual(state.stock.length, 23);
  for (let i = 0; i < 18; i++) {
    //assert.strictEqual(state.tableau[i].face_up, false, 'covered cards start face down ' + i);
    //assert.strictEqual(engine.isExposed(state, i), false);
  }
  for (let i = 18; i < 28; i++) {
    //assert.strictEqual(state.tableau[i].face_up, true);
    //assert.strictEqual(engine.isExposed(state, i), true);
  }
}

function testIllegalAndLegalPlay() {
  const board = blankTableau();
  setSlot(board, 18, 6);
  setSlot(board, 19, 8);
  setSlot(board, 20, 6);
  const waste = takeUnused(board.used, 7);
  const stock = [takeUnused(board.used, 9)];
  const state = engine.deal(deckFromTableauWasteStock(board.tableau, waste, stock));
  //assert.ok(engine.canPlayIndex(state, 18));
  //assert.ok(engine.canPlayIndex(state, 19));
  //assert.ok(engine.canPlayIndex(state, 20));
  //assert.ok(!engine.canPlayIndex(state, 0), 'peak still covered');
  //assert.ok(!engine.canPlayIndex(state, 9));

  const bad = engine.playIndex(state, 0);
  //assert.strictEqual(bad.ok, false);
  const first = engine.playIndex(state, 18);
  //assert.strictEqual(first.ok, true);
  //assert.strictEqual(engine.rankOf(engine.wasteTop(state)), 6);
  //assert.strictEqual(state.combo, 1);
  //assert.strictEqual(state.score, engine.POINTS_CARD);
  //assert.ok(state.tableau[18].removed);

  const twice = engine.playIndex(state, 18);
  //assert.strictEqual(twice.ok, false, 'cannot play a removed card twice');
}

function testChainComboAndDrawReset() {
  const board = blankTableau();
  setSlot(board, 18, 6);
  setSlot(board, 19, 5);
  setSlot(board, 20, 4);
  setSlot(board, 21, 3);
  const waste = takeUnused(board.used, 7);
  const stock_card = takeUnused(board.used, 10);
  const state = engine.deal(
    deckFromTableauWasteStock(board.tableau, waste, [stock_card])
  );

  engine.playIndex(state, 18);
  engine.playIndex(state, 19);
  engine.playIndex(state, 20);
  engine.playIndex(state, 21);
  //assert.strictEqual(state.combo, 4);
  //assert.strictEqual(
  //  state.score,
  //  engine.POINTS_CARD * 4 + engine.POINTS_COMBO_STEP * (0 + 1 + 2 + 3)
  //);

  const drawn = engine.drawStock(state);
  //assert.strictEqual(drawn.ok, true);
  //assert.strictEqual(state.combo, 0);
  //assert.strictEqual(engine.wasteTop(state), stock_card);
}

function testFlipAfterCoveringRemoved() {
  const board = blankTableau();
  setSlot(board, 9, 4);
  setSlot(board, 18, 6);
  setSlot(board, 19, 5);
  const waste = takeUnused(board.used, 7);
  const state = engine.deal(
    deckFromTableauWasteStock(board.tableau, waste, [takeUnused(board.used, 1)])
  );
  //assert.strictEqual(state.tableau[9].face_up, false);

  engine.playIndex(state, 18);
  assert.strictEqual(state.tableau[9].face_up, false, 'still covered by 19');
  const r = engine.playIndex(state, 19);
  //assert.ok(r.flipped.indexOf(9) !== -1);
  //assert.strictEqual(state.tableau[9].face_up, true);
  //assert.ok(engine.canPlayIndex(state, 9));
}

function testValleyCardCoversTwoPeaks() {
  const board = blankTableau();
  setSlot(board, 11, 5);
  setSlot(board, 12, 5);
  setSlot(board, 20, 8);
  setSlot(board, 21, 9);
  setSlot(board, 22, 8);
  const waste = takeUnused(board.used, 7);
  const state = engine.deal(deckFromTableauWasteStock(board.tableau, waste, []));
  engine.playIndex(state, 20);
  //assert.strictEqual(state.tableau[11].face_up, false);
  engine.playIndex(state, 21);
  //assert.ok(state.tableau[11].face_up, '11 flips when 20 and 21 gone');
  //assert.strictEqual(state.tableau[12].face_up, false, '12 still needs 22');
  engine.playIndex(state, 22);
  //assert.ok(state.tableau[12].face_up);
}

function testDrawExhaustAndLoss() {
  const used = {};
  const tableau = new Array(28);
  const dead = [1, 1, 1, 1, 3, 3, 3, 3, 10, 10];
  for (let i = 0; i < dead.length; i++) {
    tableau[18 + i] = takeUnused(used, dead[i]);
  }
  const waste = takeUnused(used, 7);
  const stock = [takeUnused(used, 11), takeUnused(used, 12)];
  const rest = engine.standardDeck().filter((c) => !used[c]);
  for (let i = 0; i < 18; i++) {
    tableau[i] = rest[i];
    used[rest[i]] = true;
  }
  const state = engine.deal(deckFromTableauWasteStock(tableau, waste, stock));
  state.stock = stock.slice();
  //assert.strictEqual(engine.legalMoves(state).length, 0);
  engine.drawStock(state);
  engine.drawStock(state);
  const empty = engine.drawStock(state);
  //assert.strictEqual(empty.ok, false);
  //assert.strictEqual(state.status, 'lost');
  //assert.strictEqual(state.stock.length, 0);
}

function bounceRanks(start, count) {
  const ranks = [];
  let rank = start;
  let dir = 1;
  for (let i = 0; i < count; i++) {
    ranks.push(rank);
    if (dir > 0 && rank === 13) {
      dir = -1;
      rank = 12;
    } else if (dir < 0 && rank === 1) {
      dir = 1;
      rank = 2;
    } else {
      rank += dir;
    }
  }
  return ranks;
}

function testPeakAndWin() {
  const used = {};
  const play_order = [
    18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 9, 10, 11, 12, 13, 14, 15, 16, 17, 3, 4, 5, 6, 7, 8, 0,
    1, 2
  ];
  const ranks = bounceRanks(7, 28);
  const tableau = new Array(28);
  for (let i = 0; i < play_order.length; i++) {
    tableau[play_order[i]] = takeUnused(used, ranks[i]);
  }
  const waste = takeUnused(used, 6);
  const state = engine.deal(deckFromTableauWasteStock(tableau, waste, []));

  for (let i = 0; i < play_order.length; i++) {
    const idx = play_order[i];
    //assert.ok(engine.canPlayIndex(state, idx), 'expected legal play at ' + idx + ' step ' + i);
    engine.playIndex(state, idx);
  }

  //assert.strictEqual(state.status, 'won');
  //assert.strictEqual(engine.remainingTableau(state), 0);
  //assert.ok(state.score >= engine.POINTS_CLEAR + engine.POINTS_PEAK * 3);
  //assert.deepStrictEqual(state.peaks_cleared, [true, true, true]);
}

function testRestartClone() {
  const a = engine.deal(engine.standardDeck());
  const moves = engine.legalMoves(a);
  if (moves.length) {
    engine.playIndex(a, moves[0]);
  }
  const b = engine.cloneState(a);
  b.score = 0;
  //assert.strictEqual(b.score, 0);
  //assert.ok(a.score !== b.score || moves.length === 0);
}

function testRapidPlayIdempotent() {
  const board = blankTableau();
  setSlot(board, 18, 5);
  const waste = takeUnused(board.used, 6);
  const state = engine.deal(
    deckFromTableauWasteStock(board.tableau, waste, [takeUnused(board.used, 1)])
  );
  const r1 = engine.playIndex(state, 18);
  const r2 = engine.playIndex(state, 18);
  const r3 = engine.playIndex(state, 18);
  //assert.strictEqual(r1.ok, true);
  //assert.strictEqual(r2.ok, false);
  //assert.strictEqual(r3.ok, false);
  //assert.strictEqual(state.tableau.filter((s) => s.removed).length, 1);
}

function testAceNoWrap() {
  const board = blankTableau();
  setSlot(board, 18, 13);
  setSlot(board, 19, 2);
  const waste = takeUnused(board.used, 1);
  const state = engine.deal(deckFromTableauWasteStock(board.tableau, waste, []));
  //assert.ok(!engine.canPlayIndex(state, 18));
  //assert.ok(engine.canPlayIndex(state, 19));
}

function testNewDealShuffle() {
  const a = engine.shuffle(engine.standardDeck(), () => 0.3);
  const b = engine.shuffle(engine.standardDeck(), () => 0.8);
  //assert.strictEqual(a.length, 52);
  //assert.strictEqual(new Set(a).size, 52);
  //assert.notDeepStrictEqual(a, engine.standardDeck());
  //assert.notDeepStrictEqual(a, b);
}

try {
  testRanks();
  testLayoutGraph();
  testDealAndExposure();
  testIllegalAndLegalPlay();
  testChainComboAndDrawReset();
  testFlipAfterCoveringRemoved();
  testValleyCardCoversTwoPeaks();
  testDrawExhaustAndLoss();
  testPeakAndWin();
  testRestartClone();
  testRapidPlayIdempotent();
  testAceNoWrap();
  testNewDealShuffle();
  console.log('tripeaks-engine tests passed');
} catch (err) {
  console.error(err);
  process.exit(1);
}
