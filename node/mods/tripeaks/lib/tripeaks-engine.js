// Standard Microsoft-style TriPeaks: 28 overlapping tableau cards.
// Coordinates use half-card columns (0–18) across four rows.
//
//         00          01          02
//      03    04    05    06    07    08
//    09  10  11  12  13  14  15  16  17
//  18  19  20  21  22  23  24  25  26  27

const SLOT_DEFS = [
  { id: 0, row: 0, col: 3, covered_by: [3, 4], peak: 0 },
  { id: 1, row: 0, col: 9, covered_by: [5, 6], peak: 1 },
  { id: 2, row: 0, col: 15, covered_by: [7, 8], peak: 2 },

  { id: 3, row: 1, col: 2, covered_by: [9, 10], peak: 0 },
  { id: 4, row: 1, col: 4, covered_by: [10, 11], peak: 0 },
  { id: 5, row: 1, col: 8, covered_by: [12, 13], peak: 1 },
  { id: 6, row: 1, col: 10, covered_by: [13, 14], peak: 1 },
  { id: 7, row: 1, col: 14, covered_by: [15, 16], peak: 2 },
  { id: 8, row: 1, col: 16, covered_by: [16, 17], peak: 2 },

  { id: 9, row: 2, col: 1, covered_by: [18, 19], peak: 0 },
  { id: 10, row: 2, col: 3, covered_by: [19, 20], peak: 0 },
  { id: 11, row: 2, col: 5, covered_by: [20, 21], peak: 0 },
  { id: 12, row: 2, col: 7, covered_by: [21, 22], peak: 1 },
  { id: 13, row: 2, col: 9, covered_by: [22, 23], peak: 1 },
  { id: 14, row: 2, col: 11, covered_by: [23, 24], peak: 1 },
  { id: 15, row: 2, col: 13, covered_by: [24, 25], peak: 2 },
  { id: 16, row: 2, col: 15, covered_by: [25, 26], peak: 2 },
  { id: 17, row: 2, col: 17, covered_by: [26, 27], peak: 2 },

  { id: 18, row: 3, col: 0, covered_by: [], peak: 0 },
  { id: 19, row: 3, col: 2, covered_by: [], peak: 0 },
  { id: 20, row: 3, col: 4, covered_by: [], peak: 0 },
  { id: 21, row: 3, col: 6, covered_by: [], peak: 1 },
  { id: 22, row: 3, col: 8, covered_by: [], peak: 1 },
  { id: 23, row: 3, col: 10, covered_by: [], peak: 1 },
  { id: 24, row: 3, col: 12, covered_by: [], peak: 2 },
  { id: 25, row: 3, col: 14, covered_by: [], peak: 2 },
  { id: 26, row: 3, col: 16, covered_by: [], peak: 2 },
  { id: 27, row: 3, col: 18, covered_by: [], peak: 2 }
];

const TABLEAU_SIZE = 28;
const POINTS_CARD = 10;
const POINTS_COMBO_STEP = 5;
const POINTS_PEAK = 50;
const POINTS_CLEAR = 100;
const POINTS_STOCK = 5;

function rankOf(card) {
  return parseInt(card.slice(1), 10);
}

function suitOf(card) {
  return card[0];
}

function ranksAdjacent(a, b) {
  return Math.abs(rankOf(a) - rankOf(b)) === 1;
}

function standardDeck() {
  const suits = ['S', 'C', 'H', 'D'];
  const deck = [];
  for (let s = 0; s < suits.length; s++) {
    for (let r = 1; r <= 13; r++) {
      deck.push(suits[s] + r);
    }
  }
  return deck;
}

