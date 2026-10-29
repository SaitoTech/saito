const { createHash } = require('node:crypto');
function decision(game, revision, observation, actions) {
  observation = JSON.parse(JSON.stringify(observation));
  const choices = actions.map((action, index) => ({ id: String(index), ...action }));
  const id = createHash('sha256').update(JSON.stringify({ game, revision, observation, choices })).digest('hex');
  return { id, game, observation, choices };
}
function selected(current, id, choiceId) {
  if (!current || current.id !== id) throw Error('Stale decision');
  const choice = current.choices.find(c => c.id === choiceId);
  if (!choice) throw Error('Invalid choice');
  return choice;
}
function hasPending(mod) {
  return Object.values(mod.app?.options?.runnerOutbox || {}).some(json => {
    const msg = typeof json.msg === 'object' ? json.msg : null;
    // toJson uses a base64 message buffer; inspect via the framework transaction.
    const body = msg || new (require('../../lib/saito/transaction').default)(undefined, json).returnMessage();
    return body.module === mod.name && body.game_id === mod.game.id &&
      body.step?.game > (mod.game.step?.players?.[mod.publicKey] || 0);
  });
}
module.exports = { decision, selected, hasPending };
