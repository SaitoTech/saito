// Optional local audit of each seat's already-filtered decision. Never records
// wallet keys, provider credentials, encrypted deck order or opponent hands.
if (process.env.SETTLERS_TRACE_DIR) {
  const fs = require('node:fs'), path = require('node:path');
  const Adapter = require('../lib/games/settlers');
  const { requestFor } = require('../lib/providers/decision-format');
  const submit = Adapter.prototype.submit;
  Adapter.prototype.submit = async function(id, choiceId) {
    const d = this.current(), choice = d?.choices.find(c => c.id === choiceId);
    const record = choice && { time: new Date().toISOString(), game: this.mod.game.id,
      seat: this.mod.game.player, decisionId: id, observation: d.observation, choice,
      requestBytes: Buffer.byteLength(JSON.stringify(requestFor(d))) };
    const result = await submit.call(this, id, choiceId);
    if (record) fs.appendFileSync(path.join(process.env.SETTLERS_TRACE_DIR, `decisions-${process.pid}.jsonl`), JSON.stringify(record) + '\n', { mode: 0o600 });
    return result;
  };
}