function shuffle(cards, rng = Math.random) {
  const out = cards.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function coversOf(index) {
  const covers = [];
  for (let i = 0; i < SLOT_DEFS.length; i++) {
    if (SLOT_DEFS[i].covered_by.indexOf(index) !== -1) {
      covers.push(i);
    }
  }
  return covers;
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function emptyPlayState() {
  return {
    tableau: SLOT_DEFS.map((slot) => ({
      id: slot.id,
      card: null,
      face_up: slot.covered_by.length === 0,
      removed: false
    })),
    stock: [],
    waste: [],
    score: 0,
    combo: 0,
    moves: 0,
    peaks_cleared: [false, false, false],
    status: 'play',
    last_event: null
  };
}

function deal(cards) {
  if (!cards || cards.length !== 52) {
    throw new Error('TriPeaks requires a 52-card deck');
  }

  const state = emptyPlayState();
  for (let i = 0; i < TABLEAU_SIZE; i++) {
    state.tableau[i].card = cards[i];
    state.tableau[i].face_up = SLOT_DEFS[i].covered_by.length === 0;
    state.tableau[i].removed = false;
  }

  const rest = cards.slice(TABLEAU_SIZE);
  state.waste = [rest[0]];
  state.stock = rest.slice(1);
  state.status = 'play';
  state.last_event = { type: 'deal' };
  return state;
}

function wasteTop(state) {
  if (!state.waste.length) {
    return null;
  }
  return state.waste[state.waste.length - 1];
}

function isCovered(state, index) {
  const blockers = SLOT_DEFS[index].covered_by;
  for (let i = 0; i < blockers.length; i++) {
    const slot = state.tableau[blockers[i]];
    if (slot && !slot.removed) {
      return true;
    }
  }
  return false;
}

function isExposed(state, index) {
  const slot = state.tableau[index];
  return slot && !slot.removed && !isCovered(state, index);
}

function canPlayIndex(state, index) {
  if (state.status !== 'play') {
    return false;
  }
  const slot = state.tableau[index];
  if (!slot || slot.removed || !slot.face_up || !slot.card) {
    return false;
  }
  if (isCovered(state, index)) {
    return false;
  }
  const top = wasteTop(state);
  if (!top) {
    return false;
  }
  return ranksAdjacent(slot.card, top);
}

function legalMoves(state) {
  const moves = [];
  if (state.status !== 'play') {
    return moves;
  }
  for (let i = 0; i < TABLEAU_SIZE; i++) {
    if (canPlayIndex(state, i)) {
      moves.push(i);
    }
  }
  return moves;
}

function remainingTableau(state) {
  let n = 0;
  for (let i = 0; i < TABLEAU_SIZE; i++) {
    if (!state.tableau[i].removed) {
      n++;
    }
  }
  return n;
}

function applyOutcome(state) {
  if (remainingTableau(state) === 0) {
    state.score += POINTS_CLEAR + state.stock.length * POINTS_STOCK;
    state.status = 'won';
    return;
  }
  if (state.stock.length === 0 && legalMoves(state).length === 0) {
    state.status = 'lost';
  }
}

function revealUncovered(state) {
  const flipped = [];
  for (let i = 0; i < TABLEAU_SIZE; i++) {
    const slot = state.tableau[i];
    if (slot.removed || slot.face_up) {
      continue;
    }
    if (!isCovered(state, i)) {
      slot.face_up = true;
      flipped.push(i);
    }
  }
  return flipped;
}

function playIndex(state, index) {
  if (!canPlayIndex(state, index)) {
    return { ok: false, reason: 'illegal' };
  }

  const slot = state.tableau[index];
  const card = slot.card;
  slot.removed = true;
  slot.face_up = true;
  state.waste.push(card);
  state.combo += 1;
  state.moves += 1;
  state.score += POINTS_CARD + (state.combo - 1) * POINTS_COMBO_STEP;

  let peak_cleared = null;
  if (index <= 2 && !state.peaks_cleared[index]) {
    state.peaks_cleared[index] = true;
    state.score += POINTS_PEAK;
    peak_cleared = index;
  }

  const flipped = revealUncovered(state);
  applyOutcome(state);

  const result = {
    ok: true,
    type: 'play',
    index,
    card,
    combo: state.combo,
    flipped,
    peak_cleared,
    status: state.status
  };
  state.last_event = result;
  return result;
}

function drawStock(state) {
  if (state.status !== 'play') {
    return { ok: false, reason: 'over' };
  }
  if (!state.stock.length) {
    applyOutcome(state);
    return { ok: false, reason: 'empty', status: state.status };
  }

  const card = state.stock.shift();
  state.waste.push(card);
  state.combo = 0;
  state.moves += 1;
  applyOutcome(state);

  const result = {
    ok: true,
    type: 'draw',
    card,
    status: state.status
  };
  state.last_event = result;
  return result;
}

function peaksRemaining(state) {
  let n = 0;
  for (let i = 0; i < 3; i++) {
    if (!state.tableau[i].removed) {
      n++;
    }
  }
  return n;
}

module.exports = {
  SLOT_DEFS,
  TABLEAU_SIZE,
  POINTS_CARD,
  POINTS_COMBO_STEP,
  POINTS_PEAK,
  POINTS_CLEAR,
  POINTS_STOCK,
  rankOf,
  suitOf,
  ranksAdjacent,
  standardDeck,
  shuffle,
  coversOf,
  cloneState,
  emptyPlayState,
  deal,
  wasteTop,
  isCovered,
  isExposed,
  canPlayIndex,
  legalMoves,
  remainingTableau,
  peaksRemaining,
  revealUncovered,
  playIndex,
  drawStock
};
