// Probe the selected decision connection without opening a wallet or joining a game.
const { loadConfig } = require('../lib/config');
const { providerFor } = require('../lib/loop');
const checkProvider = require('../lib/providers/check');
async function checkDecision(filename) {
  const config = loadConfig(filename);
  await checkProvider(config.decisionProvider);
  const choice = await providerFor(config.decisionProvider).choose({
    game: 'Connection test',
    observation: { game: 'Connection test', goal: 'Choose the action that wins immediately.' },
    choices: [
      { id: 'win', action: { result: 'Immediate victory' }, score: 1 },
      { id: 'lose', action: { result: 'Immediate defeat' }, score: 0 }
    ]
  });
  return { event: 'decision-check', provider: config.decisionProvider.type, choice };
}
if (require.main === module) {
  const filename = process.argv[2];
  if (!filename) { console.error('Usage: node apps/runner/scripts/check-decision.js CONFIG'); process.exitCode = 1; }
  else checkDecision(filename).then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error(error.message); process.exitCode = 1;
  });
}
module.exports = { checkDecision };
