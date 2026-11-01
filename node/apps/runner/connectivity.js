// A fresh Arcade RPC proves the Saito connection is usable. A cached peer key
// or a successful HTTP request alone does not prove relay connectivity.
module.exports = function connectivity(app) {
  const request = app.network.sendRequestAsTransaction.bind(app.network);
  return (signal, timeoutMs = 10000) => new Promise((resolve, reject) => {
    let finished = false;
    const finish = (value, error) => {
      if (finished) return;
      finished = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(value);
    };
    const abort = () => finish(false, Object.assign(Error('Connection check cancelled'), { name: 'AbortError' }));
    const timer = setTimeout(() => finish(false), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    Promise.resolve().then(() => app.network.getPeers()).then(peers => {
      const keys = peers.map(p => p.publicKey).filter(Boolean);
      if (!keys.length) { finish(false); return; }
      for (const key of keys) {
        if (finished) break;
        Promise.resolve().then(() => request('arcade invite list', {}, rows => {
          if (Array.isArray(rows)) finish(true);
        }, key)).catch(() => {}); // Another peer may still answer; otherwise time out.
      }
    }).catch(() => finish(false));
  });
};
