// Refresh Arcade's snapshot as well as listening to live Relay updates. Removing
// absent entries prevents a missed cancellation from becoming a stale join.
module.exports = function discovery({ app, arcade, runExclusive }) {
  const request = app.network.sendRequestAsTransaction.bind(app.network);
  const service = arcade.onPeerServiceUp.bind(arcade);
  let peer, lastRefresh = 0, requestedAt = 0;
  app.network.sendRequestAsTransaction = (name, data, callback, ...rest) => {
    if (name !== 'arcade invite list') return request(name, data, callback, ...rest);
    const began = Date.now(); requestedAt = began;
    return request(name, data, async rows => {
      if (!Array.isArray(rows)) return;
      try {
        await runExclusive(async () => {
          for (const [id, record] of Object.entries(arcade.invites)) {
            if (record.updated_at <= began) delete arcade.invites[id];
          }
          await callback(rows);
          lastRefresh = Date.now();
        });
      } catch (error) { app.connection.emit('runner-error', error); }
    }, ...rest);
  };
  arcade.onPeerServiceUp = async (a, p, s) => {
    if (s.service === 'arcade') peer = p;
    return service(a, p, s);
  };
  return {
    get lastRefresh() { return lastRefresh; },
    async refresh(interval) {
      if (peer && Date.now() - requestedAt >= interval) await service(app, peer, { service: 'arcade' });
    }
  };
};
