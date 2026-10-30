// Framework debug output contains private deck material. Only structured events go to stdout.
const report = event => process.stdout.write(JSON.stringify(event) + '\n');
for (const method of ['log', 'debug', 'info', 'warn', 'trace']) console[method] = () => {};
const { setTimeout: delay } = require('node:timers/promises');
const { loadConfig } = require('./config');
const lock = require('./lock');
const { play } = require('./loop');

async function main() {
  const [command, filename, argument] = process.argv.slice(2);
  if (!['doctor', 'list', 'host', 'join', 'resume', 'daemon', 'multi-host', 'multi-join', 'multi-resume'].includes(command) || !filename) {
    process.stdout.write('Usage: npm run runner -- <doctor|list|host|join|resume|daemon|multi-host|multi-join|multi-resume> CONFIG [invite-id|game-id]\n');
    return;
  }
  process.umask(0o077);
  const config = loadConfig(filename);
  // Fail before opening a wallet or accepting an invitation if the local provider
  // cannot start. Listing invites does not require a decision provider.
  const version = command === 'list' ? null : await require('./providers/check')(config.decisionProvider);
  const unlock = lock(config.dataDir);
  const controller = new AbortController();
  for (const event of ['SIGINT', 'SIGTERM']) process.once(event, () => controller.abort());
  try {
    if (command.startsWith('multi-')) {
      await require('./multi').multi(config, command.slice(6), argument, { signal: controller.signal, report });
      return;
    }
    if (command === 'daemon') {
      await require('./daemon').daemon(config, { signal: controller.signal, report });
      return;
    }
    const runtime = await require('./runtime').createRuntime(config, { offline: command === 'doctor' });
    const { app, arcade, mod, adapter } = runtime;

    report({ event: 'wallet', publicKey: mod.publicKey, game: config.game });
    if (command === 'doctor') {
      if (version) report({ event: 'codex', version });
      report({ event: 'ready', dataDir: config.dataDir }); return;
    }
    const started = Date.now();
    while (!(await app.network.getPeers()).some(p => p.publicKey)) {
      if (app.runnerFailure) throw app.runnerFailure;
      if (Date.now() - started > 30000) throw Error('Peer handshake timed out');
      await delay(250, undefined, { signal: controller.signal });
    }
    if (command === 'list') {
      await delay(2000, undefined, { signal: controller.signal });
      for (const record of Object.values(arcade.invites) as any[]) {
        if (record.tx.msg.game === config.game && arcade.isAvailableGame(record.tx)) report({ event: 'invite', id: record.tx.signature, game: record.tx.msg.game, players: record.tx.msg.players.length });
      }
      return;
    }
    if (['host', 'join'].includes(command) && app.options.games.some(g => g.module === config.game && !g.over)) {
      throw Error('This wallet already has an unfinished game; use resume or another dataDir');
    }
    if (command === 'host') {
      const tx = await arcade.createOpenTransaction({ ts: Date.now(), name: config.game,
        options: { game_length: 10, turn_limit: 0, conquest_setup: 'quick', ...config.options },
        players_needed: config.players, invitation_type: 'open' });
      await arcade.receiveOpenTransaction(tx);
      await app.network.propagateTransaction(tx);
      app.connection.emit('relay-send-message', { recipient: 'PEERS', request: 'arcade spv update', data: tx.toJson() });
      report({ event: 'hosted', id: tx.signature });
    } else if (command === 'join') {
      if (!argument) throw Error('join needs an invite id');
      const deadline = Date.now() + 20000;
      while (!arcade.returnGame(argument) && Date.now() < deadline) await delay(250, undefined, { signal: controller.signal });
      const invite = arcade.returnGame(argument);
      if (!require('./daemon-policy').compatible(invite, [config.game], mod.publicKey, Date.now(), config.players)) throw Error('Matching compatible open invite not found; check game, players and invitation options');
      await arcade.sendJoinTransaction(invite);
    } else {
      await require('./resume')(runtime, argument);
    }
    await play(runtime, config, { signal: controller.signal, report });
    app.storage.saveOptions();
  } finally { unlock(); }
}
main().then(() => process.exit(0)).catch(error => {
  console.error(error.name === 'AbortError' ? 'Runner stopped; state saved.' : error.stack);
  process.exit(error.name === 'AbortError' ? 0 : 1);
});
