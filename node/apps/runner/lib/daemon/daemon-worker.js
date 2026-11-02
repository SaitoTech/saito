function serve({ run = require('./daemon-session'), graceMs = 10000 } = {}) {
  for (const method of ['log', 'debug', 'info', 'warn', 'trace']) console[method] = () => {};
  const controller = new AbortController();
  let started = false, killTimer;
  const send = (message, callback) => {
    if (process.connected) process.send(message, callback || (() => {}));
    else callback?.();
  };
  const report = event => send(event);
  const stop = () => {
    controller.abort();
    // Native startup and other operations may not honor AbortSignal. The parent
    // also has a deadline, but cannot enforce it after it has disappeared.
    killTimer ||= setTimeout(() => process.exit(0), graceMs);
    killTimer.unref();
    if (!started) process.exit(0);
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'disconnect']) process.on(signal, stop);
  process.on('message', message => {
    if (message.stop) { stop(); return; }
    if (started || controller.signal.aborted) return;
    started = true;
    Promise.resolve().then(() => run(message.config, message.task, { signal: controller.signal, report })).then(next => {
      send({ next }, () => process.exit(0));
    }).catch(error => {
      if (controller.signal.aborted || error.name === 'AbortError') process.exit(0);
      send({ error: error.message, stack: error.stack, code: error.code }, () => process.exit(1));
    });
  });
}
if (require.main === module) serve();
module.exports = serve;
