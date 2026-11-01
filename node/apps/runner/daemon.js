const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { fork } = require('node:child_process');

// Exactly one child owns the native wallet at a time. A fresh process per game
// also resets game globals, event handlers and Twilight's local DOM bridge.
async function daemon(config, { signal, report, runChild = child }) {
  let task = { mode: 'watch' };
  while (!signal.aborted) {
    try { task = await runChild(config, task, { signal, report }); }
    catch (error) {
      if (signal.aborted) break;
      if (error.code !== 'SAITO_UNAVAILABLE') throw error;
      report({ event: 'waiting-for-network', message: error.message });
      await delay(config.decisionProvider.retryDelayMs ?? 30000, undefined, { signal });
      continue;
    }
    if (!task) break;
  }
}

function child(config, task, { signal, report }) {
  return new Promise((resolve, reject) => {
    const worker = fork(path.join(__dirname, 'daemon-worker.js'), [], {
      execArgv: ['-r', 'ts-node/register'],
      env: { ...process.env, TS_NODE_PROJECT: path.resolve(__dirname, '../../config/build/tsconfig.json'), TS_NODE_TRANSPILE_ONLY: '1' },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc']
    });
    let next, failure, killTimer;
    const stop = () => {
      if (worker.connected) worker.send({ stop: true }, () => {});
      killTimer ||= setTimeout(() => worker.kill('SIGKILL'), 10000);
    };
    signal.addEventListener('abort', stop, { once: true });
    worker.on('message', message => {
      if (message.event) report(message);
      if (message.next) next = message.next;
      if (message.error) {
        failure = Error(message.error);
        failure.code = message.code;
        if (typeof message.stack === 'string') failure.stack = message.stack;
      }
    });
    worker.once('error', error => { failure = error; });
    worker.once('exit', code => {
      clearTimeout(killTimer); signal.removeEventListener('abort', stop);
      if (signal.aborted) resolve(null);
      else if (failure || code !== 0 || !next) reject(failure || Error(`Daemon worker exited (${code})`));
      else resolve(next);
    });
    worker.send({ config, task });
    if (signal.aborted) stop();
  });
}
module.exports = { daemon };
