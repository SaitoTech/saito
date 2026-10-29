for (const method of ['log', 'debug', 'info', 'warn', 'trace']) console[method] = () => {};
const run = require('./daemon-session');
const report = event => process.send(event);
const controller = new AbortController();
let started = false;
for (const signal of ['SIGINT', 'SIGTERM', 'disconnect']) process.on(signal, () => controller.abort());
process.on('message', message => {
  if (message.stop) { controller.abort(); return; }
  if (started) return;
  started = true;
  run(message.config, message.task, { signal: controller.signal, report }).then(next => {
    process.send({ next }, () => process.exit(0));
  }).catch(error => {
    if (error.name === 'AbortError') process.exit(0);
    process.send({ error: error.message }, () => process.exit(1));
  });
});
