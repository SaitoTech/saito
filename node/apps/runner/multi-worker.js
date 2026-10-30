const MultiSeat = require('./multi-seat');

// Kept callable so the native integration harness can supply an offline relay.
function serve({ boot, offline = false, extra = {} } = {}) {
  for (const method of ['log', 'debug', 'info', 'warn', 'trace']) console[method] = () => {};
  const controller = new AbortController(), waiting = new Map();
  let seat, sequence = 0;
  const send = message => { if (process.connected) process.send(message); };
  const report = event => send({ kind: 'event', event });
  const permit = signal => new Promise((resolve, reject) => {
    const id = ++sequence;
    const abort = () => {
      waiting.delete(id); send({ kind: 'permit-release', id });
      reject(Object.assign(Error('Decision cancelled'), { name: 'AbortError' }));
    };
    waiting.set(id, () => {
      signal.removeEventListener('abort', abort);
      resolve(() => send({ kind: 'permit-release', id }));
    });
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort(); else send({ kind: 'permit-request', id });
  });
  const stop = () => {
    controller.abort();
    Promise.resolve(seat?.running).finally(() => process.exit(0));
  };
  for (const event of ['SIGINT', 'SIGTERM', 'disconnect']) process.on(event, stop);
  process.on('message', async message => {
    if (message.kind === 'stop') { stop(); return; }
    if (message.kind === 'permit-granted') {
      const grant = waiting.get(message.id); waiting.delete(message.id);
      if (grant) grant(); else send({ kind: 'permit-release', id: message.id });
      return;
    }
    if (message.kind !== 'rpc') return;
    try {
      let result;
      if (message.op === 'boot') {
        if (seat) throw Error('Seat already booted');
        seat = new MultiSeat(message.data, { signal: controller.signal, report, permit, boot, offline });
        result = await seat.boot();
      } else if (Object.hasOwn(extra, message.op)) result = await extra[message.op](seat, message.data);
      else if (['ready', 'prepareHost', 'bind', 'publish', 'validateGroup', 'join', 'start', 'status'].includes(message.op) && seat) {
        result = await seat[message.op](message.data);
      } else throw Error('Unknown seat operation');
      send({ kind: 'result', id: message.id, result });
    } catch (error) { send({ kind: 'result', id: message.id, error: error.message }); }
  });
}
if (require.main === module) serve();
module.exports = serve;
