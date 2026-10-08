// Serializable game state lives in game.state.run. Randomness comes from Saito's dice.
const WIDTH = 25;
const HEIGHT = 19;
const key = ({ x, y }) => `${x},${y}`;
const same = (a, b) => a.x === b.x && a.y === b.y;

// League uses JavaScript numbers; keep scores exact within its integer range.
function leaderboardPoints(clearedWaves) {
  return 2 ** Math.min(53, Math.max(0, Math.floor(clearedWaves))) - 1;
}

function newRun(random) {
  const state = {
    width: WIDTH,
    height: HEIGHT,
    wave: 0,
    score: 0,
    turns: 0,
    kills: 0,
    clearedWaves: 0,
    leaderboardPoints: 0
  };
  nextWave(state, random);
  return state;
}

function nextWave(state, random) {
  state.wave++;
  state.player = { x: Math.floor(state.width / 2), y: Math.floor(state.height / 2) };
  state.fires = [];
  state.robots = [];
  state.status = 'playing';
  state.bonus = 0;
  state.safeJumps = 0;
  const cells = [];
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if (Math.max(Math.abs(x - state.player.x), Math.abs(y - state.player.y)) > 3) {
        cells.push({ x, y });
      }
    }
  }
  const count = Math.min(10 + (state.wave - 1) * 5, 100, cells.length);
  for (let i = 0; i < count; i++) {
    state.robots.push(cells.splice(random(cells.length), 1)[0]);
  }
}

// Resolve every robot against the same destination map, never sequentially.
function pursue(state, player) {
  const fires = new Set(state.fires.map(key));
  const destinations = new Map();
  for (const robot of state.robots) {
    const target = {
      x: robot.x + Math.sign(player.x - robot.x),
      y: robot.y + Math.sign(player.y - robot.y)
    };
    const id = key(target);
    if (!destinations.has(id)) destinations.set(id, { target, count: 0 });
    destinations.get(id).count++;
  }
  const robots = [];
  for (const [id, { target, count }] of destinations) {
    if (count > 1 || fires.has(id)) fires.add(id);
    else robots.push(target);
  }
  return {
    robots,
    fires: [...fires].map((id) => {
      const [x, y] = id.split(',').map(Number);
      return { x, y };
    }),
    dead: destinations.has(key(player)) || fires.has(key(player))
  };
}

// Payment preflight uses the same landing rules as the actual jump, without rolling dice.
function landingZones(state, safe = false) {
  if (state.status !== 'playing') return [];
  const occupied = new Set([...state.robots, ...state.fires, state.player].map(key));
  const candidates = [];
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const cell = { x, y };
      if (!occupied.has(key(cell)) && (!safe || !pursue(state, cell).dead)) candidates.push(cell);
    }
  }
  return candidates;
}

function act(state, action, random) {
  if (state.status !== 'playing') return { accepted: false };
  let player = { ...state.player };
  let moved = false;
  if (action.type === 'move') {
    const { dx, dy } = action;
    if (![dx, dy].every((n) => Number.isInteger(n) && Math.abs(n) <= 1)) return { accepted: false };
    player.x += dx;
    player.y += dy;
    moved = dx !== 0 || dy !== 0;
    if (
      player.x < 0 ||
      player.y < 0 ||
      player.x >= state.width ||
      player.y >= state.height ||
      [...state.fires, ...state.robots].some((cell) => same(cell, player))
    ) {
      return { accepted: false, message: 'BLOCKED - CHOOSE ANOTHER STEP' };
    }
  } else if (action.type === 'teleport' || action.type === 'safe') {
    if (action.type === 'safe' && !state.safeJumps)
      return { accepted: false, message: 'NO SAFE JUMPS LEFT' };
    const candidates = landingZones(state, action.type === 'safe');
    if (!candidates.length) return { accepted: false, message: 'NO LANDING ZONE' };
    player = candidates[random(candidates.length)];
    if (action.type === 'safe') state.safeJumps--;
    moved = true;
  } else {
    return { accepted: false };
  }
  const result = pursue(state, player);
  const destroyed = state.robots.length - result.robots.length;
  state.player = player;
  state.robots = result.robots;
  state.fires = result.fires;
  state.turns++;
  state.kills += destroyed;
  state.score += destroyed * 10 - (moved ? 1 : 0);
  if (result.dead) state.status = 'dead';
  else if (!state.robots.length) {
    state.status = 'cleared';
    state.clearedWaves = state.wave;
    state.leaderboardPoints = leaderboardPoints(state.clearedWaves);
    state.bonus = { 1: 50, 2: 20, 3: 10 }[state.fires.length] || 0;
    state.score += state.bonus;
  }
  return { accepted: true, destroyed };
}

module.exports = { newRun, nextWave, act, pursue, landingZones, leaderboardPoints };
