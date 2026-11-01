const test = require('node:test');
const assert = require('node:assert/strict');
const { DaemonPolicy } = require('../../../apps/runner/daemon-policy');
const run = require('../../../apps/runner/daemon-session');

function fixture() {
  const sent = [], joined = [];
  const config = { pollMs: 1, daemon: { mode: 'ask', games: ['Conquest'],
    consentTimeoutMs: 600000, refreshMs: 30000, community: false } };
  const record = id => {
    const msg = { module: 'Arcade', request: 'open', game: 'Conquest',
      players: [id + '-host'], players_needed: 2, timestamp: Date.now() - 5000, options: {} };
    return { status: 'open', tx: { signature: id, from: [{ publicKey: msg.players[0] }],
      msg, returnMessage() { return this.msg; }, toJson() { return '{}'; } } };
  };
  const runtime = {
    app: { options: { wallet: { publicKey: 'bot' }, games: [] }, storage: { saveOptions() {} },
      network: { async propagateTransaction(tx) { joined.push(tx.signature); } }, connection: { emit() {} } },
    arcade: { invites: { first: record('first'), second: record('second') },
      returnGame(id) { return this.invites[id]; }, async createJoinTransaction(tx) { return tx; } },
    chat: { messages: [], refreshHistory() {}, presentSince() { return false; },
      async send(host, channel, text) { sent.push({ host, channel, text }); return true; } },
    mod: { game: {} }, discovery: { lastRefresh: Date.now(), async refresh() {} },
    runExclusive: fn => fn(), async retransmit() {}
  };
  return { runtime, config, sent, joined };
}

test('startup and game completion offer existing snapshot invites without a new live invite', async () => {
  const f = fixture(), controller = new AbortController();
  const send = f.runtime.chat.send.bind(f.runtime.chat);
  f.runtime.chat.send = async (host, channel, text) => {
    await send(host, channel, text);
    if (text.startsWith('I am a bot.')) f.runtime.chat.messages.push({
      sender: host, channel, text: 'yes', timestamp: Date.now()
    });
    return true;
  };
  const settings = { signal: controller.signal, report() {}, boot: async () => f.runtime,
    playGame: async runtime => { runtime.mod.game.over = true; } };
  const first = await run(f.config, { mode: 'watch' }, settings);
  assert.equal(first.id, 'first');
  assert.deepEqual(f.joined, [], 'consent alone does not bypass the play-session availability check');
  const next = await run(f.config, first, settings);
  assert.deepEqual(next, { mode: 'watch' });
  const second = await run(f.config, next, settings);
  assert.equal(second.id, 'second');
  assert.deepEqual(f.joined, ['first']);
  assert.deepEqual(f.sent.filter(m => m.text.startsWith('I am a bot.')).map(m => m.host), ['first-host', 'second-host']);
});

test('a never-asked invite that vanished is offered when available after restart', async () => {
  const f = fixture(), now = Date.now();
  // First host is being asked; second invite is queued, then disappears.
  await new DaemonPolicy(f.runtime, f.config).tick(now);
  const second = f.runtime.arcade.invites.second;
  delete f.runtime.arcade.invites.second;
  await new DaemonPolicy(f.runtime, f.config).tick(now + 1);
  assert.equal(f.runtime.app.options.runnerDaemon.invites.second.status, 'unavailable');
  delete f.runtime.arcade.invites.first;
  f.runtime.arcade.invites.second = second;
  await new DaemonPolicy(f.runtime, f.config).tick(now + 2);
  assert.equal(f.sent.at(-1).host, 'second-host');
  assert.match(f.sent.at(-1).text, /Should I take your Conquest invite/);
});

test('returning invites do not repeat declined, expired, completed or interrupted questions', async () => {
  for (const status of ['declined', 'expired', 'complete', 'unavailable']) {
    const f = fixture(), now = Date.now();
    delete f.runtime.arcade.invites.second;
    await new DaemonPolicy(f.runtime, f.config).tick(now);
    f.runtime.app.options.runnerDaemon.invites.first.status = status;
    assert.equal(await new DaemonPolicy(f.runtime, f.config).tick(now + 1), null);
    assert.equal(f.sent.length, 1, status);
  }
});
