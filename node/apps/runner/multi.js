const fs = require('node:fs');
const path = require('node:path');
const lock = require('./lock');
const { PermitPool, spawnSeat } = require('./multi-process');

function save(filename, value) {
  const temporary = filename + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  const fd = fs.openSync(temporary, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temporary, filename);
  const dir = fs.openSync(path.dirname(filename), 'r');
  try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
}

async function multi(config, mode, inviteId, { signal, report, createSeat = spawnSeat } = {}) {
  const filename = path.join(config.dataDir, 'multi-session.json');
  let session = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : null;
  if (mode === 'join' && !inviteId) throw Error('multi-join needs an exact invitation ID');
  if (mode === 'resume' && !session) throw Error('No multi-seat session in this dataDir');
  if (session && (mode === 'resume' || session.status !== 'complete')) {
    if (session.version !== 1 || session.game !== config.game || session.players !== config.players ||
      !Array.isArray(session.seats) || session.seats.length !== config.multi.seats ||
      session.seats.some((s, i) => s.name !== `bot-${i + 1}`) || session.peer !== config.peer) throw Error('Session configuration changed; use its original game, players, seats and peer');
    if ((inviteId && session.inviteId !== inviteId) || (mode !== 'resume' && session.mode !== mode)) throw Error('A different multi-seat session exists; use multi-resume or another dataDir');
    if (session.status === 'complete') { report({ event: 'multi-complete', game: session.inviteId }); return; }
  } else {
    session = { version: 1, game: config.game, players: config.players, peer: config.peer, mode,
      inviteId: mode === 'join' ? inviteId : null, status: 'starting',
      seats: Array.from({ length: config.multi.seats }, (_, i) => ({ name: `bot-${i + 1}`, publicKey: null })) };
    save(filename, session);
  }
  const pool = new PermitPool(config.multi.maxConcurrentDecisions);
  const children = [], locks = [];
  let failure, stopping;
  const stop = () => stopping ||= Promise.allSettled(children.map(c => c.stop()));
  const failed = error => { failure ||= error; stop(); };
  const events = event => {
    if (event.event === 'complete') {
      const seat = session.seats.find(s => s.name === event.seat);
      seat.complete = true; seat.winner = event.winner; save(filename, session);
    }
    report(event);
  };
  signal.addEventListener('abort', stop, { once: true });
  try {
    // Acquire every seat lock before booting any wallet. An existing single-seat
    // process cannot run against one of these directories concurrently.
    for (const seat of session.seats) locks.push(lock(path.join(config.dataDir, 'seats', seat.name)));
    const configs = session.seats.map(s => ({ ...config, dataDir: path.join(config.dataDir, 'seats', s.name) }));
    for (let i = 0; i < configs.length; i++) {
      signal.throwIfAborted();
      children.push(createSeat(session.seats[i].name, configs[i], { pool, report: events, failed }));
    }
    const statuses = await Promise.all(children.map((c, i) => c.rpc('boot', configs[i])));
    const keys = statuses.map(s => s.publicKey);
    if (keys.some(k => !k) || new Set(keys).size !== keys.length) throw Error('Each bot seat must have a different wallet');
    statuses.forEach((status, i) => {
      const seat = session.seats[i];
      if (seat.publicKey && seat.publicKey !== status.publicKey) throw Error(`${seat.name} wallet changed; restore its original data directory`);
      if (status.games.some(g => !g.over && (g.id !== session.inviteId || g.module !== config.game))) throw Error(`${seat.name} has another unfinished game`);
      seat.publicKey = status.publicKey;
      report({ event: 'seat-wallet', seat: seat.name, publicKey: seat.publicKey });
    });
    save(filename, session);
    if (!session.inviteId) {
      session.inviteId = (await children[0].rpc('prepareHost')).id;
      save(filename, session);
    }
    await Promise.all(children.map((c, i) => c.rpc('bind', { id: session.inviteId, role: session.mode === 'host' && i === 0 ? 'host' : 'guest' })));
    await Promise.all(children.map(c => c.rpc('ready')));
    await Promise.all(children.map(c => c.rpc('start')));
    if (session.mode === 'host') await children[0].rpc('publish');
    report({ event: 'multi-invite', id: session.inviteId, game: config.game, bots: children.length, players: config.players });
    await children[0].rpc('validateGroup', { keys });
    // Wait for each roster acknowledgement before attempting the next join.
    // A restart reuses each wallet's existing signature instead of signing twice.
    for (let i = session.mode === 'host' ? 1 : 0; i < children.length; i++) await children[i].rpc('join');
    session.status = 'playing'; delete session.error; save(filename, session);
    report({ event: 'multi-playing', id: session.inviteId, bots: children.length, players: config.players });
    const outcomes = await Promise.all(children.map(c => c.done));
    const winner = JSON.stringify([].concat(outcomes[0].winner).sort());
    if (outcomes.some(o => o.game !== session.inviteId || JSON.stringify([].concat(o.winner).sort()) !== winner)) throw Error('Seats disagree on the completed game or winner');
    session.status = 'complete'; save(filename, session);
    report({ event: 'multi-complete', game: session.inviteId, winner: outcomes[0].winner });
  } catch (error) {
    session.status = signal.aborted ? 'paused' : 'failed';
    session.error = (failure || error).message; save(filename, session);
    if (!signal.aborted) throw failure || error;
  } finally {
    await stop();
    signal.removeEventListener('abort', stop);
    for (const unlock of locks.reverse()) unlock();
  }
}
module.exports = { multi };
