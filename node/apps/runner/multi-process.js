const path = require('node:path');
const { fork } = require('node:child_process');

class PermitPool {
  constructor(limit) { this.limit = limit; this.active = new Map(); this.queue = []; }
  request(key, grant) {
    if (this.active.has(key) || this.queue.some(p => p.key === key)) throw Error('Duplicate decision permit');
    this.queue.push({ key, grant }); this.drain();
  }
  release(key) {
    this.active.delete(key); this.queue = this.queue.filter(p => p.key !== key); this.drain();
  }
  drain() {
    while (this.active.size < this.limit && this.queue.length) {
      const p = this.queue.shift(); this.active.set(p.key, p); p.grant();
    }
  }
  removeSeat(name) {
    this.queue = this.queue.filter(p => !p.key.startsWith(name + ':'));
    for (const key of this.active.keys()) if (key.startsWith(name + ':')) this.active.delete(key);
    this.drain();
  }
}

function spawnSeat(name, config, { pool, report, failed, forkWorker = defaultFork }) {
  const child = forkWorker(name);
  let seq = 0, stopping = false, completed = false, hasExited = false, resolveDone, rejectDone, resolveExit;
  const pending = new Map();
  const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  done.catch(() => {}); // May fail during setup before the supervisor awaits all seats.
  const exited = new Promise(resolve => { resolveExit = resolve; });
  const send = message => { if (child.connected) child.send(message, () => {}); };
  const fail = error => { rejectDone(error); if (!stopping) failed(error); };
  child.on('error', error => {
    fail(error);
    if (!child.pid) finishExit(error); // Failed spawn has no process to emit exit.
  });
  child.on('message', message => {
    if (message.kind === 'result') {
      const p = pending.get(message.id); if (!p) return;
      pending.delete(message.id); clearTimeout(p.timer);
      message.error ? p.reject(Error(`${name}: ${message.error}`)) : p.resolve(message.result);
    } else if (message.kind === 'permit-request') {
      if (!stopping) pool.request(`${name}:${message.id}`, () => send({ kind: 'permit-granted', id: message.id }));
    } else if (message.kind === 'permit-release') pool.release(`${name}:${message.id}`);
    else if (message.kind === 'event') {
      report({ ...message.event, seat: name });
      if (message.event.event === 'complete') { completed = true; resolveDone(message.event); }
      if (message.event.event === 'seat-error') fail(Error(`${name}: ${message.event.message}`));
    }
  });
  child.on('exit', (code, signal) => {
    finishExit(Error(`${name} exited (${signal || code})`));
  });
  function finishExit(error) {
    if (hasExited) return;
    hasExited = true;
    pool.removeSeat(name);
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error); }
    pending.clear();
    if (!stopping) fail(error); // Even a completed seat must stay connected until the others finish.
    else if (!completed) rejectDone(error);
    resolveExit();
  }
  return {
    name, done,
    rpc(op, data) {
      if (stopping || !child.connected) return Promise.reject(Error(`${name} is stopped`));
      return new Promise((resolve, reject) => {
        const id = ++seq;
        const timer = setTimeout(() => { pending.delete(id); reject(Error(`${name}: ${op} timed out`)); }, Math.max(120000, config.multi.joinTimeoutMs + 15000));
        pending.set(id, { resolve, reject, timer }); send({ kind: 'rpc', id, op, data });
      });
    },
    async stop() {
      if (stopping) return exited;
      stopping = true; send({ kind: 'stop' });
      const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
      await exited; clearTimeout(timer);
    }
  };
}
function defaultFork() {
  return fork(path.join(__dirname, 'multi-worker.js'), [], {
    execArgv: ['-r', 'ts-node/register'],
    env: { ...process.env, TS_NODE_PROJECT: path.resolve(__dirname, '../../config/build/tsconfig.json'), TS_NODE_TRANSPILE_ONLY: '1' },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc']
  });
}
module.exports = { PermitPool, spawnSeat };
